# Editor visual de tiendas

Trabajo local en `feature/rediseno-editor-visual`, desde `develop` / `origin/develop` en `a7c1fba`. Sin commit, push ni merge. Se conservaron los cambios locales y los ocho stashes existentes.

## Implementación

- Vista previa central sin barra lateral: páginas y secciones en selectores compactos, zoom de 50–150 %, ajuste automático, pantalla ampliada y propiedades plegables.
- Navegación única de herramientas. Apariencia contextual y acceso al contenido; las cuatro plantillas se comparan en un panel compacto conservando sus borradores e historial.
- Página principal (`/emprendedor/landing`) conserva portada, logo, productos destacados, categorías, beneficios, contacto y ubicación. Añade «Secciones de mi tienda»: historia, imagen/texto, texto libre, galería y cita, con orden, visibilidad, confirmación al eliminar e historial.
- Diseño edita la apariencia y enlaza hacia Página principal para el contenido. Selección contextual de cada bloque, tipografía, posición, dimensiones, márgenes/espacios, bordes/fondos y encuadre de imágenes; cambios generales por defecto y variantes independientes por dispositivo.
- Cambios generales predeterminados. Las variantes explícitas de computadora, tablet y móvil conservan los otros dispositivos. Los datos comerciales se comparten, sin copias por dispositivo.
- Identificación institucional integrada en las barras, con fondo transparente y texto de contraste automático. Se conserva el archivo oficial, la marca obligatoria y sus restricciones.
- Guardado, descarte, deshacer/rehacer, protección al salir y errores sin pérdida del borrador. La vista incrustada no ejecuta compras ni pagos.

## Archivos principales

| Archivo / carpeta | Responsabilidad |
| --- | --- |
| `frontend/src/features/admin/pages/ThemeEditor.tsx` | Espacio de trabajo, borradores, selección, zoom y guardado |
| `frontend/src/features/admin/visualEditor/workspace.css` | Interfaz y adaptación del editor |
| `frontend/src/features/admin/visualEditor/{content,inspector,model,preview,banner}.tsx/.ts` | Contenido contextual, alcance visual e interacción con la tienda |
| `frontend/src/features/storefront/context/StoreContext.tsx` | Contenido compartido y estilos publicados de bloques |
| `frontend/src/features/admin/components/LandingBlocksEditor.tsx` | Administración de contenido desde Página principal |
| `frontend/src/features/landing/components/LandingBlocks.tsx` | Representación común en las cuatro plantillas |
| `frontend/src/features/storefront/visual/blockAppearance.ts` | Valores visuales seguros y variantes por dispositivo |
| `backend/apps/landing/{block_appearance,block_images}.py` | Contrato visual e imágenes verificadas y conservadas |
| `frontend/src/features/storefront/visual/{resolveVisualConfig,cssVariables,contrast}.ts` | Herencia visual y contraste institucional |
| `frontend/src/styles/visual-config.css` | Integración institucional compartida por las cuatro plantillas |

Se conserva el formato local v1 y el aislamiento por instalación/tienda. Se revisó el almacenamiento existente antes de ampliarlo: el JSON `ConfiguracionLanding.contenido` incorpora `bloques` y `apariencia_bloques[plantilla]`. No se modificaron modelos ni se crearon migraciones. PUT conserva claves nuevas omitidas por clientes anteriores; PATCH de apariencia no modifica contenido ni otras plantillas. Ambas escrituras bloquean la fila en una transacción. El contrato completo está en `backend/apps/landing/BLOCKS_API.md`.

El contenido y la apariencia de los nuevos bloques se publican en Django y se recuperan también desde un navegador limpio. Los otros ajustes generales del rediseño conservan su guardado local anterior. Las imágenes se verifican (PNG/JPG/WebP, 2 MB cada una, 10 MB por guardado) y se convierten en archivos por tienda/bloque. Eliminar un bloque no elimina sus archivos originales. El servidor de desarrollo sirve únicamente el subdirectorio nuevo de bloques; en producción debe configurarse esa ruta de medios en el servidor web.

