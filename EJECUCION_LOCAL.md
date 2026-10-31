# Ejecución local, configuración y mantenimiento del e-commerce OpenMind

Este documento describe cómo configurar, levantar, verificar y actualizar la plataforma e-commerce del equipo OpenMind, basada en **Django REST Framework, React/Vite, PostgreSQL y MongoDB**, utilizando Docker Compose.

**Alcance:** procedimientos para desarrollo e integración local. La configuración actual de `docker-compose.yml` **no es un despliegue de producción**: usa Django `runserver`, el servidor de desarrollo de Vite, volúmenes de código y puertos de bases de datos expuestos en el equipo anfitrión.

## 1. Requisitos previos

> El detalle completo (hardware, versiones, imágenes Docker, dependencias, puertos y servicios externos) está en [`docs/requisitos-instalacion.md`](docs/requisitos-instalacion.md).

- Docker Desktop iniciado y Docker Compose disponible.
- Git y una terminal PowerShell (Windows).
- Puertos **5173** (frontend), **8000** (backend), **5432** (PostgreSQL) y **27017** (MongoDB) disponibles, salvo que se cambien los puertos publicados admitidos por Compose.
- Código del repositorio descargado y ubicado en la raíz del proyecto.

Todos los comandos siguientes se ejecutan desde `ua-consultoria-openmind/`, salvo que se indique lo contrario.

## 2. Variables de entorno — SCRUM-486

### 2.1. Crear el archivo de configuración

```powershell
Copy-Item .env.example .env
```

Editar **`.env`** y sustituir los valores que comienzan con `REEMPLAZAR_` por valores propios. El archivo `.env.example` es una plantilla versionable; **`.env` no debe subirse a Git**.

### 2.2. Variables utilizadas

| Variable en `.env` | Descripción | Configuración |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | Clave secreta de Django; Compose la envía al backend como `SECRET_KEY`. | Obligatoria; única y privada. |
| `DJANGO_DEBUG` | Activa (`1`) o desactiva (`0`) el modo de depuración. Compose la envía como `DEBUG`. | `1` solo en desarrollo; `0` fuera de desarrollo. |
| `PAYMENT_CREDENTIALS_KEY` | Clave Fernet para cifrar credenciales de medios de pago. | Necesaria para operaciones con credenciales cifradas; conservarla entre actualizaciones. |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Nombre, usuario y contraseña de PostgreSQL. | Obligatorias para la base de datos del proyecto. |
| `POSTGRES_PORT` | Puerto de PostgreSQL publicado en el computador. | Opcional; predeterminado `5432`. |
| `MONGO_USER`, `MONGO_PASSWORD`, `MONGO_DB_NAME` | Credenciales y nombre de la base MongoDB. | Obligatorias para el catálogo y los datos NoSQL. |
| `MONGO_PORT` | Puerto de MongoDB publicado en el computador. | Opcional; predeterminado `27017`; dentro de Compose se usa el puerto `27017`. |
| `VITE_API_URL` | URL que utiliza el frontend para llamar a la API. | Local: `http://localhost:8000`. |
| `VITE_GOOGLE_CLIENT_ID` | ID público del cliente OAuth de Google que utiliza React. | Necesaria si se utiliza el inicio de sesión con Google. |
| `DJANGO_ALLOWED_HOSTS` | Lista de hosts autorizados por Django, separados por coma. | Local: `localhost,127.0.0.1,backend,testserver`; definir explícitamente en otros entornos. |
| `DJANGO_CORS_ALLOWED_ORIGINS` | Orígenes web permitidos, separados por coma. | Local: `http://localhost:5173,http://127.0.0.1:5173`. |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Orígenes confiables para solicitudes protegidas por CSRF. | Opcional en desarrollo local; configurar según el dominio y el uso de HTTPS. |
| `DJANGO_SECURE_SSL_REDIRECT` | Redirección de HTTP a HTTPS. | `0` en desarrollo; `1` solo con HTTPS correctamente implementado. |
| `DJANGO_SECURE_HSTS_SECONDS` | Duración de HSTS. | `0` en desarrollo; configurar tras validar HTTPS en el entorno real. |

**Variables para funciones opcionales:**

