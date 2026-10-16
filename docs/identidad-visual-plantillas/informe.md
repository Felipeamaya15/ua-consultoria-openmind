# OpenMind — Identidad visual de las cuatro plantillas

Fecha: 16 de octubre de 2026. Rama: `feature/mejoras-informes-configuracion`. Revisión inicial: `90dc49b`.

Las cuatro plantillas se comprobaron con la aplicación real en Edge y la API local real, antes y después de corregirlas, a 375, 768 y 1440 px. La comprobación posterior pasó en los 12 recorridos, sin errores JavaScript, imágenes configuradas rotas ni desbordamiento. Los casos destructivos o de guardado utilizaron API simulada o bases de pruebas aisladas; no se modificaron los datos comerciales.

## 1. Causas verificadas

**Duplicación institucional en plantilla 3.** `VisualLayout` renderiza la barra azul compartida mediante `InstitutionalBadge`. Además, `VisualHeader` tenía un bloque negro con las palabras UNIVERSIDAD / Autónoma / de Chile escrito a mano. Ese bloque era otra representación institucional dentro del espacio comercial; no provenía del logo guardado. Se retiró solamente ese bloque. Se conservan la marca institucional de barra/pie y el logo comercial configurado, incluso si el emprendedor eligiera una imagen similar a la institucional.

**Nombres distintos.** La cabecera 1 consumía `config.name`; las cabeceras 2 y 3 decían literalmente Mi Tienda. y Velta. La navegación y el pie de la 4 decían Mi Tienda. Las pantallas de acceso también conservaban nombres de demostración. La plantilla 3 incluía además una firma comercial y una historia ficticia de Velta, con fundadora y año fijos. Se corrigieron esas referencias sin usar la descripción comercial como reemplazo de textos editoriales.

**Precedencia y respuestas asíncronas.** `StoreContext` permitía que nombre, descripción y logo locales rellenaran la identidad antes de recuperar los datos persistidos o si fallaba su consulta. Landing y catálogo se cargaban una sola vez; los resultados de negocio tampoco estaban etiquetados con la identidad para su consumo. Una transición de tienda podía conservar datos anteriores. Estas causas son independientes del diseño de las cuatro cabeceras.

La evidencia real inicial confirmó que el nombre persistido era **Mi tienda** y el título de portada **Bienvenido a MiTienda**. Son campos distintos, no dos versiones del mismo nombre.

## 2. Fuentes y flujo de persistencia

| Información | Fuente y consumo |
|---|---|
| Identidad de instalación/tienda | `StoreIdentityProvider` → GET `/api/visual-config/plantilla-seleccionada/`. El backend resuelve la única tienda de la instalación; no se selecciona tienda mediante parámetros del navegador. |
| Nombre y descripción del negocio | `Tienda` en Django/PostgreSQL → GET/PUT `/api/tienda/configuracion/` → `BusinessInformation`, contexto y lugares comerciales. |
| Logo, imagen, título, descripción de portada, CTA, secciones, contacto y ubicación | `ConfiguracionLanding` en Django/PostgreSQL → GET/PUT `/api/landing/configuracion/` → `LandingPageContent`, `StoreContext`, cuatro portadas y `LandingDetails`. |
| Productos, variantes y precios/ofertas | Catálogo MongoDB, adaptado por `catalogService`. La selección de destacados usa IDs estables persistidos en landing. No se sustituyó por productos de demostración. |
| Colores, tipografías y geometría | Almacenamiento existente por instalación + tienda, con envelope de identidad; overrides generales y por plantilla. `resolveStoreVisualConfig` combina defaults, preset, colores heredados y overrides. `StoreVisualRoot` aplica variables por tamaño de pantalla. |
| Imágenes decorativas y páginas legales | Mismo almacenamiento existente con ámbito de tienda. Logo, portada y marca institucional quedan excluidos de las sustituciones heredadas por índice. |

Página principal conserva sus formularios y servicios: Guardar negocio → PUT autorizado → PostgreSQL → GET; Guardar portada → multipart autorizado → PostgreSQL/archivos → GET. Se añadió únicamente un evento de éxito al servicio de landing para refrescar una vista pública ya montada. Recuperar foco también refresca negocio y landing. No se crearon endpoints ni sistemas de almacenamiento.

Los datos públicos solo se muestran bajo la identidad confirmada a la que pertenece cada respuesta. Se cancelan consultas anteriores y se descartan resultados tardíos. La respuesta de landing debe declarar la misma tienda. Si el negocio no puede consultarse inicialmente, no se publica un nombre antiguo del navegador; los enlaces conservan una etiqueta accesible genérica. Una respuesta válida sin logo o sin landing deja el logo vacío, sin revivir el heredado. Puede mantenerse el último resultado válido de la misma tienda al fallar una actualización.

