# Revisión de productos, variantes y stock

## Arquitectura observada antes del cambio

- `core.Producto` es una tabla PostgreSQL de productos simples: nombre, precio,
  stock, tienda y activo. Ya incluye `chk_stock_valido` (stock >= 0).
- El catálogo público usa MongoDB: colección `productos`, `_id` ObjectId,
  `tienda_id` cadena, slug y array `variantes`. Cada variante tiene SKU,
  precio, stock independiente y `atributos_variante` (lista de clave/etiqueta/valor).
- `catalog.domain.Variante` valida precio y stock al construirse.
- `ProductRepository.create/update` ya validan el stock. `decrease_stock` usa
  `$elemMatch` y `$gte` en la misma variante, con `$inc` atómico.
- `add_variant/update_variant` no tenían validación de stock ni filtro de tienda.
  `VariantService` existe, pero no tiene un endpoint conectado y su descuento
  todavía usaba la firma antigua del repositorio, sin tienda.
- `ProductoUpdateSerializer` no valida negativos; la restricción SQL los rechaza,
  pero se necesita un error 400 previo a persistir.
- Las rutas administrativas existentes crean/editan productos PostgreSQL. El
  listado/detalle público lee MongoDB. El frontend envía un payload Mongo al POST
  de creación sin token; la ruta `productos/<str:slug>/` también precede a
  `productos/crear/`. Esa integración de CRUD está incompleta y queda fuera de
  estas tareas: no se reemplazan las dos persistencias ni se cambian sus rutas.
- Hay serializers y pruebas antiguos de `VarianteProducto` en core; el modelo y
  sus rutas ya no existen. No se restaura una arquitectura SQL de variantes.

## Contrato previsto

### SCRUM-236

Stock entero no negativo en dominio, serializers y escrituras del repositorio.
Mantener la restricción SQL y añadir validación estricta a la colección Mongo,
permitiendo campos existentes y stock omitido en documentos antiguos. Rechazar
escrituras directas negativas, incluso por fuera del servicio. No normalizar
negativos a cero ni reparar silenciosamente datos.

### SCRUM-251

`PATCH /api/catalog/productos/<ObjectId>/variantes/<sku>/stock/`

Autenticación Token y autorización del propietario de la tienda resuelta.
Body: `{ "stock": 7 }`. Respuesta 200 con el stock persistido, SKU e ID del
producto en `data`; 400 para stock negativo/inválido; 404 para producto o SKU
inexistente en la tienda; 401/403 para acceso no autorizado. Una actualización
sin cambio también es válida. No modifica precio, atributos ni otras variantes.
Reutilizar `VariantService` y `ProductRepository`.

### SCRUM-252: dependencia faltante

No hay una definición persistida por producto de atributos, valores permitidos
ni obligatoriedad. `Product.attributes` es local en el editor y no se envía al
backend. `atributos_generales` son valores de características generales, no
opciones permitidas para variantes. El endpoint público `/atributos/` agrupa los
valores que ya existen en las variantes, por lo que no sirve como autoridad de
validación. `plantillas_atributos` tiene repositorio genérico, pero no un contrato
ni vínculo operativo con el producto. La comprobación de combinaciones repetidas
observada pertenece al serializer SQL antiguo, actualmente no utilizable.

Esta tarea no se declara implementada. Requiere primero guardar la definición
real del producto y conectarla a la creación/edición de variantes Mongo. No se
inventan reglas deducidas de las variantes, atributos nuevos ni datos hardcodeados.


## Resultado y archivos modificados

SCRUM-236 y SCRUM-251 implementadas. SCRUM-252 bloqueada por la definición no
persistida de atributos del producto. No se modificó landing ni frontend.

- `backend/apps/catalog/domain/models.py`: reutiliza `validate_stock` en el dominio.
- `backend/apps/catalog/application/use_cases.py`: valida stock al crear/editar
  producto SQL y al establecer su inventario, incluso sin serializer.
- `backend/apps/catalog/application/services.py`: reutiliza el servicio de
  variantes, propaga tienda resuelta, valida stock y añade la operación `update_stock`.
