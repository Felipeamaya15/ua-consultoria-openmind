# Documentación técnica final — E-commerce OpenMind

## 1. Visión general

Plataforma de comercio electrónico para emprendedores, desarrollada bajo SCRUM. Incluye una **tienda pública** (catálogo, carrito, checkout, seguimiento de pedidos) y un **panel de administración** (productos, pedidos, promociones, pagos, envíos, informes, configuración visual).

**Principio de despliegue: una instalación, una tienda.** Cada emprendedor recibe una instalación independiente, con una sola tienda y almacenamiento propio. El backend busca "la única tienda local" y falla si hay ninguna o varias. Detalle: [`arquitectura/identificacion-interna-tienda.md`](arquitectura/identificacion-interna-tienda.md) y [`instalacion-y-configuracion/configuracion-postgresql.md`](instalacion-y-configuracion/configuracion-postgresql.md).

## 2. Stack tecnológico

| Capa | Tecnología | Fuente |
| --- | --- | --- |
| Frontend | React 18, TypeScript 5, Vite 5, Tailwind CSS 4, React Router 7 | `frontend/package.json` |
| Backend | Python, Django 5 y Django REST Framework | `backend/requirements.txt` |
| Base relacional | PostgreSQL 15 | `docker-compose.yml` |
| Base documental | MongoDB | `docker-compose.yml` |
| Correo en desarrollo | Mailpit | `docker-compose.yml` |
| Contenedores | Docker y Docker Compose | `docker-compose.yml` |
| Seguridad de contraseñas | Argon2 | `backend/requirements.txt` |

## 3. Arquitectura

### 3.1 Capas y adaptadores

El backend se organiza en apps de Django que siguen, en lo posible, la separación **domain / application / infrastructure / presentation** (arquitectura hexagonal):

- **presentation:** vistas, serializadores y rutas de la API.
- **application:** casos de uso.
- **domain:** entidades, validaciones y errores propios del negocio.
- **infrastructure:** repositorios, clientes y adaptadores hacia servicios externos.

Los casos de uso no dependen directamente de SDKs ni de proveedores: se comunican con ellos mediante adaptadores reemplazables. Detalle: [`arquitectura/adaptadores-integracion.md`](arquitectura/adaptadores-integracion.md).

### 3.2 Apps del backend (`backend/apps/`)

| App | Responsabilidad | Prefijo de API |
| --- | --- | --- |
| `authentication` | Registro, login, tokens, permisos | `/api/auth/` |
| `catalog` | Productos, carrito, stock, adaptadores de pago | `/api/catalog/` |
| `core` | Tienda, pedidos, checkout, promociones, pagos, informes, correos, consentimiento y textos legales | `/api/` |
| `shipping` | Cotización y seguimiento con operadores logísticos | `/api/logistica/` |
| `visual_config` | Configuración visual y plantillas | `/api/visual-config/` |
| `landing` | Página de inicio de la tienda | `/api/landing/` |

### 3.3 Persistencia híbrida

| Base | Qué guarda | Documento |
| --- | --- | --- |
| PostgreSQL | Datos transaccionales: tienda, usuarios, pedidos, promociones, carrito y configuración de cada módulo | [`instalacion-y-configuracion/configuracion-postgresql.md`](instalacion-y-configuracion/configuracion-postgresql.md) |
| MongoDB | Catálogo: colecciones `productos` (con variantes e imágenes) y `plantillas_atributos`; control atómico de stock | [`instalacion-y-configuracion/configuracion-mongodb.md`](instalacion-y-configuracion/configuracion-mongodb.md), [`arquitectura/modelo-mongodb.md`](arquitectura/modelo-mongodb.md) |

MongoDB no tiene clave foránea hacia PostgreSQL: cada documento lleva `tienda_id` y la aplicación valida la relación.

### 3.4 Estándar de la API

Todas las respuestas usan un formato JSON común (`exito`, `mensaje`, `data`, y `paginacion` en listados; en errores, el detalle de validación). Detalle: [`arquitectura/estandar-api.md`](arquitectura/estandar-api.md).

## 4. Estructura del repositorio

