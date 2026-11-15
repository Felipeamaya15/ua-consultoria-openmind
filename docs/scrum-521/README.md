# SCRUM-521 · Marketing

## Arquitectura y reutilización

Marketing conserva `ContentPicker`, `DesignStudio`, `PublicationPreview`, el historial por plantilla, los borradores locales, la exportación PNG/JPG y `Sharing`. No se cambia el acceso **Crear publicación** de Productos. Campañas, Correos, pedidos, pagos y las cuatro plantillas de tienda mantienen sus implementaciones.

La biblioteca utiliza los modelos existentes `RecursoMultimedia` y `ArchivoMultimedia`, sus validadores de archivos y la deduplicación SHA-256 por tienda. La galería del catálogo consulta el listado administrativo ya autorizado; no importa ni vuelve a subir fotos. `publicationImages` prioriza `imagenes`/`imagen` de la variante si el documento las proporciona, elimina URLs repetidas y conserva las imágenes generales. El catálogo actual normalmente comparte imágenes entre variantes; este trabajo no incorpora un segundo editor de fotos de variantes.

Servicios y talleres reutilizan el flujo de **Difusión → Preparar imagen** y su comprobación de secciones publicadas. La biblioteca ofrece un acceso a ese mismo flujo. Las secciones ocultas o canceladas no se ofrecen para difusión.

`SocialStatus` consulta la configuración existente de contacto. Distingue perfiles activos, desactivados y ausentes. Un perfil registrado no equivale a una autorización OAuth para publicar. La configuración sigue en Página principal → Contacto y horarios. Copiar, descargar, abrir un enlace y compartir manualmente conservan sus mensajes reales, sin afirmar una publicación externa.

## Contrato de biblioteca

Todos los endpoints privados requieren token de un propietario activo y la tienda resuelta por el servidor. El cliente no selecciona una tienda mediante parámetros. Las respuestas conservan `Cache-Control: private, no-store` y `nosniff`.

| Endpoint | Comportamiento |
| --- | --- |
| `GET /api/landing/biblioteca/` | Paginación existente de 24 recursos; búsqueda y filtros antes de paginar. |
| `GET /api/landing/biblioteca/<uuid>/` | Consulta privada del recurso para preparar o recuperar una composición. |
| `GET /api/landing/biblioteca/<uuid>/imagen/` | Bytes autenticados del archivo existente; sin credenciales en la URL. |
| `POST /api/landing/biblioteca/` | Subida y validaciones existentes; se conserva la deduplicación física. |
| `PATCH /api/landing/biblioteca/<uuid>/` | Edición y activación existentes. |
| `DELETE /api/landing/biblioteca/<uuid>/` | Rechaza con 400 si existen referencias de secciones, carrusel o video de producto; en otro caso conserva la eliminación lógica existente. |

Parámetros opcionales del listado:

| Parámetro | Valores |
| --- | --- |
| `pagina` | Entero entre 1 y 10000; predeterminado 1. |
| `q` | Hasta 180 caracteres; título, descripción o URL, sin distinguir mayúsculas. |
| `tipo` | `imagen`, `video`, `youtube`, `instagram`, `facebook`, `enlace`. |
| `estado` | `activo`, `inactivo`, o vacío para ambos. |
| `orden` | `recientes` (predeterminado), `nombre`; desempate estable por ID. |

El formato de respuesta sigue siendo `{exito, data: {resultados, total, pagina, por_pagina}}`. Cada recurso añade `usos`, una lista de secciones/carrusel para advertir de referencias guardadas, incluidas las ocultas. La comprobación de videos de producto se ejecuta al eliminar y consulta únicamente el catálogo de la tienda resuelta. Un fallo al comprobar sus referencias impide la eliminación.

## Imágenes privadas y borradores