## 3. Correcciones por plantilla

| Plantilla | Corrección | Presentación conservada |
|---|---|---|
| 1 Editorial | Fuente autoritativa de nombre, descripción y logo; imagen comercial protegida de overrides heredados; nombre largo acotado. | Cabecera editorial, iniciales sin logo, navegación y pie propios. |
| 2 Minimal | Nombre/logo del contexto confirmado y etiqueta accesible; dimensionamiento de marca para nombres largos. | Cabecera flotante redondeada, navegación en píldoras y buscador de portada. |
| 3 Visual | Nombre/logo confirmados; retiro del bloque institucional redundante; firma comercial dinámica; textos e imágenes editoriales sin nombre, fundadora ni antigüedad ficticios. | Cabecera con borde, tipografía serif, historia y composición de producto propias. |
| 4 Catálogo | Nombre comercial en navegación/pie, nombre móvil accesible/visible y logo confirmado. | Barra oscura, cabecera en píldora, icono sin logo y tarjetas particulares. |

Las pantallas de acceso 2/3/4 ahora identifican la tienda real. No cambiaron autenticación, registro, validaciones ni permisos. La descripción del negocio, la descripción de portada y los textos editoriales siguen separados. La historia de la 3 mantiene sus secciones y estilos con texto editorial neutral, sin inventar identidad para el negocio ni añadir un formulario nuevo.

## 4. Archivos modificados

Código:

- `frontend/src/features/storefront/context/StoreContext.tsx`
- `frontend/src/features/landing/services/landingService.ts`
- `frontend/src/features/storefront/components/store/EditorialLayout.tsx`
- `frontend/src/features/storefront/components/store/minimal/MinimalHeader.tsx`
- `frontend/src/features/storefront/components/store/visual/VisualHeader.tsx`
- `frontend/src/features/storefront/components/store/catalog/CatalogHeader.tsx`
- `frontend/src/features/storefront/components/store/catalog/CatalogFooter.tsx`
- `frontend/src/features/storefront/pages/VisualHome.tsx`
- `frontend/src/features/storefront/pages/Login.tsx`

Pruebas nuevas: `store-identity.cjs`, `store-identity-browser.cjs`, `store-identity-real-browser.cjs` en `frontend/tests`. En `legal-pages.cjs` se añadió solamente el mock de `storeInformationService` que faltaba: su cargador CommonJS intentaba cargar `import.meta` del cliente API real. El registro conserva el fallo inicial y la ejecución final con las 20 pruebas aprobadas.

Los tres archivos que ya tenían cambios locales —Promotions.tsx, marketing-browser.cjs y test_merge_compatibility.py— conservan sus hashes SHA-256 originales. Véase `cambios-previos-sha256.json`. No se alteraron backend, migraciones, esquemas, contratos, reglas comerciales, rutas del administrador ni las implementaciones de Marketing e informes.

## 5. Pruebas y resultados

| Verificación | Resultado y evidencia |
|---|---|
| TypeScript y producción | `npm run build` aprobado, incluyendo ambos proyectos TypeScript; `compilacion.txt`. Se mantiene el aviso de Vite de un chunk mayor a 500 kB. |
| Regresión de frontend | 33 suites comprobadas: editor visual/UX, configuración, Página principal, Marketing/editor, informes, dashboard, catálogo, variantes, promociones, carrito/checkout, pedidos, seguimiento, perfiles y legales. `regresion-frontend.txt` conserva la ejecución inicial y las correcciones/reverificaciones finales. |
| Identidad y concurrencia | Prueba nueva sin red: A/B, distintas claves de instalación/tienda, respuestas tardías, abortado, eventos, eliminación de logo, landing nula o ajena, fallos sin fallback local y notificación únicamente tras guardado exitoso. |
| API real en navegador | 4 plantillas × 3 tamaños, antes/después, nombre/logo/portada correctos, seleccionados reales, recarga y medios cargados. `navegador-real.txt`, JSON comparativos y 24 capturas. |
| Precios y ofertas reales | Coinciden con los productos seleccionados del catálogo persistido en las 4 portadas; `navegador-precios-reales.txt`. En la 4 se comprueba la tarjeta con precio; la primera tarjeta editorial conserva su diseño sin precio. |
| API simulada en navegador | 4 plantillas × 3 tamaños × 4 escenarios: contenido completo con almacenamiento obsoleto, sin logo/imagen, sin landing y tienda B. Verifica contacto, colores/tipografías, protección frente a imágenes heredadas, precios/ofertas, CTA, navegación, recarga y eventos. `navegador-simulado.txt`. |
| Nombres largos y acceso | 150 caracteres, sin personalización, 4 plantillas × 3 tamaños; acceso y retorno al inicio de la misma plantilla. `navegador-acceso-final.txt`. Las capturas de fallos iniciales se conservaron; el resultado final es correcto. |
| Página principal/dashboard/PDF | Prueba existente `reports-settings-browser.cjs` aprobada en los tres tamaños, incluidos guardados simulados y persistencia tras recarga; `navegador-informes-configuracion.txt` e `informes-regresion/`. La salida se redirigió en memoria a una carpeta nueva para preservar evidencias anteriores. |
| Marketing Partes 1 y 2 | Prueba existente con `MARKETING_EDITOR_TESTS=1`: los tres tamaños, 3 diseños × 3 formatos, edición, undo/redo, variantes/ofertas, teclado, XSS, exportaciones y regresión PDF/promociones. Aprobada, con evidencias en `marketing-regresion/`. Se sustituyó **solo en memoria** la expectativa de ruta obsoleta por `/emprendedor/landing`; no se modificó el archivo con cambios locales. |
| PostgreSQL temporal | 57 pruebas existentes aprobadas mediante `test_reports_postgres.py`: informes PDF, configuración/persistencia, dashboard y estados. Base `test_*` única creada y retirada por el script; sin escritura comercial. |
| SQL en memoria y Mongo temporal | 95 pruebas de guardado/lectura de negocio y landing, contenido, permisos/tenant, identidad, promociones, checkout, pedidos y seguimiento aprobadas; `regresion-backend-integracion.txt`. El script conserva su exclusión explícita de una prueba histórica de migración (96 descubiertas, 95 ejecutadas). |
| Integridad | `git diff --check` aprobado. Hashes de cambios previos intactos. Sin operaciones Git de escritura, commits, merges, push o despliegues. |