```text
ua-consultoria-openmind/
├── backend/                  # Django + DRF
│   ├── apps/                 # authentication, catalog, core, landing, shipping, visual_config
│   ├── config/               # settings.py y urls.py
│   └── requirements.txt
├── frontend/                 # React + Vite + TypeScript
│   ├── src/features/         # storefront (tienda pública) y admin (panel)
│   ├── src/services/         # clientes HTTP hacia la API
│   └── tests/                # pruebas de interfaz (scripts .cjs)
├── docs/                     # documentación técnica y evidencias de QA
├── scripts/                  # utilidades (p. ej. regression-report.ps1)
├── docker-compose.yml        # db, mongodb, backend, frontend, mailpit
├── .env.example              # plantilla de variables de entorno
├── EJECUCION_LOCAL.md        # instalación, ejecución y actualización
└── README.md
```

## 5. Instalación, ejecución y configuración

| Tema | Documento |
| --- | --- |
| Requisitos de instalación (hardware, versiones, puertos, servicios externos) | [`instalacion-y-configuracion/requisitos-instalacion.md`](instalacion-y-configuracion/requisitos-instalacion.md) |
| Primera ejecución, variables de entorno y actualización | [`../EJECUCION_LOCAL.md`](../EJECUCION_LOCAL.md) |
| Configuración del backend | [`instalacion-y-configuracion/configuracion-backend.md`](instalacion-y-configuracion/configuracion-backend.md) |
| Configuración del frontend | [`instalacion-y-configuracion/configuracion-frontend.md`](instalacion-y-configuracion/configuracion-frontend.md) |
| Credenciales externas: inventario, custodia y rotación | [`instalacion-y-configuracion/credenciales-externas.md`](instalacion-y-configuracion/credenciales-externas.md) |

**Servicios y puertos en desarrollo (Docker Compose):**

| Servicio | Puerto | Uso |
| --- | --- | --- |
| `frontend` | 5173 | Tienda y panel |
| `backend` | 8000 | API y `/admin` de Django |
| `db` | (interno) | PostgreSQL |
| `mongodb` | (interno) | MongoDB |
| `mailpit` | 8025 (web), 1025 (SMTP) | Bandeja de correos de prueba |

**Variables de entorno** (plantilla `.env.example`; nombres, sin valores):

