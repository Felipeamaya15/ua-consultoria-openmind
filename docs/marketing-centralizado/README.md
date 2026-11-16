# Marketing centralizado

Marketing reúne Publicaciones, Biblioteca multimedia, Difusión y Campañas. Contactos mantiene sus filtros, consentimiento y exportaciones. `/emprendedor/contactos?vista=campanas` redirige a `/emprendedor/marketing#campanas`; los hashes `#biblioteca` y `#difusion` seleccionan sus apartados. El hash anterior `#redes-sociales` abre Contacto y horarios. Gmail y su autorización permanecen en `/emprendedor/landing#informacion-negocio`.

El editor, sus formatos, historial y borradores locales siguen siendo los existentes. Las campañas reutilizan `CampaignWorkspace`, `campaignService`, las rutas `/api/tienda/campanas/`, sus modelos y su cola. No hay migraciones ni almacenamiento paralelo.

## Fuentes y selección

`PublishedContentPicker` y Difusión usan `fetchSharingSources`: catálogo administrativo autorizado cruzado con catálogo público, secciones visibles y recursos publicados. Productos incluye también Destacados; la búsqueda ignora mayúsculas y acentos. Las secciones antiguas con nombre interno de servicios/talleres también se reconocen. Se excluyen productos no disponibles y actividades ocultas o canceladas.

El contrato anterior de campañas sigue disponible. El POST/PUT admite además `contenido`, opcional:

```json
{
  "producto_id": "0123456789abcdef01234567",
  "contenido": {
    "kind": "product",
    "id": "0123456789abcdef01234567",
    "skus": ["ROJO"],
    "images": [0, 1]
  },
  "diseno": {"plantilla": "feature"}
}
```

Para servicios/talleres se usa `kind: "section"`, UUID de sección, `producto_id: ""` y `skus: []`. Variantes vacías seleccionan todas las disponibles. Las imágenes son índices únicos de la galería, con un máximo de seis. Los datos comerciales se resuelven en el servidor: no se aceptan precios, HTML o nombres enviados como parte de la selección. Se comprueban tienda, publicación, stock, precios y flags de variantes.

La copia se guarda en el campo JSON `producto` existente, con `seleccion`, `tipo`, `descripcion`, `imagenes`, `url` y variantes cuando corresponden. Reabrir o editar texto conserva la copia ya guardada y el historial; elegir otra selección vuelve a resolver los datos. Las campañas confirmadas conservan su contenido inmutable.

`diseno.recurso_id` reutiliza una imagen activa de la biblioteca de la tienda. El servidor lee el archivo permitido y guarda su imagen validada; el transporte existente la incorpora como CID. El recurso privado no se convierte en público. Las URLs registradas de imágenes se conservan como referencias remotas, sin descargas desde el servidor.

`diseno.plantilla` admite `photo`, `feature` y `minimal`, los identificadores del editor de publicaciones. El correo mantiene título, descripción, precio CLP y enlaces como texto accesible. El logo y color proceden de la configuración de marca existente. Las rutas `/media/` se resuelven sobre el host público de la API. Los productos nuevos enlazan por slug; las copias anteriores con solo ID resuelven el slug vigente, con catálogo como alternativa si el producto ya no está disponible.

## Validación reproducible

- Backend: `python manage.py test apps.landing.test_marketing_centralizado` y regresiones existentes de campañas, consentimiento, Gmail, biblioteca y fuentes de catálogo.
- Frontend: pruebas existentes `marketing`, `marketing-editor`, `marketing-drafts`, `marketing-navigation`, `sharing`, `scrum521` y `scrum522` con `node --test`.
- API: `backend/scripts/marketing-centralizado.postman_collection.json`, adaptada de la colección SCRUM-522. Solo lecturas y rechazo de OAuth sin autorización; requiere entorno privado local con `qaBaseUrl` y `ownerToken`. No publicar resultados.
- Navegador: `frontend/tests/marketing-centralizado-browser.cjs`; requiere Edge/Playwright existente, `MARKETING_QA_OUTPUT` fuera del checkout y la fixture `backend/scripts/marketing_centralizado_qa.py`. El runner solo admite frontend 5211, API 8002 y buzón QA 8026. Se bloquean todas las solicitudes externas.

`config.qa_marketing` rechaza bases PostgreSQL/MongoDB sin prefijo `marketing_qa_`, deshabilita correo externo y fija Mailpit. Crear bases y contenedores dedicados, montar `MARKETING_QA_OUTPUT` fuera del repositorio y aplicar únicamente las migraciones existentes en esas bases. Las pruebas Django crean su base `test_marketing_qa_*`. La fixture genera exclusivamente datos sintéticos y escribe `qa-session.json` fuera del checkout. Para Vite se reutiliza `tests/scrum521-vite.mjs` con `SCRUM521_QA_OUTPUT` externo, tanto servidor como build.

Gmail real y publicación externa requieren integraciones y autorización independientes. Estas pruebas no conectan cuentas reales ni equivalen a una prueba de entrega en Gmail.
