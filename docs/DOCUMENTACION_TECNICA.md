# Documentación técnica final — E-commerce OpenMind

## 1. Visión general

Plataforma de comercio electrónico para emprendedores, desarrollada bajo SCRUM. Incluye una **tienda pública** (catálogo, carrito, checkout, seguimiento de pedidos) y un **panel de administración** (productos, pedidos, promociones, pagos, envíos, informes, configuración visual).

**Principio de despliegue: una instalación, una tienda.** Cada emprendedor recibe una instalación independiente, con una sola tienda y almacenamiento propio. El backend busca "la única tienda local" y falla si hay ninguna o varias. Detalle: [`scrum-44-identificacion-interna-tienda.md`](scrum-44-identificacion-interna-tienda.md) y [`sprint7/SCRUM-484-configuracion-postgresql.md`](sprint7/SCRUM-484-configuracion-postgresql.md).

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

Los casos de uso no dependen directamente de SDKs ni de proveedores: se comunican con ellos mediante adaptadores reemplazables. Detalle: [`scrum-32-adaptadores-integracion.md`](scrum-32-adaptadores-integracion.md).

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
| PostgreSQL | Datos transaccionales: tienda, usuarios, pedidos, promociones, carrito y configuración de cada módulo | [`sprint7/SCRUM-484-configuracion-postgresql.md`](sprint7/SCRUM-484-configuracion-postgresql.md) |
| MongoDB | Catálogo: colecciones `productos` (con variantes e imágenes) y `plantillas_atributos`; control atómico de stock | [`sprint7/SCRUM-485-configuracion-mongodb.md`](sprint7/SCRUM-485-configuracion-mongodb.md), [`scrum-36-modelo-mongodb.md`](scrum-36-modelo-mongodb.md) |

MongoDB no tiene clave foránea hacia PostgreSQL: cada documento lleva `tienda_id` y la aplicación valida la relación.

### 3.4 Estándar de la API

Todas las respuestas usan un formato JSON común (`exito`, `mensaje`, `data`, y `paginacion` en listados; en errores, el detalle de validación). Detalle: [`scrum-34-estandar-api.md`](scrum-34-estandar-api.md).

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
| Requisitos de instalación (hardware, versiones, puertos, servicios externos) | [`requisitos-instalacion.md`](requisitos-instalacion.md) |
| Primera ejecución, variables de entorno y actualización | [`../EJECUCION_LOCAL.md`](../EJECUCION_LOCAL.md) |
| Configuración del backend | [`sprint7/SCRUM-483-configuracion-backend.md`](sprint7/SCRUM-483-configuracion-backend.md) |
| Configuración del frontend | [`sprint7/SCRUM-482-configuracion-frontend.md`](sprint7/SCRUM-482-configuracion-frontend.md) |
| Credenciales externas: inventario, custodia y rotación | [`sprint7/SCRUM-487-credenciales-externas.md`](sprint7/SCRUM-487-credenciales-externas.md) |

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

1. **Servicios necesarios:** backend Django, frontend compilado (`npm run build`), PostgreSQL y MongoDB con persistencia y respaldos (ver [SCRUM-484](sprint7/SCRUM-484-configuracion-postgresql.md) y [SCRUM-485](sprint7/SCRUM-485-configuracion-mongodb.md), secciones de respaldo).
2. **Variables obligatorias:** `DJANGO_SECRET_KEY` propia y `DJANGO_DEBUG` desactivado; `DJANGO_ALLOWED_HOSTS`, `DJANGO_CORS_ALLOWED_ORIGINS` y `DJANGO_CSRF_TRUSTED_ORIGINS` con el dominio real; contraseñas de bases de datos distintas de las de desarrollo.
3. **HTTPS:** activar `DJANGO_SECURE_SSL_REDIRECT` y `DJANGO_SECURE_HSTS_SECONDS` una vez que el certificado esté operativo.
4. **Correo:** configurar un SMTP real (`EMAIL_BACKEND`, `EMAIL_HOST*`) y `STOREFRONT_PUBLIC_URL` con la URL pública.
5. **Credenciales externas:** generar y custodiar `PAYMENT_CREDENTIALS_KEY` y las claves de pasarelas según [SCRUM-487](sprint7/SCRUM-487-credenciales-externas.md). 
6. **Pagos:** cambiar Transbank de ambiente *Integración* a *Producción* con las credenciales comerciales reales, solo cuando el cliente las entregue.
7. **Una tienda por instalación:** verificar que la tabla `tienda` tenga exactamente una fila.
8. **Verificación posterior:** repetir los casos de [`pruebas-regresion-final/pruebas-regresion.md`](pruebas-regresion-final/pruebas-regresion.md) sobre la instalación desplegada.


