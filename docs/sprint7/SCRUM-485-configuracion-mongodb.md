# SCRUM-485 — Configuración de MongoDB

Fecha: 2026-10-30. Fuente: archivos reales de la rama `develop` (commit `fba6a48`). Alcance: Base documental del catálogo de OpenMind E-commerce.

| Campo | Detalle |
| --- | --- |
| Ticket | SCRUM-485 · Documentar configuración de MongoDB |
| Backlog | BL-411 |
| Componente | Base de datos documental (servicio `mongodb`) |
| Versión del código | Rama `develop`, commit `fba6a48` |
| Fecha | 30 de octubre de 2026 |
| Estado | Listo para validación |
| Relacionado | `EJECUCION_LOCAL.md` y los documentos SCRUM-482, SCRUM-484 y SCRUM-487 |

## 1. Propósito y alcance

Este documento describe cómo está configurado MongoDB: el servicio de Docker, la conexión con el backend, las colecciones y sus campos, los índices y la validación de stock, el tratamiento de las imágenes, el acceso para consultar datos y los respaldos.

- **Incluye:** servicio, conexión, colecciones, índices, imágenes, consultas, respaldo y problemas frecuentes.
- **No incluye:** PostgreSQL (SCRUM-484), las credenciales externas (SCRUM-487) ni la instalación de producción.

> **Una instalación, una tienda**
>
> Cada emprendedor recibe una instalación independiente. Todos los documentos de MongoDB llevan el campo `tienda_id` con el `id_tienda` de PostgreSQL escrito como texto (por ejemplo `"7"`), y las consultas siempre lo incluyen.

## 2. Rol de MongoDB en el sistema

- Guarda el **catálogo**: la colección `productos` (con sus variantes e imágenes) y `plantillas_atributos`. Son las dos únicas colecciones que usa el código.
- Controla el **stock** de forma atómica al comprar y lo restituye si el pedido falla.
- No guarda pedidos ni usuarios: eso vive en PostgreSQL (SCRUM-484).
- Solo el backend accede, con la librería `pymongo` (versión 4.6 o superior y menor que 5).

## 3. Servicio de Docker

| Parámetro | Valor |
| --- | --- |
| Imagen | `mongo:latest` (sin versión fija) |
| Nombre del contenedor | `mongo_consultoria` |
| Reinicio | `always` |
| Variables de arranque | `MONGO_INITDB_ROOT_USERNAME` (de `MONGO_USER`), `MONGO_INITDB_ROOT_PASSWORD` (de `MONGO_PASSWORD`) y `MONGO_INITDB_DATABASE` (de `MONGO_DB_NAME`) |
| Puerto | `${MONGO_PORT:-27017}:27017`: publicado en el computador (por omisión 27017) |
| Volumen | `mongo_data` montado en `/data/db` |
| Acceso del backend | Por la red de Compose, con host `mongodb` y puerto `27017` |

> **Importante**
>
> El usuario administrador se crea solo cuando el volumen está **vacío**: cambiar `MONGO_USER` o `MONGO_PASSWORD` después en `.env` no modifica el usuario existente y el backend dejaría de conectarse. Además, `mongo:latest` puede traer una versión distinta al reconstruir; en producción conviene **fijar una versión** y probarla antes.

## 4. Variables y conexión

| Variable en `.env` | Llega al backend como | Valor de ejemplo (`.env.example`) | Valor por defecto en `settings.py` |
| --- | --- | --- | --- |
| `MONGO_USER` | `MONGO_USER` | `admin_mongo` | `mongoadmin` |
| `MONGO_PASSWORD` | `MONGO_PASSWORD` | `REEMPLAZAR_CON_PASSWORD_MONGO` (debe cambiarse) | `secretpassword` |
| `MONGO_DB_NAME` | `MONGO_DB_NAME` | `consultoria_nosql` | `logs_db` |
| (fijo en Compose) | `MONGO_HOST=mongodb` | `mongodb` | `mongodb` |
| (fijo en Compose) | `MONGO_PORT=27017` | `27017` | `27017` |

Los valores por defecto de `settings.py` son solo de desarrollo y **no deben usarse en otros entornos**.

```text
MONGO_URI = mongodb://<usuario>:<clave>@<host>:<puerto>/?authSource=admin
```

- El usuario y la clave se escapan con `quote_plus`, así que admiten caracteres especiales.
- El cliente (`MongoClient`) se crea **una vez por proceso**, con `serverSelectionTimeoutMS=5000`, y la base se elige con `MONGO_DB_NAME`.
- La URI **no admite opciones de TLS ni el formato `mongodb+srv`**. Un servicio gestionado como MongoDB Atlas exigiría cambiar el código.

## 5. Colecciones

