# Requisitos de instalación del e-commerce OpenMind

Este documento lista **qué debe tener instalado y disponible un equipo** antes de instalar y ejecutar la plataforma e-commerce. Está dirigido a cualquier persona con conocimientos técnicos básicos. 

Los pasos para configurar, levantar y actualizar la aplicación están en [`EJECUCION_LOCAL.md`](../EJECUCION_LOCAL.md).

**Alcance:** instalación con Docker Compose en un equipo local o de pruebas.
## 1. Resumen rápido

| Requisito | Obligatorio | Detalle |
| --- | --- | --- |
| Sistema operativo | Sí | Windows 10/11 con WSL 2 ; también macOS o Linux con Docker |
| Docker Desktop + Compose v2 | Sí | Se usa el comando `docker compose` (sin guion) |
| Virtualización habilitada | Sí | Intel VT-x o AMD SVM activada en BIOS |
| Código fuente | Sí | Clonado con Git o descargado como ZIP |
| Terminal | Sí | PowerShell en Windows; terminal estándar en macOS/Linux |
| Puertos libres | Sí | 5173, 8000, 5432 y 27017|
| Conexión a Internet | Sí (instalación) | Descarga de imágenes Docker y paquetes Python/npm |
| Archivo `.env` | Sí | Se crea desde `.env.example` |
| Python y Node.js locales | **No** | Se ejecutan dentro de los contenedores |
| Cuentas/servicios externos | No (opcionales) | Google OAuth, SMTP, geocodificación |

## 2. Hardware y sistema operativo

- **Sistema operativo:** Windows 10/11 de 64 bits es el entorno de referencia (los scripts incluidos están en PowerShell). Docker Desktop también funciona en macOS y Linux.
- **Arquitectura:** x86_64 (AMD/Intel), versión x86_64 de Docker Desktop.
- **Virtualización de CPU:** debe aparecer como *Habilitada* en el Administrador de tareas.
- **WSL 2 (Windows):** instalar con `wsl --install` en PowerShell como administrador, reiniciar, y luego ejecutar `wsl --update` y `wsl --set-default-version 2`.

## 3. Software requerido en el equipo

| Software | Versión | Uso |
| --- | --- | --- |
| Docker Desktop | Versión reciente con Docker Compose v2 | Construye y ejecuta todos los servicios. En Windows, instalar con la opción *Use WSL 2 instead of Hyper-V* |
| Git (opcional si se descarga el ZIP) | Versión reciente | Obtener el código fuente del repositorio |
| Navegador web moderno | Chrome, Edge o Firefox actual | Acceder a la tienda y al panel de administración |

## 4. Componentes que corren dentro de Docker

No es necesario instalarlos en el equipo anfitrión. Las versiones provienen de `docker-compose.yml`, los `Dockerfile` y los archivos de dependencias.

| Servicio | Imagen / base | Puerto local | Descripción |
| --- | --- | --- | --- |
| `db` | `postgres:15-alpine` | 5432 (`POSTGRES_PORT`) | Base de datos relacional (Django ORM) |
| `mongodb` | `mongo:latest` | 27017 (`MONGO_PORT`) | Base NoSQL (catálogo e inventario) |
| `backend` | `python:3.11-slim` | 8000 | Django + Django REST Framework |
| `frontend` | `node:20-slim` | 5173 | React 18 + TypeScript + Vite |
| `mailpit` (opcional) | `axllent/mailpit:latest` | 8025 y 1025 | Buzón de prueba de correo, perfil `correo` |



### 4.1. Dependencias del backend (`backend/requirements.txt`)

Se instalan automáticamente al construir la imagen (`docker compose up -d --build`):

- Django `>=5.0,<6.0` y Django REST Framework `>=3.15.0`
- `django-cors-headers`, `python-dotenv`, `requests`
- `psycopg2-binary` (PostgreSQL; el `Dockerfile` instala además `build-essential` y `libpq-dev`)
- `pymongo` `>=4.6,<5.0` (MongoDB)
- `Pillow` y `pillow-heif` (imágenes)
- `google-auth` (inicio de sesión con Google) y `cryptography` (cifrado Fernet de credenciales de pago)
- `reportlab`, `openpyxl`, `pypdf` (informes PDF/Excel)
- `argon2-cffi` (hash de contraseñas)

