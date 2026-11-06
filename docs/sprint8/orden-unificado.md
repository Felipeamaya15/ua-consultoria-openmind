# Orden único de Página principal

## Diagnóstico y contrato

Base: `d1cee8c`. Las cuatro páginas Home fijaban `<LandingBlocks />` antes de los apartados comerciales. Minimal además tiene un banner y «Más para ti»; Catálogo tiene un bloque editorial y «Descubrir». Editorial y Minimal ya tienen categorías; Visual y Catálogo necesitan mostrar la misma selección real con componentes existentes.

Se conserva `contenido.bloques` (máximo 20), sus UUID, contenido y estilos. `contenido.productos_destacados`, `categorias` y `secciones` siguen siendo las fuentes de selección y visibilidad. No se crean productos, categorías ni endpoints de catálogo.

Contrato aditivo del endpoint existente `/api/landing/configuracion/`: `contenido.orden_apartados` es una lista opcional de referencias únicas, hasta 26. Referencias comerciales estables: `sistema:destacados`, `sistema:categorias`, `sistema:banner`, `sistema:mas-productos`, `sistema:contenido`, `sistema:descubrir`. Las demás son UUID de `contenido.bloques`. Se rechazan referencias ajenas, duplicadas o desconocidas. Omitir el campo conserva el orden existente; eliminar una sección retira su referencia. Los apartados nuevos se agregan al final. Las referencias no disponibles en una plantilla se conservan y no se renderizan allí.

Sin orden guardado se mantiene el orden anterior de cada plantilla: bloques personalizados primero y luego sus apartados comerciales. Portada y Beneficios quedan fuera de la lista, al inicio. Contacto y ubicación conservan su posición final. No requiere migración de base de datos: se utiliza el JSON existente de la tienda y sus permisos actuales.

Editar, agregar u ocultar contenido no crea un orden explícito de forma silenciosa: se conserva el valor predeterminado de cada plantilla hasta el primer movimiento en la lista. Cuando ya hay un orden guardado, los cambios de bloques conservan las posiciones y retiran las referencias eliminadas.

La lista del editor es única. Los apartados del sistema no se eliminan ni consumen el límite de 20; se ocultan y reutilizan los formularios de selección existentes. Beneficios conserva un formulario separado.

## Implementación

- `homeSections.ts` define las referencias, los valores predeterminados y la compatibilidad de visibilidad. Las agrupaciones adicionales heredan la bandera histórica de productos destacados hasta recibir una bandera propia. No se guardan copias de productos ni de imágenes.
- `HomeSections` recorre el orden una sola vez. Cada Home entrega su JSX comercial original, con sus tarjetas, rutas, precios y estilos. Se conserva el renderizador de bloques y una sola carga de recursos públicos de biblioteca por portada.
- Las categorías de Visual y Catálogo reutilizan la selección existente y los mosaicos con enlaces al catálogo real. Editorial busca la imagen en todos los productos disponibles de la categoría, sin exigir que estén destacados.
- `LandingBlocksEditor` incorpora las filas del sistema a la misma lista, con subir/bajar, visibilidad, configuración y vista previa textual del orden. Mantiene los formularios de bloques, galería y biblioteca.
- `LandingContentEditor` se reutiliza en las filas comerciales. La selección se puede editar aunque el apartado esté oculto, sin un segundo interruptor de visibilidad. Las agrupaciones adicionales comparten esa misma selección. El bloque editorial de Catálogo conserva su contenido preexistente; se puede ordenar y ocultar, no se añadió otro editor de texto para él.
- Página principal conserva guardado, historial, descarte y protección de cambios pendientes. La pestaña 04 se llama **Beneficios**. Contacto y horarios siguen al final.
- Django valida las referencias antes de guardar, conserva el orden cuando un cliente anterior lo omite y elimina referencias huérfanas cuando ese cliente retira un bloque. No cambia la autorización ni la resolución de tienda.

## Comprobación en localhost

1. Abrir `http://localhost:5173/emprendedor/landing#secciones-tienda` con sesión de emprendedor.
2. Abrir «Editar Productos destacados» o «Editar Categorías». Se muestran los productos y categorías actuales. La selección se comparte con las agrupaciones de la plantilla, sin duplicar registros.
3. Subir o bajar las filas, intercalar secciones propias, cambiar visibilidad y guardar. Recargar para comprobar el orden.
4. Revisar «Vista previa del orden» y «Ver mi tienda». También se puede revisar `/plantilla/1`, `/plantilla/2`, `/plantilla/3` y `/plantilla/4`.
5. Beneficios se configura en su propia pestaña; permanece inmediatamente debajo de Portada cuando está habilitado y tiene contenido. Las categorías vacías y los productos que ya no devuelve el catálogo activo no se renderizan.

