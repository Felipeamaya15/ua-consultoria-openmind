# SCRUM-483 — Configuración y ejecución del backend

Fecha: 2026-10-28. Fuente: archivos reales de esta rama. Alcance oficial localizado: Excel `Backlog_Ecommerce 1.xlsx`, hoja `Backlog_Ecommerce`, fila 411, BL-409, «Documentar configuración del backend.», sprint 7. El archivo no incluye IDs SCRUM ni criterios particulares del ticket. La equivalencia por título con SCRUM-483 requiere confirmación Jira.

Este documento complementa [ejecución local](../../EJECUCION_LOCAL.md), [correo](../correo-despacho.md), [cotizaciones](../shipping-quotes.md), [identificación de tienda](../scrum-138-identificacion-tienda-solicitudes.md) y [adaptadores](../scrum-32-adaptadores-integracion.md). No reemplaza esos contratos. RNF-04 de la ERS exige instrucciones para una futura instalación; el equipo no realiza el paso a producción.

## Componentes y dependencias

Backend Django + DRF en `backend/`, punto de entrada `manage.py`, settings `config.settings`, WSGI `config.wsgi.application`. Docker usa Python 3.11 slim y `build-essential/libpq-dev`. `requirements.txt` es la fuente de versiones: Django >=5,<6; DRF; corsheaders; psycopg2-binary; python-dotenv; pymongo >=4.6,<5; Pillow; pillow-heif; google-auth; requests; cryptography; reportlab; openpyxl; pypdf. Instalar el archivo completo, no una selección de paquetes. HEIC requiere que pillow-heif y sus binarios compatibles estén disponibles en la plataforma de instalación.

PostgreSQL conserva usuarios Django, tienda, pedidos, pagos, configuración, promociones y datos relacionales. MongoDB contiene catálogo flexible y stock del catálogo; no es opcional para gestionar/comprar productos. Compose usa `postgres:15-alpine` y `mongo:latest` (esta última etiqueta no fija versión). Volúmenes persistentes: `postgres_data`, `mongo_data`; las imágenes se guardan fuera de esos volúmenes.

## Variables: nombres, procedencia y diferencias

Crear `.env` privado en la raíz a partir de `.env.example` y sustituir todos los ejemplos. No versionar valores reales ni copiar credenciales de documentación. Compose lee `.env` para interpolar; `manage.py` y settings **no cargan automáticamente** ese archivo. En ejecución Python directa deben exportarse las variables del proceso con los nombres de Django, no los alias de Compose.

| Raíz `.env` / Compose | Variable que recibe Django | Uso |
|---|---|---|
| `DJANGO_SECRET_KEY` | `SECRET_KEY` | Clave privada única y estable; no usar fallback de desarrollo |
| `DJANGO_DEBUG` | `DEBUG` | `1` desarrollo, `0` instalación pública |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Base y credenciales PostgreSQL |
| servicio `db`, puerto interno 5432 | `DB_HOST`, `DB_PORT` | Compose los fija; en Python directo usar host/puerto alcanzables |
| `POSTGRES_PORT` | no se pasa a Django | Solo puerto publicado del host, por defecto 5432 |
| `MONGO_USER`, `MONGO_PASSWORD`, `MONGO_DB_NAME` | mismos nombres | Usuario root inicial de Compose y base Mongo |
| servicio `mongodb`, puerto interno 27017 | `MONGO_HOST`, `MONGO_PORT` | Compose los fija; `MONGO_PORT` de raíz cambia solo publicación del host |
| `PAYMENT_CREDENTIALS_KEY` | mismo nombre | Clave Fernet válida para cifrar credenciales; conservarla junto al respaldo seguro |
| `PICKUP_GEOCODING_PROVIDER`, `PICKUP_GOOGLE_GEOCODING_KEY` | mismos nombres | Geocodificación opcional de retiro; clave solo en servidor |
| `EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`, `EMAIL_USE_SSL`, `DEFAULT_FROM_EMAIL` | mismos nombres | Transporte de correo; ver documento específico |
| `STOREFRONT_PUBLIC_URL` | mismo nombre | URL pública base de enlaces de seguimiento en correo |
| `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID` | solo frontend | URL API y client ID público OAuth, nunca un secreto de servidor |

`MONGO_URI` se construye en settings a partir de las variables anteriores y `authSource=admin`; no se lee una variable externa llamada MONGO_URI. No imprimir la URI con credenciales. Elegir usuario/contraseña compatibles con esa construcción (no hay escape de caracteres reservados en el código actual). Cambiar variables de inicialización de las imágenes de bases de datos no cambia usuarios ya existentes en volúmenes persistidos.