`backend/requirements-test.txt` agrega `pypdf` para las pruebas.

### 4.2. Dependencias del frontend (`frontend/package.json`)

Se instalan con `npm install` al construir la imagen:

- React `^18.3.1`, React DOM, `react-router-dom` `^7`, `@react-oauth/google`
- Desarrollo: Vite `^5`, TypeScript `^5`, Tailwind CSS `^4` (`@tailwindcss/vite`), `@vitejs/plugin-react`

## 5. Puertos necesarios

| Puerto | Servicio | Observación |
| --- | --- | --- |
| 5173 | Frontend (Vite) | Usar `http://localhost:5173` |
| 8000 | Backend (Django) | API y `/admin/` |
| 5432 | PostgreSQL | Configurable con `POSTGRES_PORT` |
| 27017 | MongoDB | Configurable con `MONGO_PORT` |
| 8025 / 1025 | Mailpit | Solo con `--profile correo` |

Si algún puerto está ocupado, liberar el proceso que lo usa o cambiar el puerto publicado en `.env`.
## 6. Configuración requerida (variables de entorno)

Antes de levantar el proyecto se debe crear `.env` a partir de la plantilla:

Los valores que comienzan con `REEMPLAZAR_` son **obligatorios**: `DJANGO_SECRET_KEY`, `PAYMENT_CREDENTIALS_KEY`, `POSTGRES_PASSWORD` y `MONGO_PASSWORD`. El detalle de todas las variables y cómo generar las claves está en la sección 2 de [`EJECUCION_LOCAL.md`](../EJECUCION_LOCAL.md). 

## 7. Servicios externos (opcionales)

El e-commerce funciona en local sin estos servicios pero se requieren para funciones importantes indicadas a continuación.

| Servicio | Necesario para | Variables |
| --- | --- | --- |
| Google OAuth (Client ID) | Inicio de sesión con Google | `VITE_GOOGLE_CLIENT_ID` |
| Servidor SMTP | Envío real de correos transaccionales | `EMAIL_*`, `DEFAULT_FROM_EMAIL`, `STOREFRONT_PUBLIC_URL` |
| Google Geocoding | Búsqueda de direcciones de retiro en tienda | `PICKUP_GEOCODING_PROVIDER`, `PICKUP_GOOGLE_GEOCODING_KEY` |
| Transbank Webpay Plus | Pagos con tarjeta (credenciales configuradas desde el panel de administración) | `PAYMENT_CREDENTIALS_KEY` para cifrarlas |

Sin SMTP configurado, los correos se imprimen en los logs del backend.

## 8. Despliegue en producción

Los requisitos anteriores corresponden a una instalación local o de pruebas. Un despliegue requiere una configuración separada (servidor WSGI/ASGI, build estático del frontend, proxy inverso con HTTPS, respaldos, monitorización y bases de datos no expuestas). Ver sección 3.7 de [`EJECUCION_LOCAL.md`](../EJECUCION_LOCAL.md).

## 9. Lista de verificación previa a la instalación

Ejecutar en PowerShell y confirmar que cada comando responde sin error:

```powershell
docker --version
docker compose version
docker info
```

- [ ] Virtualización habilitada y WSL 2 actualizado (Windows)
- [ ] Docker Desktop iniciado y `docker compose version` muestra Compose v2
- [ ] Código fuente obtenido (Git o ZIP)
- [ ] Puertos 5173, 8000, 5432 y 27017 libres
- [ ] `.env` creado desde `.env.example` con los valores `REEMPLAZAR_` sustituidos
- [ ] Conexión a Internet disponible para la primera construcción (`docker compose up -d --build`)

Una vez cumplidos, continuar con la sección 3 de [`EJECUCION_LOCAL.md`](../EJECUCION_LOCAL.md).