## 7. Integraciones externas

| Ámbito | Proveedor / mecanismo | Código | Documento |
| --- | --- | --- | --- |
| Pagos | Transbank Webpay Plus (ambientes Integración y Producción) | `catalog/infrastructure/adapters/transbank_adapter.py` | [`sprint7/SCRUM-487-credenciales-externas.md`](sprint7/SCRUM-487-credenciales-externas.md) |
| Pagos | Transferencia bancaria con aprobación manual | `core/payments.py` | [`scrum-319-320-transferencias.md`](scrum-319-320-transferencias.md) |
| Pagos | Linkify | `linkify_adapter.py`, `core/infrastructure/linkify_client.py` | [`scrum-319-320-transferencias.md`](scrum-319-320-transferencias.md) |
| Pagos | Mercado Pago y PayPal: adaptadores presentes, aún no habilitados para compras en el checkout | `mercadopago_adapter.py`, `paypal_adapter.py`, `core/payments.py` | — |
| Envíos | Chilexpress, Starken y retiro en tienda | `apps/shipping`, `catalog/infrastructure/adapters/` | [`shipping-quotes.md`](shipping-quotes.md), [`retiro-tienda-estructurado.md`](retiro-tienda-estructurado.md), [`sprint7/SCRUM-500-pruebas-integracion-logistica.md`](sprint7/SCRUM-500-pruebas-integracion-logistica.md) |
| Correo | SMTP configurable; Mailpit en desarrollo | `core/infrastructure/email_service.py` | [`correo-despacho.md`](correo-despacho.md) |
| Autenticación | Google (inicio de sesión) | `authentication/presentation` | [`sprint7/SCRUM-487-credenciales-externas.md`](sprint7/SCRUM-487-credenciales-externas.md) |

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

**Registros de QA**

| Registro | Documento |
| --- | --- |
| Revisión y mejora general del Frontend — Sprint 8 (SCRUM-508) | [`sprint8/SCRUM-508-revision-general-frontend.md`](sprint8/SCRUM-508-revision-general-frontend.md) |
| Pruebas de regresión del sprint 7 (automatizadas y manuales, con capturas) | [`pruebas-regresion-final/pruebas-regresion.md`](pruebas-regresion-final/pruebas-regresion.md) |
| QA final SCRUM-455/456 | [`qa-final-scrum455456/INFORME-QA-FINAL.md`](qa-final-scrum455456/INFORME-QA-FINAL.md) |
| Revisión integral de estabilidad | [`revision-integral-estabilidad.md`](revision-integral-estabilidad.md) |
| Pruebas de integración logística | [`sprint7/SCRUM-500-pruebas-integracion-logistica.md`](sprint7/SCRUM-500-pruebas-integracion-logistica.md) |
| Verificación de accesibilidad | [`sprint7/SCRUM-495-revision-accesibilidad.md`](sprint7/SCRUM-495-revision-accesibilidad.md) |
| Verificación de carga inicial (< 2,5 s) | [`sprint7/SCRUM-473-verificacion-carga-inicial.md`](sprint7/SCRUM-473-verificacion-carga-inicial.md) |
| Verificación responsive | [`sprint7/verificacion-requisitos-responsive.md`](sprint7/verificacion-requisitos-responsive.md) |
| Revisión de criterios de las 17 HU | [`sprint7/SCRUM-502-revision-criterios-HU.md`](sprint7/SCRUM-502-revision-criterios-HU.md) |