Variables adicionales leídas por settings: `EMAIL_TIMEOUT` (10 segundos por defecto) y `COMMERCIAL_CONSENT_FRONTEND_ORIGIN` (origen de enlaces comerciales, localhost:5173 por defecto). **No están propagadas en Compose actual**: para configurarlas allí se necesita un override privado o adaptar explícitamente `environment`. Agregarlas solo al `.env` raíz no basta. No se documentan como variables disponibles `ALLOWED_HOSTS` o `CORS_ALLOWED_ORIGINS`: hoy son listas hardcodeadas, con `['*']` y los dos orígenes localhost:5173/127.0.0.1:5173 respectivamente.

Correo sin configuración utiliza backend de consola; no entrega a una bandeja real. SMTP requiere backend `django.core.mail.backends.smtp.EmailBackend` y datos de proveedor. TLS por defecto sí, SSL por defecto no; SSL desactiva STARTTLS. Mailpit es opcional con perfil `correo`, interfaz 8025, SMTP 1025; dentro de Compose el host SMTP es `mailpit`, no localhost. No enviar correos reales durante tests.

Generación local de una clave Fernet (guardar el resultado en el gestor privado de secretos, nunca en Git):

```powershell
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Perder o rotar esa clave sin migrar los datos cifrados impide recuperar las credenciales guardadas. Los identificadores OAuth de tienda se administran en la configuración de autenticación; no equivalen a un secreto OAuth ni habilitan por sí solos el login comprador del frontend.

## Primera ejecución con Docker Compose

Desde la raíz, después de preparar el entorno privado:

```powershell
docker compose build backend frontend
docker compose up -d db mongodb
docker compose run --rm backend python manage.py migrate
docker compose run --rm backend python manage.py sync_mongo_indexes
docker compose run --rm backend python manage.py createsuperuser
```

Esperar a que ambas bases estén listas antes de los comandos Django; `depends_on` actual no comprueba readiness. `sync_mongo_indexes` crea índices y restricciones de stock: requiere acceso a Mongo y puede rechazar datos históricos incompatibles. Investigar y respaldar esos datos; no borrar bases para conseguir que arranque.

Configurar exactamente **una Tienda** en PostgreSQL y asociar su `id_usuario_propietario` a un usuario Django activo. Un superusuario sin esa relación no tiene acceso al panel de emprendedor. No hay un comando de bootstrap de tienda. En una instalación nueva y vacía, un operador puede usar `python manage.py shell` dentro de `docker compose run --rm backend`, seleccionar el usuario ya creado y crear la relación explícita:

```python
from django.contrib.auth import get_user_model
from apps.core.models import Tienda
owner = get_user_model().objects.get(username="<usuario-creado>")
assert owner.is_active and not Tienda.objects.exists()
Tienda.objects.create(id_usuario_propietario=owner, nombre="<nombre-negocio>")
```

No ejecutar ese ejemplo sobre una instalación con tienda existente. El resolver actual devuelve 503 con cero o varias tiendas; un identificador del cliente nunca selecciona arbitrariamente un tenant. No existe un campo `rol` de emprendedor que sustituya a la relación de propiedad del usuario Django.

```powershell
docker compose up -d backend frontend
docker compose exec backend python manage.py check
docker compose exec backend python manage.py showmigrations
```

Frontend: http://localhost:5173; API: http://localhost:8000; Django admin: /admin/. El comando de arranque backend ejecuta índices Mongo y `runserver 0.0.0.0:8000`; **no ejecuta migraciones PostgreSQL** automáticamente. Si las bases todavía no estaban disponibles, corregir disponibilidad y volver a iniciar. `docker compose down` detiene servicios; no usar `down -v` sobre datos que deban conservarse.

## Ejecución sin Docker

Con Python 3.11, PostgreSQL y Mongo accesibles y las variables **Django** exportadas:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py sync_mongo_indexes
python manage.py check
python manage.py runserver 127.0.0.1:8000
```

Aplicar el mismo bootstrap de tienda únicamente si la instalación está vacía. Los hosts `db`/`mongodb` son DNS internos de Compose y normalmente no resuelven desde Windows: para ejecución directa usar los hosts y puertos reales de las bases. No iniciar una segunda instancia con otra base por accidente.

## API, medios y persistencia

`config/urls.py`: `/api/auth/`, `/api/catalog/`, `/api/`, `/api/visual-config/`, `/api/landing/`, `/api/logistica/` y rutas de variantes de compatibilidad. DRF usa TokenAuthentication y SessionAuthentication; las vistas privadas comprueban propietario. No hay un endpoint universal de health documentado en este router; usar `check`, conexión de bases y una consulta pública de catálogo/configuración para verificar instalación, además de pruebas de permisos.