- `backend/apps/catalog/infrastructure/repositories.py`: stock no negativo en
  add/update de variantes, filtros de tienda, alta por SKU sin duplicados bajo
  concurrencia, actualización atómica con devolución del valor escrito; conserva
  la operación de decremento existente.
- `backend/apps/catalog/infrastructure/stock_validation.py`: nueva regla de
  colección para impedir stock negativo/no entero incluso en escrituras directas.
- `backend/apps/catalog/infrastructure/indexes.py`: instala la regla al sincronizar.
- `backend/apps/catalog/management/commands/sync_mongo_indexes.py`: informa el
  rechazo de activación si hay inventario antiguo inválido, sin repararlo.
- `backend/apps/catalog/presentation/serializers.py`: error 400 en edición SQL
  con stock negativo y entrada validada del PATCH de variante.
- `backend/apps/catalog/presentation/views.py`: PATCH autenticado del propietario.
- `backend/apps/catalog/urls.py`: ruta del nuevo PATCH, sin reemplazar rutas antiguas.
- `backend/apps/catalog/test_inventory.py`: 17 pruebas nuevas.
- `backend/scripts/test_inventory.py`: ejecución reproducible de pruebas aisladas.
- `docs/SCRUM-236-251-252-validacion.md`: revisión, contrato y guía QA.

Las firmas internas de `add_variant`, `update_variant`, `create_variant`,
`update_variant` del servicio y `process_purchase` requieren ahora `tienda_id`
como primer argumento. No había consumidores activos de las firmas antiguas;
se evita que una operación administrativa omita la tienda. El nuevo PATCH usa
el SKU exacto recuperado del producto, sin renombrar variantes históricas.

## Activación y migraciones

No hay cambios de modelos SQL ni migraciones Django nuevas. La restricción SQL
ya estaba definida y aplicada. Mongo necesita activar la validación de colección:

```powershell
docker exec django_backend python manage.py sync_mongo_indexes
```

O desde backend, con sus variables de conexión:

```powershell
python manage.py sync_mongo_indexes
```

El arranque existente de Docker ya ejecuta ese comando. La operación es
idempotente, conserva validadores previos y campos ajenos, y no exige añadir stock
a documentos antiguos que no lo tenían. Requiere stock entero >= 0 cuando existe.
Si encuentra inventario inválido, informa cuántos productos revisar y no altera
los datos. En esta instalación no había productos Mongo ni inventario negativo;
la regla `strict/error` ya quedó activada.

La validación se aplica a inserciones, modificaciones y reemplazos normales,
incluso directamente con PyMongo/Mongo shell. El código no usa
`bypassDocumentValidation`; una cuenta administrativa que desactive reglas o use
ese privilegio explícitamente puede eludir restricciones de Mongo. Eso no es una
operación admitida por esta API.