| Variable | Uso |
| --- | --- |
| `PICKUP_GEOCODING_PROVIDER`, `PICKUP_GOOGLE_GEOCODING_KEY` | Geocodificación de direcciones de retiro; dejar vacías si no se usa. |
| `EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT` | Motor y servidor de correo transaccional. |
| `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | Credenciales del servidor SMTP; nunca versionarlas. |
| `EMAIL_USE_TLS`, `EMAIL_USE_SSL` | Seguridad de transporte del correo; configurar según el proveedor. |
| `DEFAULT_FROM_EMAIL` | Dirección o nombre del remitente. |
| `STOREFRONT_PUBLIC_URL` | URL pública base para enlaces incluidos en los correos de pedidos. |

**Correspondencia interna:** `docker-compose.yml` convierte las variables `POSTGRES_*` en `DB_NAME`, `DB_USER` y `DB_PASSWORD` para Django; asigna `DB_HOST=db`, `DB_PORT=5432` y `MONGO_HOST=mongodb`. Estos nombres son los nombres de servicios de Docker, **no `localhost`** dentro de los contenedores.

La plantilla también contiene `GOOGLE_CLIENT_ID`, pero la configuración Compose revisada solo pasa `VITE_GOOGLE_CLIENT_ID` al frontend. No asumir que `GOOGLE_CLIENT_ID` se entrega al backend sin modificar Compose.

### 2.3. Generar claves de forma segura

Con Docker disponible, estos comandos generan valores nuevos; **no los pegues en tickets, commits ni capturas**:

```powershell
# Valor para DJANGO_SECRET_KEY
docker compose run --rm --no-deps backend python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"

# Valor para PAYMENT_CREDENTIALS_KEY
docker compose run --rm --no-deps backend python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Es necesario editar `.env` con esos valores. **No reemplazar `PAYMENT_CREDENTIALS_KEY` después de cifrar credenciales reales sin un procedimiento de rotación**, pues se perdería la capacidad de descifrar las existentes.

### 2.4. Reglas de seguridad

- Nunca subir a Git `.env`, claves API, contraseñas, tokens ni respaldos de base de datos.
- `VITE_*` queda disponible en el navegador: **no almacenar secretos en variables `VITE_*`**. El ID público OAuth no es una clave privada.
- En un entorno publicado usar `DJANGO_DEBUG=0`, una clave secreta propia, hosts y CORS restringidos y HTTPS correctamente configurado.
- No compartir la salida completa de `docker compose config`, ya que podría incluir credenciales sustituidas desde `.env`.

## 3. Levantar la aplicación — SCRUM-488

### 3.1. Iniciar servicios

```powershell
docker compose up -d --build
docker compose ps
```

Compose levanta cuatro servicios principales: `db` (PostgreSQL), `mongodb`, `backend` (Django) y `frontend` (React/Vite). El backend ejecuta `sync_mongo_indexes` al iniciar, antes del servidor de desarrollo. Si el servicio no inicia, consultar sus logs antes de continuar.

### 3.2. Aplicar migraciones SQL

```powershell
docker compose exec backend python manage.py migrate
```

Si es necesario ejecutar nuevamente la sincronización de índices de MongoDB:

```powershell
docker compose exec backend python manage.py sync_mongo_indexes
```

**Nota:** el comando de índices verifica restricciones de inventario; si encuentra datos inválidos puede detenerse y requerir una corrección de datos controlada. No modifica esos datos automáticamente.

### 3.3. Comprobar los servicios

```powershell
docker compose exec backend python manage.py check
docker compose logs --tail=60 backend
docker compose logs --tail=60 frontend
```

Direcciones locales:

- **Tienda / frontend:** http://localhost:5173
- **API / backend:** http://localhost:8000
- **Administrador Django:** http://localhost:8000/admin/

Para crear una cuenta de administración Django, cuando sea necesario:

```powershell
docker compose exec backend python manage.py createsuperuser
```

Usar `localhost:5173` en lugar de una IP LAN para evitar inconsistencias con los orígenes locales admitidos por autenticación/CORS.

### 3.4. Correo de prueba (opcional)

Sin SMTP configurado, el correo transaccional se imprime en los logs del backend. Para probarlo visualmente con Mailpit, configurar en `.env`:

```dotenv
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=mailpit
EMAIL_PORT=1025
EMAIL_USE_TLS=0
EMAIL_USE_SSL=0
```

Luego ejecutar:

```powershell
docker compose --profile correo up -d mailpit
docker compose up -d --force-recreate backend
```

Buzón de pruebas: http://localhost:8025. Esto no envía correos a destinatarios reales.

### 3.5. Validaciones antes de dar por terminado el despliegue

```powershell
docker compose exec frontend npm run build
powershell -ExecutionPolicy Bypass -File .\scripts\sprint7-qa.ps1
```

El script pertenece a las tareas SCRUM-491 y SCRUM-497 y requiere que se hayan incorporado sus archivos de prueba. Además, revisar manualmente tienda, catálogo, carrito, checkout, pedidos, administración y vista móvil. **No registrar pruebas como aprobadas si no fueron ejecutadas.**