Una composición iniciada desde biblioteca guarda `{kind: 'library', id: '<uuid>'}`. Los bytes se consultan con autenticación y se convierten a una imagen en memoria para el renderer existente. No se añade el recurso a la publicación pública ni a la lista de fuentes públicas de Difusión. Al abrir el borrador y antes de exportar se vuelve a validar su disponibilidad. Reabrir la misma referencia también fuerza la consulta.

El almacenamiento de borradores conserva referencias y ajustes; no conserva fotos, precios, respuestas de API ni tokens. Las referencias guardadas exclusivamente en un navegador no pueden descubrirse desde el servidor: si el propietario elimina un recurso sin referencias de servidor, un borrador local informa su indisponibilidad al recuperarse. No se borran físicamente los archivos compartidos.

## Pruebas reutilizables y entorno QA

No hay cambios de esquema ni migraciones nuevas. Nunca ejecutar la preparación QA sobre la base habitual.

- `backend/apps/landing/test_scrum521.py`: filtros sobre todo el conjunto, privacidad, propietario activo, borrado protegido, catálogo y deduplicación física.
- `frontend/tests/scrum521.cjs`: imágenes por variante/oferta, referencias privadas, contrato del servicio y validación antes de reutilizar.
- `backend/scripts/scrum521.postman_collection.json`: colección local con base fija `http://127.0.0.1:8002`; token mediante entorno externo.
- `backend/config/qa_scrum521.py`: exige PostgreSQL y MongoDB con prefijo `scrum521_qa_`, salida externa obligatoria y transporte de correo local.
- `backend/scripts/scrum521_qa.py`: fixtures sintéticas idempotentes; guarda `qa-session.json` bajo `SCRUM521_QA_OUTPUT`.
- `frontend/tests/scrum521-vite.mjs`: inicia el frontend QA en 5211, o compila con argumento `build`; caché y compilación se escriben fuera del repositorio.
- `frontend/tests/scrum521-browser.cjs`: navegador → API → bases QA reales, con bloqueo de destinos externos, tamaños 1440/768/390 y salidas externas obligatorias. Incluye un error 503 inyectado únicamente en el transporte local para comprobar reintento.

Definir `SCRUM521_QA_OUTPUT` como una ruta externa al checkout, en Windows `C:\Users\maria\Ecommerce\Evidencias_SCRUM-521`. En el contenedor QA montar esa carpeta y usar, por ejemplo, `/qa-evidence`. Definir también `PYTHONDONTWRITEBYTECODE=1` para evitar cachés Python en el checkout. Preparar bases exclusivas, aplicar allí las migraciones existentes y ejecutar el seed mediante `manage.py shell`, usando `config.qa_scrum521`. Iniciar su servidor en 8002, sin sustituir el backend habitual.

Desde `frontend/`, con las dependencias instaladas:

```powershell
$env:SCRUM521_QA_OUTPUT='C:\Users\maria\Ecommerce\Evidencias_SCRUM-521'
node tests/scrum521-vite.mjs
# En otra terminal, definir la misma variable y una instalación de Playwright:
$env:DASHBOARD_PLAYWRIGHT_MODULE='<ruta al módulo playwright>'
node tests/scrum521-browser.cjs
node --test tests/scrum521.cjs tests/marketing.cjs tests/marketing-editor.cjs tests/marketing-drafts.cjs tests/marketing-navigation.cjs tests/media-library.cjs tests/sharing.cjs tests/social-profiles.cjs tests/multimedia-final.cjs
npm run typecheck
node tests/scrum521-vite.mjs build
```

Desde la raíz, con el entorno Postman privado almacenado fuera del checkout:

```powershell
postman collection run backend/scripts/scrum521.postman_collection.json -e "$env:SCRUM521_QA_OUTPUT/postman-qa-environment.json" --no-report-events
```

Los resultados de ejecución, capturas, descargas, registros y el informe de aceptación pertenecen exclusivamente a la carpeta externa de evidencias. Esta carpeta del repositorio contiene únicamente documentación técnica mantenible.