Referencia de la regla:
[MongoDB: modificar validación de colección](https://www.mongodb.com/docs/manual/core/schema-validation/update-schema-validation/).

## Pruebas ejecutadas

```powershell
docker exec django_backend python scripts/test_inventory.py
```

Resultado: 26 pruebas aprobadas (17 nuevas y 9 existentes de stock Mongo).
El runner utiliza SQLite en memoria para API/SQL y MongoDB real con bases únicas
`test_inventory_*`/`test_scrum236_*` que se eliminan al terminar. No utiliza mocks
como implementación ni escribe datos de pruebas en la tienda. La restricción SQL
también se comprobó en PostgreSQL real, en una transacción revertida: cero y
positivo aceptados; negativos y decremento excesivo rechazados. En Mongo real de
la instalación un insert negativo falló con código 121 y no insertó documentos.

Cobertura: A=10/B=5 → A=7/B=5, lectura pública posterior, repetir el mismo valor,
stock cero, negativos al crear/editar, bypass de servicio/repositorio, escrituras
Mongo directas, decremento excesivo y concurrente, permisos 401/403, tienda ajena,
producto/SKU inexistentes e ID inválido, reglas previas y datos históricos sin stock.

Limitaciones previas encontradas al ampliar la comprobación:

- `MongoTenantTests.test_tienda_id_debe_ser_cadena_decimal_canonica_en_todas_las_operaciones`
  falla en sus 12 casos de `ProductRepository.list_by_store`: esa lectura no
  valida el formato de tienda. No es una regresión de estos cambios; esa función
  no se modificó. El resto de los 9 tests de esa clase pasó.
- Tests/serializers SQL antiguos importan `VarianteProducto`, modelo eliminado.
  También hay tests que importan un repositorio alternativo ya inexistente en
  `apps.catalog.application.infrastructure`. No se afirma que la suite completa
  del repositorio pase ni se restauran estructuras obsoletas para esas pruebas.
- El runner aislado no valida la historia de migraciones PostgreSQL. No hay una
  migración nueva de estas tareas.

## QA manual con Postman

Usar la tienda configurada, su propietario y `Authorization: Token <token>`.
Los IDs ObjectId del catálogo Mongo no son los IDs numéricos SQL.

### SCRUM-236

1. Para un producto SQL existente, enviar:
   `PUT /api/catalog/productos/<id_sql>/actualizar/` con `{"stock": -1}`.
   Debe responder 400. Repetir con stock 0 y positivo: 200.
2. Probar también `PATCH /api/catalog/productos/<id_sql>/stock/`.
   Negativo: 400; cero/positivo: 200.
3. Para una variante Mongo existente, usar el PATCH descrito abajo con -1:
   debe responder 400; volver a consultar el detalle y verificar que no cambió.
4. Las pruebas de creación y bypass SQL/Mongo se ejecutan con el runner anterior.
   El POST de creación pública está incompleto por el conflicto de rutas y
   payload SQL/Mongo explicado en la revisión; no usarlo como evidencia de un
   flujo de creación ya integrado.
5. Para decremento, existe `ProductRepository.decrease_stock(tienda_id, sku,
   cantidad)`; más unidades que las disponibles devuelve False sin descontar.
   `VariantService.process_purchase(tienda_id, sku, cantidad)` informa rechazo.
   No hay endpoint de compra activo que deba inventarse para estas tareas.

### SCRUM-251

1. Obtener un producto Mongo real con `GET /api/catalog/productos/` y después
   `GET /api/catalog/productos/<slug>/`. El detalle muestra ObjectId, SKU y stock.
2. Con un producto que tenga A=10 y B=5, enviar:

```http
PATCH /api/catalog/productos/<ObjectId>/variantes/A/stock/
Authorization: Token <token>
Content-Type: application/json

{"stock": 7}
```

3. Esperar 200 con `data.producto_id`, `data.sku` y `data.stock=7`.
4. Recargar el GET del detalle: A debe tener 7 y B seguir en 5; precio, atributos
   y demás valores se mantienen. La prueba automatizada también verifica el
   documento completo antes/después.
5. Reiniciar backend y repetir el GET: Mongo conserva esos valores. Este PATCH
   no guarda en memoria ni afecta el stock de un producto SQL homónimo.
6. Repetir con SKU inexistente o producto de otra tienda: 404. Otro usuario: 403;
   sin token: 401. El SKU debe ser el exacto devuelto en el detalle.

La instalación inspeccionada no tiene productos Mongo actualmente. No se crearon
productos demo en ella. Si falta un producto real con variantes, ejecutar el
runner para comprobar el caso A/B con datos temporales; la integración del editor
con el CRUD Mongo es una dependencia previa y separada para crear productos desde
el panel. Esta implementación no declara resuelto ese CRUD general.

### SCRUM-252

No puede probarse como completada. Falta guardar y recuperar por producto una
definición real de claves, valores permitidos y obligatoriedad, y conectar esa
definición con los servicios de creación/edición Mongo. Después se podrán validar
atributos inexistentes, extras, faltantes, valores incompatibles y combinaciones
repetidas en creación y actualización. No se usa la lista de variantes existentes
como fuente de valores permitidos, ni se modifica el serializer SQL obsoleto.