| Grupo | Variables |
| --- | --- |
| Django | `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_CORS_ALLOWED_ORIGINS`, `DJANGO_CSRF_TRUSTED_ORIGINS`, `DJANGO_SECURE_SSL_REDIRECT`, `DJANGO_SECURE_HSTS_SECONDS` |
| Cifrado de credenciales de pago | `PAYMENT_CREDENTIALS_KEY` |
| PostgreSQL | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` |
| MongoDB | `MONGO_USER`, `MONGO_PASSWORD`, `MONGO_DB_NAME` |
| Frontend | `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID` |
| Google | `GOOGLE_CLIENT_ID` |
| Geocodificación de retiro | `PICKUP_GEOCODING_PROVIDER`, `PICKUP_GOOGLE_GEOCODING_KEY` |
| Correo | `DEFAULT_FROM_EMAIL`, `STOREFRONT_PUBLIC_URL` (y `EMAIL_BACKEND`, `EMAIL_HOST*` para SMTP real) |

Por defecto el correo se escribe en consola (`console.EmailBackend`); para enviarlo de verdad se configura SMTP.

## 6. Despliegue en producción

> **Estado: parcial.** El manual específico depende del hosting que se decida.

### 6.1 Lista de verificación independiente del proveedor

1. **Servicios necesarios:** backend Django, frontend compilado (`npm run build`), PostgreSQL y MongoDB con persistencia y respaldos (ver [Configuración PostgreSQL](instalacion-y-configuracion/configuracion-postgresql.md) y [Configuración MongoDB](instalacion-y-configuracion/configuracion-mongodb.md), secciones de respaldo).
2. **Variables obligatorias:** `DJANGO_SECRET_KEY` propia y `DJANGO_DEBUG` desactivado; `DJANGO_ALLOWED_HOSTS`, `DJANGO_CORS_ALLOWED_ORIGINS` y `DJANGO_CSRF_TRUSTED_ORIGINS` con el dominio real; contraseñas de bases de datos distintas de las de desarrollo.
3. **HTTPS:** activar `DJANGO_SECURE_SSL_REDIRECT` y `DJANGO_SECURE_HSTS_SECONDS` una vez que el certificado esté operativo.
4. **Correo:** configurar un SMTP real (`EMAIL_BACKEND`, `EMAIL_HOST*`) y `STOREFRONT_PUBLIC_URL` con la URL pública.
5. **Credenciales externas:** generar y custodiar `PAYMENT_CREDENTIALS_KEY` y las claves de pasarelas según [Credenciales externas](instalacion-y-configuracion/credenciales-externas.md). 
6. **Pagos:** cambiar Transbank de ambiente *Integración* a *Producción* con las credenciales comerciales reales, solo cuando el cliente las entregue.
7. **Una tienda por instalación:** verificar que la tabla `tienda` tenga exactamente una fila.
8. **Verificación posterior:** ejecutar la suite de pruebas del backend (`manage.py test`) y el build/verificación del frontend sobre la instalación desplegada.


## 7. Integraciones externas

| Ámbito | Proveedor / mecanismo | Código | Documento |
| --- | --- | --- | --- |
| Pagos | Transbank Webpay Plus (ambientes Integración y Producción) | `catalog/infrastructure/adapters/transbank_adapter.py` | [`instalacion-y-configuracion/credenciales-externas.md`](instalacion-y-configuracion/credenciales-externas.md) |
| Pagos | Transferencia bancaria con aprobación manual | `core/payments.py` | — |
| Pagos | Linkify | `linkify_adapter.py`, `core/infrastructure/linkify_client.py` | — |
| Pagos | Mercado Pago y PayPal: adaptadores presentes, aún no habilitados para compras en el checkout | `mercadopago_adapter.py`, `paypal_adapter.py`, `core/payments.py` | — |
| Envíos | Chilexpress, Starken y retiro en tienda | `apps/shipping`, `catalog/infrastructure/adapters/` | — |
| Correo | SMTP configurable; Mailpit en desarrollo | `core/infrastructure/email_service.py` | — |
| Autenticación | Google (inicio de sesión) | `authentication/presentation` | [`instalacion-y-configuracion/credenciales-externas.md`](instalacion-y-configuracion/credenciales-externas.md) |

## 8. Pruebas y calidad

**Cómo ejecutarlas**

```powershell
# Backend (suite completa)
docker compose exec backend python manage.py test apps --noinput

# Frontend (tipos y compilación)
cd frontend
npm run typecheck
npm run build
```

Las pruebas de interfaz del frontend son scripts en `frontend/tests/` expuestos como `npm run test:*` (informes, panel, editor, configuración visual, flujo de compra).

## 9. Índice de documentos de `docs/`

| Categoría | Documentos |
| --- | --- |
| Instalación y configuración | [`instalacion-y-configuracion/requisitos-instalacion.md`](instalacion-y-configuracion/requisitos-instalacion.md), [`instalacion-y-configuracion/configuracion-frontend.md`](instalacion-y-configuracion/configuracion-frontend.md), [`instalacion-y-configuracion/configuracion-backend.md`](instalacion-y-configuracion/configuracion-backend.md), [`instalacion-y-configuracion/configuracion-postgresql.md`](instalacion-y-configuracion/configuracion-postgresql.md), [`instalacion-y-configuracion/configuracion-mongodb.md`](instalacion-y-configuracion/configuracion-mongodb.md), [`instalacion-y-configuracion/credenciales-externas.md`](instalacion-y-configuracion/credenciales-externas.md) |
| Arquitectura y datos | [`arquitectura/adaptadores-integracion.md`](arquitectura/adaptadores-integracion.md), [`arquitectura/estandar-api.md`](arquitectura/estandar-api.md), [`arquitectura/modelo-mongodb.md`](arquitectura/modelo-mongodb.md), [`arquitectura/identificacion-interna-tienda.md`](arquitectura/identificacion-interna-tienda.md) |