## 9. Índice de documentos de `docs/`

| Categoría | Documentos |
| --- | --- |
| Instalación y configuración | [`requisitos-instalacion.md`](requisitos-instalacion.md), [`sprint7/SCRUM-482-configuracion-frontend.md`](sprint7/SCRUM-482-configuracion-frontend.md), [`sprint7/SCRUM-483-configuracion-backend.md`](sprint7/SCRUM-483-configuracion-backend.md), [`sprint7/SCRUM-484-configuracion-postgresql.md`](sprint7/SCRUM-484-configuracion-postgresql.md), [`sprint7/SCRUM-485-configuracion-mongodb.md`](sprint7/SCRUM-485-configuracion-mongodb.md), [`sprint7/SCRUM-487-credenciales-externas.md`](sprint7/SCRUM-487-credenciales-externas.md) |
| Arquitectura y datos | [`scrum-32-adaptadores-integracion.md`](scrum-32-adaptadores-integracion.md), [`scrum-34-estandar-api.md`](scrum-34-estandar-api.md), [`scrum-36-modelo-mongodb.md`](scrum-36-modelo-mongodb.md), [`scrum-43-propiedad-emprendedor-tienda.md`](scrum-43-propiedad-emprendedor-tienda.md), [`scrum-44-identificacion-interna-tienda.md`](scrum-44-identificacion-interna-tienda.md), [`scrum-137-asociacion-emprendedor-tienda.md`](scrum-137-asociacion-emprendedor-tienda.md), [`scrum-138-identificacion-tienda-solicitudes.md`](scrum-138-identificacion-tienda-solicitudes.md) |
| Pagos, envíos y correos | [`scrum-319-320-transferencias.md`](scrum-319-320-transferencias.md), [`shipping-quotes.md`](shipping-quotes.md), [`retiro-tienda-estructurado.md`](retiro-tienda-estructurado.md), [`retiro-tienda-manual.md`](retiro-tienda-manual.md), [`correo-despacho.md`](correo-despacho.md) |
| Catálogo y panel | [`develop-integration-productos.md`](develop-integration-productos.md), [`producto-editor-consistencia-visual.md`](producto-editor-consistencia-visual.md), [`SCRUM-374-375-historial.md`](SCRUM-374-375-historial.md), [`dashboard-interactivo.md`](dashboard-interactivo.md), [`dashboard-operativo-sprint5.md`](dashboard-operativo-sprint5.md), [`dashboard-analitico-checkout.md`](dashboard-analitico-checkout.md) |
| Configuración visual y UX | [`sprint8/SCRUM-508-revision-general-frontend.md`](sprint8/SCRUM-508-revision-general-frontend.md), [`visual-config-etapa-1.md`](visual-config-etapa-1.md), [`visual-config-etapa-3.md`](visual-config-etapa-3.md), [`visual-config-etapa-4-final.md`](visual-config-etapa-4-final.md), [`editor-emprendedor-ux-noche-1.md`](editor-emprendedor-ux-noche-1.md), [`panel-emprendedor-ux-ayudas.md`](panel-emprendedor-ux-ayudas.md), [`frontend-plantilla-1.md`](frontend-plantilla-1.md) |
| QA y validaciones | Ver sección 8, más [`SCRUM-58-validacion.md`](SCRUM-58-validacion.md), [`SCRUM-236-251-252-validacion.md`](SCRUM-236-251-252-validacion.md), [`auditoria-merge-09c2b0c.md`](auditoria-merge-09c2b0c.md), [`resolucion-conflictos-develop.md`](resolucion-conflictos-develop.md) |
| Historial de entregas | [`sprint4-entregas.md`](sprint4-entregas.md) |