### 5.1 productos

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `_id` | ObjectId | Identificador del documento |
| `tienda_id` | Texto | `id_tienda` de PostgreSQL; todas las consultas lo incluyen |
| `id_producto` | Número | Vínculo con la tabla `producto` de PostgreSQL (productos creados desde el panel con registro SQL) |
| `nombre` y `slug` | Texto | Nombre y dirección amigable; el `slug` es único por tienda (si existe se agrega `-2`, `-3`...) |
| `descripcion` y `categoria` | Texto | Descripción y categoría del producto |
| `imagenes` | Lista de texto | Imágenes como data URL en base64, o URL o ruta (sección 7) |
| `atributos_generales` | Lista | Objetos `{clave, etiqueta, valor}` comunes al producto |
| `variantes` | Lista | Cada variante: `sku`, `stock`, `precio` y `atributos_variante` (lista `{clave, etiqueta, valor}`) |
| `seo` | Objeto | Datos para buscadores |
| `activo` | Booleano | Baja lógica: `false` oculta el producto |
| `fecha_creacion` | Fecha | Creación del producto |

Ejemplo ilustrativo (las imágenes se abrevian):

```json
{
  "tienda_id": "7",
  "id_producto": 12,
  "nombre": "Polera Manga Corta",
  "slug": "polera-manga-corta",
  "categoria": "Vestuario",
  "imagenes": ["data:image/jpeg;base64,/9j/4AAQ..."],
  "atributos_generales": [{ "clave": "marca", "etiqueta": "Marca", "valor": "UrbanStyle" }],
  "variantes": [{
    "sku": "POL-NEGRA-M", "stock": 10, "precio": 19990,
    "atributos_variante": [{ "clave": "talla", "etiqueta": "Talla", "valor": "M" }]
  }],
  "activo": true
}
```

### 5.2 plantillas_atributos

Define, por tienda y por categoría, qué atributos pide el panel al crear un producto y cuáles generan variantes (`nivel_variante`). Hay una sola plantilla por combinación de `tienda_id` y `categoria`.

## 6. Índices y validación de stock

| # | Colección | Campos | Tipo | Para qué |
| --- | --- | --- | --- | --- |
| 1 | `productos` | `tienda_id`, `activo` | Normal | Listar el catálogo activo |
| 2 | `productos` | `tienda_id`, `categoria` | Normal | Filtrar por categoría |
| 3 | `productos` | `tienda_id`, `slug` | **Único** | Direcciones amigables sin duplicados |
| 4 | `productos` | `tienda_id`, `atributos_generales.clave`, `atributos_generales.valor` | Normal | Filtros por atributo |
| 5 | `productos` | `tienda_id`, `variantes.sku` | **Único parcial** (si existe el SKU) | SKU único por tienda |
| 6 | `productos` | `tienda_id`, `variantes.atributos_variante.clave`, `...valor` | Normal | Filtros por atributo de variante |
| 7 | `plantillas_atributos` | `tienda_id`, `categoria` | **Único** | Una plantilla por categoría |

#### Validación de stock

La colección `productos` tiene un validador `$jsonSchema` (`validationLevel: strict`, `validationAction: error`): `stock` y `variantes[].stock` deben ser enteros mayores o iguales a 0. MongoDB rechaza cualquier escritura que no lo cumpla.

#### Comando sync_mongo_indexes

- Crea los índices y el validador. Es **idempotente**: se puede repetir sin problema.
- Se ejecuta **automáticamente al iniciar el backend** (`sync_mongo_indexes && runserver`).
- Si encuentra productos con inventario inválido, se detiene con un mensaje y **no modifica los datos**. Como está encadenado con `&&`, **el backend no arranca** hasta corregirlos.

```powershell
docker compose exec backend python manage.py sync_mongo_indexes
```

## 7. Imágenes en MongoDB

- **Formatos aceptados:** JPG, PNG, WebP, HEIC y HEIF; un módulo común las procesa y valida antes de guardarlas.
- **Tamaño:** máximo 2 MB por imagen en los productos.
- **Cómo se guardan:** como data URL en base64 dentro de `imagenes`, lo que las hace cerca de un 33 % más grandes. Las URL `http(s)` y las rutas que empiezan con `/` se aceptan tal cual y no se descargan.
- **Límite de MongoDB:** un documento no puede superar los 16 MiB. Con imágenes de 2 MB (unos 2,7 MB en base64), entre 5 y 6 imágenes por producto alcanzarían ese límite (cálculo aproximado).
- Las respuestas del catálogo incluyen las imágenes, así que el peso de cada respuesta crece con ellas.
- Las imágenes de la página de inicio **no** están en MongoDB: son archivos en `backend/media/` (`MEDIA_ROOT`) servidos bajo `/media/`.

> **Atención**
>
> Con base64 la base y las respuestas crecen rápido. Conviene medir el tamaño con productos reales; la mejora natural sería guardar las imágenes como archivos o en un almacenamiento de objetos y dejar en MongoDB solo la URL.

## 8. Operaciones frecuentes

```powershell
# Abrir la consola de MongoDB (mongosh) dentro del contenedor
docker compose exec mongodb sh -c 'mongosh -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin "$MONGO_INITDB_DATABASE"'
```