Se probó con la sesión real existente: guardar, recargar, mostrar destacados antes de una sección propia y categorías después; desactivar ambos apartados; comprobar que la sección propia y el recurso YouTube seguían presentes. Se verificaron las cuatro plantillas y posteriormente se recuperaron el orden visual y las banderas originales. Quedó persistido el orden explícito equivalente al original; no se borró ni creó contenido de la tienda durante esta revisión.

Responsive real: portadas de las cuatro plantillas y editor con formulario comercial abierto a **375, 768 y 1280 px**, sin desbordamiento horizontal. Se restableció el tamaño del navegador al finalizar.

## Validación técnica

- `docker compose exec -T backend python manage.py test apps.landing --noinput`: primera ejecución 96/96; después de agregar los casos de orden, **102/102**.
- `docker compose exec -T backend python manage.py test --noinput`: **1065/1065**, incluyendo catálogo, pedidos y las funciones previas de Landing, biblioteca y redes.
- `docker compose exec -T backend python manage.py makemigrations --check --dry-run`: **No changes detected**.
- `npx tsc --noEmit -p tsconfig.app.json`: correcto.
- `npm run typecheck`: correcto para aplicación y configuración de Vite.
- `npm run build`: correcto. Permanece el aviso de Vite por un chunk superior a 500 kB.
- `node tests/home-section-order.cjs`: casos de orden compartido, visibilidad heredada/independiente, cuatro Home reales, catálogos vacíos, persistencia del borrador, controles del editor y selección mientras está oculto.
- Regresión frontend sin runners que generan artefactos ni automatización de navegador externa: **75 archivos de pruebas ejecutados; 74 aprobados y 1 fallido** (`editor-incremental.cjs`, con las dos aserciones históricas detalladas abajo). Incluye los nuevos 7 casos de orden, Landing, Biblioteca, Redes sociales, Marketing, catálogo, carrito y checkout.
- Las primeras pruebas del renderizador detectaron fixtures incompletos para los nuevos componentes hijos; se completaron las fuentes simuladas y los hooks sin retirar ni debilitar las aserciones. El runner antiguo del editor también necesitó cargar el módulo de orden real.
- `editor-incremental.cjs` conserva **dos aserciones fallidas de paletas**: `#ffffff` frente a `#ffffee` y `#f0edff` frente a `#eeffee`. Se reprodujeron usando las fuentes de `d1cee8c` mediante `git show` en memoria, sin cambiar el checkout. Es un fallo preexistente; no se modificaron el resolvedor visual ni esas pruebas.
- `postman status`: no ejecutable desde esta terminal; la CLI incluida en Postman exige `POSTMAN_CLI_ELECTRON` y su propia terminal. No se simulan resultados de Postman. El contrato está descrito arriba; la evidencia de API corresponde a Django y al guardado real desde localhost.

Los pagos o integraciones externas no se ejercitaron con transacciones reales. La comprobación de regresión de catálogo, carrito y checkout corresponde a las suites automatizadas existentes.

## Archivos de este cambio

Modificados:

- `backend/apps/landing/content_serializers.py`
- `backend/apps/landing/serializers.py`
- `frontend/src/features/admin/components/LandingBlocksEditor.tsx`
- `frontend/src/features/admin/components/LandingContentEditor.tsx`
- `frontend/src/features/admin/components/LandingPageContent.tsx`
- `frontend/src/features/admin/components/landing-blocks.css`
- `frontend/src/features/landing/components/LandingBlocks.tsx`
- `frontend/src/features/landing/types/landing.types.ts`
- `frontend/src/features/landing/types/landingContent.ts`
- `frontend/src/features/storefront/pages/CatalogHome.tsx`
- `frontend/src/features/storefront/pages/EditorialHome.tsx`
- `frontend/src/features/storefront/pages/MinimalHome.tsx`
- `frontend/src/features/storefront/pages/VisualHome.tsx`
- `frontend/tests/landing-editor.cjs`
- `frontend/tests/landing-sections.cjs`

Creados:

- `backend/apps/landing/home_sections.py`
- `backend/apps/landing/test_home_sections.py`
- `docs/sprint8/orden-unificado.md`
- `frontend/src/features/landing/components/HomeCategories.tsx`
- `frontend/src/features/landing/components/HomeSections.tsx`
- `frontend/src/features/landing/types/homeSections.ts`
- `frontend/tests/home-section-order.cjs`

Se conserva la rama `feature/sprint8-marketing-secciones`, basada en `d1cee8c`. No se realizó commit, push ni merge.