Las comprobaciones con respuestas simuladas se distinguen de las de API real. Se utilizaron datos reales solo para lectura pública. No se hicieron compras, cobros ni cambios en la configuración de la tienda comercial. Los cambios de Página principal se verificaron contra la aplicación con API interceptada y mediante pruebas backend sobre bases aisladas.

## 6. Capturas comparativas

Plantilla 3, escritorio:

| Antes | Después |
|---|---|
| ![Antes](antes-3-1440.png) | ![Después](despues-3-1440.png) |

Las capturas `antes-{1..4}-{375,768,1440}.png` y `despues-{1..4}-{375,768,1440}.png` cubren las cuatro plantillas. Las `simulada-*.png` están identificadas como datos de prueba. En el JSON anterior, el campo width medía el ancho de cabecera; el tamaño de viewport se identifica por el nombre del archivo. El JSON posterior distingue width y headerWidth.

## 7. Reproducción

Desde `frontend`:

```powershell
npm run build
node tests/store-identity.cjs
$env:DASHBOARD_PLAYWRIGHT_MODULE='C:\Users\maria\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node tests/store-identity-browser.cjs
node tests/store-identity-real-browser.cjs
```

Los scripts de navegador usan por defecto el frontend local `http://localhost:5173`; permiten `IDENTITY_TEST_URL`. La prueba real permite `IDENTITY_API_URL` (por defecto `http://127.0.0.1:8000`). La simulada admite `IDENTITY_SCENARIOS=full` para la comprobación centrada en acceso/nombres largos. No se añadió Playwright como dependencia del producto.

Backend existente: `docker exec django_backend python scripts/test_reports_postgres.py`. La selección exacta de integración se registró en el proceso: `test_develop_integration.py` con test_store_configuration, landing.test_guardar_configuracion, landing.test_consultar_configuracion, landing.test_contenido, test_tenant, visual_config.test_store_identity, test_checkout, test_customer_orders, test_promotions y test_order_tracking.

## 8. Límites y pendientes

- Los colores, tipografías y estilos siguen persistiendo en el navegador, separados por tienda/instalación, conforme al sistema existente. La recarga y el cambio de plantilla se comprobaron; no se promete sincronización entre dispositivos ni un backend de estilos que no existe.
- Solo hay una tienda real en esta instalación. La transición A/B se comprobó con API simulada, respuestas asíncronas controladas y las pruebas tenant de bases temporales.
- El archivo pendiente de otro integrante `marketing-browser.cjs` todavía espera la ruta anterior de configuración. Debe actualizarse esa expectativa al integrar su trabajo; la ejecución de esta auditoría la adaptó en memoria y preservó el archivo.
- Las secciones editoriales conservadas no son nuevos campos configurables. No se añadió un CMS ni se usó la descripción comercial para rellenarlas automáticamente.
- No se detectaron defectos funcionales pendientes de esta corrección en las cuatro plantillas verificadas. Las pruebas no equivalen a una compra real ni a una publicación/despliegue.