`MEDIA_ROOT=backend/media`, `MEDIA_URL=/media/`, almacenamiento `config.media.CompatibleImageStorage`. Nuevos uploads se guardan bajo `media/landing/images`, `logos` o `blocks`. Imágenes históricas bajo `backend/landing/{images,logos,blocks}` se leen en compatibilidad, sin copiarlas ni borrarlas. Servidor de desarrollo publica únicamente árboles acotados JPG/JPEG/PNG/WebP mediante `/media/landing/...` y `/landing/...`, con protección de traversal; HEIC se convierte al procesar el upload. Límite global de cuerpo Django: 16 MiB; los bloques aplican límites adicionales propios. No publicar el directorio completo `backend/` como media.

El bind mount `./backend:/app` persiste archivos en el host en desarrollo. Una imagen backend desplegada sin ese bind necesita almacenamiento persistente para media y reglas de servicio equivalentes, incluyendo URLs heredadas. Respaldar PostgreSQL, Mongo, media actual, imágenes históricas y secretos de cifrado por separado; no versionar dumps ni adjuntos. Una copia de base sin sus imágenes y clave Fernet no constituye un respaldo completo.

## Antes de una instalación pública

Compose actual es de desarrollo: usa Vite, `runserver`, bind mounts, puertos de bases publicados, Mongo sin versión fijada, hosts abiertos y CORS local. No es un despliegue productivo certificado. El proveedor aún debe definir servidor WSGI (no viene Gunicorn en requirements), proxy HTTPS/TLS, hostname, CORS y CSRF de su dominio, servicio de estáticos y media con DEBUG=0, volúmenes/backups y política de secretos. `STATIC_ROOT` no está definido: no afirmar que `collectstatic` funciona sin preparar settings de despliegue.

Preparar configuración específica del proveedor con DEBUG=0, SECRET_KEY única, hosts/orígenes explícitos y credenciales restringidas; no resolver CORS abriéndolo indiscriminadamente. Instalar dependencias, restaurar respaldos si corresponde, aplicar `migrate`, sincronizar índices Mongo y verificar propietario/tienda antes de abrir tráfico. Ejecutar `python manage.py check --deploy` con settings productivos y resolver sus advertencias. Las credenciales reales y certificación de Transbank/Linkify/transportistas/Google y SMTP son pasos externos; no se deducen de tests simulados. PayPal/Mercado Pago y cotización comercial en vivo requieren implementación pendiente según los contratos actuales, no solo secretos.

## Comprobaciones técnicas

```powershell
docker compose exec backend python manage.py check
docker compose exec backend python manage.py makemigrations --check --dry-run
docker compose exec backend python manage.py test apps.authentication apps.catalog apps.core apps.landing apps.visual_config apps.shipping config.test_media --noinput
```

Los tests necesitan PostgreSQL con permiso para base de test; los casos Mongo requieren su base temporal y permisos para crearla/eliminarla. No ejecutarlos con credenciales productivas. No correr scripts históricos que escriban datos de demostración sobre una tienda real. Los resultados ejecutados durante este trabajo se registran en SCRUM-503/504; este bloque documenta comandos y prerrequisitos.

Estado documental: contenido solicitado preparado desde el código real. Aceptación formal **PARCIAL** mientras falten descripción/criterios exactos Jira y validación del procedimiento en una instalación vacía; la instalación existente no demuestra un despliegue nuevo ni producción.

$path = "docs/sprint7/SCRUM-483-configuracion-backend.md"

@'

## Verificación del entorno existente — 30 de octubre de 2026

Comprobaciones ejecutadas sobre la rama feature/SCRUM-466-483-502-503-504:

- `docker compose ps`: backend, frontend, PostgreSQL y MongoDB en ejecución.
- `python manage.py check`: sin problemas.
- `python manage.py makemigrations --check --dry-run`: sin cambios pendientes.
- `python manage.py showmigrations`: todas las migraciones listadas como aplicadas.
- `python manage.py check --deploy`: cinco advertencias de seguridad propias de la configuración actual de desarrollo (HSTS, redirección HTTPS, cookies de sesión y CSRF, DEBUG).

Compose advierte que PAYMENT_CREDENTIALS_KEY no está definida. Es necesario configurar una clave Fernet válida y persistente antes de utilizar funciones que cifren credenciales comerciales.

Esta verificación acredita el estado del entorno local existente. No certifica una instalación limpia, un despliegue productivo ni integraciones comerciales externas.

Estado: documentación técnica preparada y verificación local realizada. Permanecen pendientes la prueba de instalación desde cero y la configuración específica del proveedor de producción.
'@ | Add-Content -Path $path -Encoding UTF8