| Para qué | Comando dentro de mongosh |
| --- | --- |
| Listar las colecciones | `show collections` |
| Contar los productos | `db.productos.countDocuments({})` |
| Contar los productos activos | `db.productos.countDocuments({ activo: true })` |
| Ver un producto sin las imágenes | `db.productos.findOne({}, { nombre: 1, slug: 1, activo: 1 })` |
| Buscar por SKU | `db.productos.find({ "variantes.sku": "POL-NEGRA-M" })` |
| Ver los índices | `db.productos.getIndexes()` |
| Ver el validador de stock | `db.getCollectionInfos({ name: "productos" })[0].options.validator` |
| Salir | `exit` |

Evitar listar documentos completos con `find()`: incluyen las imágenes en base64 y llenan la pantalla.

## 9. Respaldo y restauración

Los comandos de respaldo son los de `EJECUCION_LOCAL.md` (sección 4.1), en PowerShell desde la raíz del proyecto.

```powershell
# Respaldo
docker compose exec mongodb sh -c 'mongodump --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db "$MONGO_INITDB_DATABASE" --out /tmp/openmind-mongo'
docker compose cp mongodb:/tmp/openmind-mongo ./backups/openmind-mongo

# Restauración (en un entorno de prueba o ante una emergencia)
docker compose cp ./backups/openmind-mongo mongodb:/tmp/openmind-mongo
docker compose exec mongodb sh -c 'mongorestore --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --drop /tmp/openmind-mongo'
docker compose exec backend python manage.py sync_mongo_indexes
```

- El respaldo incluye las imágenes en base64, por lo que puede pesar bastante. La carpeta `backups/` está ignorada por Git.
- La restauración es el procedimiento estándar de MongoDB y debe probarse en un entorno de prueba antes de usarla con datos reales.

## 10. Consistencia con PostgreSQL

- El producto puede existir en las dos bases, vinculado por `id_producto`: crear un producto desde el panel genera el registro SQL y el documento de MongoDB.
- Existe además un caso de uso que crea productos **solo en MongoDB** (catálogo con variantes). Por eso el número de productos puede **diferir** entre `producto` (PostgreSQL) y `productos` (MongoDB), sin que sea un error por sí mismo.
- Eliminar un producto marca `activo = false` en ambas bases.
- Cada pedido guarda `producto_mongo_id` en sus líneas; esa referencia debe seguir apuntando a un documento existente, por lo que no deben borrarse documentos con pedidos asociados.

## 11. Seguridad y paso a producción

- **No publicar el puerto 27017 en producción:** quitar el bloque `ports` del servicio `mongodb`.
- Fijar la versión de la imagen y usar contraseñas propias y largas.
- El backend usa el usuario administrador (`root`) de MongoDB. En producción conviene crear un usuario propio con permisos solo sobre la base del catálogo (recomendación).
- Los respaldos contienen todo el catálogo: guardarlos protegidos.
- Sin TLS en la URI, la conexión debe quedar dentro de la red privada de Compose.

## 12. Verificación y problemas frecuentes

|  | Comprobación | Resultado esperado |
| --- | --- | --- |
| [ ] | `docker compose ps` | El servicio `mongodb` está en ejecución |
| [ ] | `docker compose logs --tail=60 backend` | Aparece “Índices del catálogo creados exitosamente” y el servidor arranca |
| [ ] | `db.productos.getIndexes()` | Lista los índices de la sección 6 |
| [ ] | Validador de stock | Presente en la colección `productos` |
| [ ] | Respaldo con `mongodump` | Carpeta creada con archivos `.bson` |

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| `Authentication failed` | La clave de `.env` no es la usada al crear el volumen | Volver al valor original o cambiar la clave dentro de MongoDB |
| Error de selección de servidor (5 s) | MongoDB apagado o host o puerto incorrectos | Revisar `docker compose ps` y `MONGO_HOST` |
| “No se activó la restricción de stock” | Hay productos con inventario inválido | Corregir esos datos y repetir `sync_mongo_indexes`; hasta entonces el backend no arranca |
| `E11000 duplicate key` | Un `slug` o un `sku` repetido en la tienda | Usar otro valor |
| Documento demasiado grande | Producto con demasiadas imágenes pesadas (límite de 16 MiB) | Reducir las imágenes o usar URL |
| El backend se reinicia en bucle | Falla de `sync_mongo_indexes` | `docker compose logs backend` |

## 13. Referencias

- `EJECUCION_LOCAL.md`: levantar (3.1), índices (3.2), respaldos (4.1) y problemas frecuentes (5).
- `docs/scrum-36-modelo-mongodb.md`: diseño original del modelo; muestra `imagenes` como URL, mientras que el código acepta también base64.
- `docs/scrum-44-identificacion-interna-tienda.md`: `tienda_id` como texto.
- `backend/apps/catalog/infrastructure/` (`indexes.py`, `stock_validation.py`, `repositories.py`) y `backend/apps/core/infrastructure/mongo_client.py`.