### 3.6. Detener los servicios

```powershell
docker compose down
```

`docker compose down` detiene y elimina los contenedores, pero mantiene los volúmenes declarados. **No ejecutar `docker compose down -v`** si se desea conservar PostgreSQL y MongoDB.

### 3.7. Consideraciones para producción

El procedimiento anterior documenta un **despliegue de desarrollo/integración**, no una instalación segura de producción. Antes de publicar se debe preparar una configuración separada que incluya servidor WSGI/ASGI de producción, compilación/servidor del frontend, proxy inverso con HTTPS/TLS, manejo de archivos estáticos y multimedia, secretos protegidos, respaldos probados, monitorización y restricción de acceso a las bases de datos. No se debe exponer la configuración de desarrollo actual en Internet.

## 4. Actualizar la aplicación — SCRUM-489

Este procedimiento se aplica después de que los cambios hayan sido revisados e integrados a la rama `develop` mediante Pull Request.

### 4.1. Verificar estado y respaldar datos

```powershell
git status
docker compose ps
New-Item -ItemType Directory -Force backups | Out-Null
```

Si existen cambios locales sin confirmar, guardarlos o resolverlos **antes** de cambiar de rama. Hacer respaldos de PostgreSQL y MongoDB antes de aplicar migraciones o actualizar contenedores:

```powershell
# Respaldo binario PostgreSQL dentro del contenedor
docker compose exec db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/openmind-postgres.dump'
docker compose cp db:/tmp/openmind-postgres.dump ./backups/openmind-postgres.dump

# Respaldo MongoDB (si mongodump está instalado en la imagen)
docker compose exec mongodb sh -c 'mongodump --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db "$MONGO_INITDB_DATABASE" --out /tmp/openmind-mongo'
docker compose cp mongodb:/tmp/openmind-mongo ./backups/openmind-mongo
```

Verificar que los respaldos existan y tengan contenido. Si `mongodump` no está disponible, configurar una herramienta de respaldo MongoDB antes de actualizar. La carpeta `backups/` está ignorada por Git en los cambios de Sprint 7; conservar copias adicionales fuera de la máquina.

### 4.2. Descargar la versión aprobada

```powershell
git switch develop
git pull --ff-only origin develop
```

No hacer commits ni push directamente a `develop`. Para crear nuevas funcionalidades utilizar una rama `feature/SCRUM-...` y abrir un PR hacia `develop`.

### 4.3. Reconstruir, migrar y verificar

```powershell
docker compose up -d --build
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py sync_mongo_indexes
docker compose exec backend python manage.py check
docker compose ps
```

Si los archivos de pruebas del Sprint 7 están disponibles:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sprint7-qa.ps1
```

Revisar nuevamente los flujos críticos desde el navegador y registrar versión/commit, fecha, resultado e incidencias en el ticket correspondiente de Jira.

### 4.4. Si ocurre un error

1. Consultar `docker compose logs --tail=100 backend` y el servicio afectado.
2. No borrar volúmenes ni ejecutar migraciones inversas sin evaluar el impacto en los datos.
3. Si la aplicación no es compatible con la actualización, coordinar la restauración del código anterior **y**, cuando corresponda, las bases de datos a partir de respaldos comprobados.
4. Documentar el problema y el procedimiento de recuperación antes de reintentar.

## 5. Problemas frecuentes

| Síntoma | Comprobación recomendada |
| --- | --- |
| Docker no responde | Abrir Docker Desktop y ejecutar `docker compose ps`. |
| Puerto ocupado | Identificar el proceso que ocupa 5173, 8000, 5432 o 27017 y resolver el conflicto. |
| Tablas no encontradas en PostgreSQL | Ejecutar `docker compose exec backend python manage.py migrate`. |
| Error con MongoDB o índices | Revisar `docker compose logs backend`, las credenciales Mongo y `sync_mongo_indexes`. |
| Frontend no se comunica con la API | Revisar `VITE_API_URL`, la URL `http://localhost:8000` y el estado del backend. |
| Problemas CORS o autenticación local | Utilizar `http://localhost:5173` y comprobar `DJANGO_CORS_ALLOWED_ORIGINS` y `DJANGO_ALLOWED_HOSTS`. |
| Error de credenciales de pagos | Comprobar que `PAYMENT_CREDENTIALS_KEY` sea una clave Fernet válida y que no haya cambiado. |
| No llegan correos reales | Confirmar si se usa el backend de consola, Mailpit o un SMTP real. |

---

**Trazabilidad Jira:** SCRUM-486 (variables de entorno), SCRUM-488 (procedimiento de despliegue) y SCRUM-489 (procedimiento de actualización).