El logo original no fue editado ni reemplazado (SHA256 `D969783D7DDE52B777F29FE696C89EE63E66F7FDFF3F13AA6DC06865E0B80368`). Mantiene un área de 56 × 48 px, proporciones con `object-fit: contain`, colores originales y protección institucional. Solo su contenedor exterior es transparente.

## Validación

- Compilación final con TypeScript y Vite.
- 83 pruebas del editor, 47 de configuración visual y 9 de apariencia de bloques.
- 39 pruebas Django de bloques, contenido y configuración: SQLite en memoria, esquema temporal desde modelos y archivos temporales. No se ejecutaron migraciones de producción ni operaciones sobre los datos de PostgreSQL/MongoDB.
- Navegador real y HTTP Postman: cinco tipos, galería, orden, ocultar, eliminar con confirmación, deshacer/rehacer, descarte, bloqueo al salir, error 500 recuperable, persistencia y aislamiento. Historia visible en 4 plantillas × 3 dispositivos. Estilos publicados comprobados desde un contexto de navegador sin almacenamiento local.
- Logo institucional: fondos claros/oscuros desde los controles reales en 4 plantillas × 3 dispositivos, contenedor transparente, imagen original de 56 × 48 px y contraste de texto ≥ 4.5 arriba y abajo.
- Regresiones de informes, dashboard, navegación, checkout, despacho, carrito, marketing, portada y perfil de emprendedor.
- Edge real contra una simulación HTTP local de Postman: cuatro plantillas, 53 combinaciones de plantilla/página, edición de sus propiedades, etapas de checkout, edición de contenido e imágenes multipart desde Página principal, persistencia al recargar, aislamiento de tiendas, error 500 conservando el borrador, zoom y tres tamaños de pantalla.
- Capturas principales: `C:/Users/maria/Ecommerce/rediseno-editor-evidencias/pagina-principal-secciones.png`, `editor-secciones.png`, `logo-institucional-barra.png` y `logo-institucional-pie.png`. La misma carpeta contiene las 12 capturas de historia por plantilla/dispositivo y los registros de pruebas. Las capturas usan contenido ficticio aislado.

## Verificar en Docker

Con el stack del proyecto iniciado, desde la raíz del repositorio:

```powershell
git branch --show-current
docker compose exec frontend npm run build
docker compose exec frontend npm run test:editor-ux
docker compose exec frontend npm run test:visual
```

Ingresar como emprendedor y abrir `http://localhost:5173/emprendedor/diseno/editor`. El volumen del frontend refleja los cambios del código. No se necesita reconstruir ni reiniciar las bases de datos.

Para repetir el navegador sin datos reales: iniciar `postman simulation run frontend/tests/editor-redesign.sim.yaml --port 4918 --output ndjson`; en otra terminal de `frontend`, configurar `$env:VITE_API_URL='http://127.0.0.1:4918/openmind'` y ejecutar `npm run dev -- --host 127.0.0.1 --port 5188 --strictPort`; después `node tests/landing-blocks-browser.cjs` y `node tests/editor-redesign-browser.cjs`, en secuencia. Playwright debe estar disponible mediante `DASHBOARD_PLAYWRIGHT_MODULE`; el script admite `EDITOR_TEST_URL`, `EDITOR_TEST_API`, `EDITOR_EVIDENCE_DIR` y `DASHBOARD_BROWSER_CHANNEL`.

## Límites

No se escribieron datos de prueba en las bases del equipo: se utilizó el cliente Django con una base temporal y el frontend real con la simulación local de Postman. La apariencia de los nuevos bloques se sincroniza mediante Django; los ajustes generales anteriores del editor siguen siendo locales. Vite advierte del tamaño del paquete principal; la compilación del contenedor también muestra advertencias de selectores CSS existentes. No bloquean la compilación.
