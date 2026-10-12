# Editor del emprendedor — UX noche 1

Fecha: 12 de octubre de 2026. Trabajo local en `develop`.

## Diagnóstico inicial

- `git status --short --branch`: `develop...origin/develop`. Al retomar, había 18 archivos modificados del frontend y tres archivos nuevos del editor/informe, además de `automation/` sin seguimiento. Se continuó sobre esos cambios existentes; `automation/` se conservó intacto.
- `git log -1 --oneline --decorate`: `026cb3c (HEAD -> develop, origin/develop) Merge branch 'feature/mejoras-flujos-tienda' into develop`.
- No se cambió de rama ni se ejecutaron commit, push, reset, rebase o stash.
- Frontend Vite disponible en el puerto 5173. Backend Django disponible en el puerto 8000. El 404 de la raíz del backend corresponde a una ruta inexistente, no a un servicio caído.
- La consulta inicial de Docker estaba limitada por permisos. La revisión final pudo consultar el motor con autorización de ejecución: `react_frontend`, `django_backend`, PostgreSQL y MongoDB están activos. Los logs recientes muestran respuestas 200 de identidad y perfil, sin excepción asociada al error investigado.

### Mensaje de identificación de tienda

El mensaje anterior se originaba en `StoreIdentityContext`: cualquier fallo del servicio terminaba en «No se pudo confirmar la tienda. Recarga cuando el backend esté disponible». Ese texto no permitía distinguir red, HTTP, respuesta inválida o configuración de tienda.

Se verificó la URL efectiva servida por Vite: `http://127.0.0.1:8000`. El endpoint `GET /api/visual-config/plantilla-seleccionada/` respondió **200**, `exito: true`, `tienda_id: 1` y plantilla seleccionada vacía. La plantilla vacía es compatible con el flujo existente y no invalida la identidad.

También se comprobó la respuesta mediante `localhost` y la cabecera CORS para los orígenes `http://localhost:5173` y `http://127.0.0.1:5173`. `GET /api/auth/me/` respondió 401 sin credenciales, como corresponde al endpoint privado. La identidad de tienda usa GET público; no exige iniciar sesión. El resolver de tenant conserva su comprobación de tienda única y su autorización de propietario para operaciones privadas.

**El fallo original no se reprodujo por HTTP durante esta sesión. No se atribuye a una migración ni a un backend caído sin evidencia.** Se corrigió la recuperación del frontend: mensajes diferenciados para 401/403, 503, otros errores HTTP, datos no reconocibles y conexión; botón «Intentar nuevamente» que vuelve a consultar sin recargar toda la aplicación. Nunca se inventa una identidad ni se usa la tienda 1 como fallback.

La consulta local de migraciones falló porque el hostname `db` pertenece a la red Docker. La revisión final ejecutó `docker exec django_backend python manage.py showmigrations --plan` correctamente: están pendientes `core.0006_configuracionpago_varianteproducto`, `core.0019_merge_20261008_1504` y `core.0020_alter_pedido_estado`. No se aplicaron. Una nueva consulta HTTP desde el contenedor confirma identidad 200, `exito: true`, `tienda_id: 1`; no hay evidencia de que esas migraciones causen el mensaje original. La respuesta de identidad no certifica que todos los flujos del backend tengan el esquema actualizado. No se modificó el backend.

## Navegación anterior y nueva

Antes, las páginas estaban agrupadas en un selector desplegable en la barra de la vista previa. El panel lateral se concentraba en secciones y ajustes, de modo que las páginas disponibles no eran visibles al entrar.

Ahora la primera herramienta es **Páginas** y muestra una lista visible con Inicio, Catálogo, Producto, Acceso / Registro, Carrito, Finalizar compra, Confirmación de pedido, Seguimiento, Perfil, Mis pedidos y páginas legales. Nuestra historia sigue disponible para Velta, conforme a la arquitectura previa.

La página actual tiene resaltado, indicador y `aria-current="page"`. La vista previa muestra «Estás editando», nombre de página, dispositivo y ancho. El selector anterior se conserva como acceso adicional. Cambiar página no modifica el documento ni activa cambios pendientes.

## Interfaz y estados

- Barra superior con regreso a Mi tienda, Deshacer, Rehacer, controles de paneles y Guardar cambios.
- Herramientas visibles: Páginas, Plantillas, Colores y fuentes, Contenido y secciones e Imágenes.
- Panel lateral con una introducción corta según la herramienta; vista central con espacio propio; opciones del elemento a la derecha.
- Estados explícitos: Cambios sin guardar, Guardando…, Guardado y No se pudo guardar. Un error conserva el borrador y permite reintentar.
- Una plantilla elegida puede guardarse aunque no se haya cambiado ninguna propiedad. Descartarla vuelve a la plantilla guardada. Se pueden probar otras plantillas sin un aviso de salida si no hay ajustes del documento pendientes; los ajustes pendientes siguen protegidos.
- Descartar, restablecer propiedades, restablecer secciones y volver al diseño original se conservan. Restablecer un diseño requiere el diálogo existente y mantiene contenido, imágenes e identidad institucional.

El guardado visual existente sigue siendo **local a este navegador y a esta tienda**. La interfaz lo informa y utiliza «Guardar cambios»; no promete una publicación remota. La vista pública del mismo navegador sigue leyendo los ajustes guardados. La persistencia compartida entre dispositivos no se implementó en esta sesión.

## Plantillas

Studio Pop, Soft Discovery, Velta Editorial y Obsidian Showcase tienen tarjetas con una miniatura ilustrativa propia, nombre, descripción corta, personalidad y acción «Probar esta plantilla». Las miniaturas están construidas con HTML/CSS; no son capturas completas de las tiendas. La vista central usa la plantilla real seleccionada.

Se simplificaron también las descripciones de la pantalla Diseño: desaparecen CTA, valores de radio, códigos de color y etiquetas como Full-bleed. Se mantienen los IDs, rutas, presets y configuraciones independientes de cada plantilla.

## Inspector y edición contextual

Al seleccionar visualmente un elemento, se abre el panel de opciones incluso si estaba cerrado. El nombre seleccionado se anuncia con `aria-live`. El resaltado usa un contorno suave y distingue imágenes seleccionadas.

En productos, se conserva la distinción entre imagen principal, galería, información, precio, variantes y cantidad. En tarjetas se distingue botón, texto y contenedor; tocar texto del banner abre su grupo Texto. Seleccionar una imagen editable abre únicamente sus opciones.

Los controles habituales aparecen primero. «Opciones avanzadas» permite recuperar todas las propiedades precisas existentes, incluidas medidas, separaciones, bordes y anchos. Tamaños y bordes ofrecen elecciones simples y un valor personalizado; la distribución de productos ofrece cantidades por fila y la opción personalizada. Los restablecimientos y ajustes independientes de computadora, tablet y móvil siguen disponibles.

Los textos e imágenes de negocio conservan sus editores y persistencia actuales. El inspector ofrece accesos contextuales a Portada y Productos para cambiar textos, fotografías, nombres y precios. No se mezcla ese contenido con ajustes decorativos del tema ni se reemplaza la arquitectura de contenido.

## Lenguaje, fuentes, colores e imágenes

- Banner principal, Botón principal, Tarjeta de producto, Distribución de productos y Pie de página sustituyen nombres menos claros. «Inspector» pasa a «Opciones» en los controles visibles. Se retiró «Overrides» de avisos y ayudas.
- Se mantienen todas las fuentes, sus nombres habituales y la muestra tipográfica. Fuente de títulos y Fuente de textos son controles iniciales; las opciones muestran la familia cuando el navegador la soporta, con los fallbacks existentes.
- Las paletas muestran tres muestras coordinadas y «Usar esta paleta». «Personalizar colores y opciones avanzadas» abre los ajustes individuales. Se conserva la cascada de overrides y la independencia de cada color.
- Las imágenes muestran miniatura, Cambiar imagen, Tamaño, Ajuste Rellenar / Contener y Posición Izquierda / Centro / Derecha. El enlace, escala exacta, encuadre vertical y bordes siguen en opciones avanzadas.
- Se añadieron mensajes para archivos no válidos y errores de lectura; las cargas nuevas se limitan a 3 MB para reducir fallos de almacenamiento local. Las imágenes y ajustes previamente guardados se conservan.
- El ajuste `fit` es opcional y compatible con datos anteriores; se normaliza y se aplica tanto en preview como en tienda. Restablecer o desconectar recupera el ajuste original.

## Responsive y accesibilidad

Se mantienen **1440 / 768 / 375** para la vista de computadora, tablet y móvil, con dispositivo y ancho visibles. La escala existente continúa ajustando la tienda al espacio disponible.

En pantallas pequeñas el editor apila paneles, muestra las páginas en dos columnas, permite recorrer las herramientas horizontalmente y da más altura a la vista previa. La barra de acciones permanece accesible; los botones principales móviles tienen un mínimo de 44 px. Los paneles pueden ocultarse y abrirse sin perder el documento.

Se mantienen controles nativos, labels, estados ARIA, foco visible y navegación por teclado. Los elementos editables de la preview pueden seleccionarse con Enter o Espacio; al desconectar se recuperan sus atributos originales. Se agregaron Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z y Ctrl/Cmd+Y sin interceptar los campos de texto. Los diálogos conservan Escape y su ciclo de Tab y devuelven el foco al control anterior. Las advertencias de contraste siguen activas.

El branding de **Universidad Autónoma de Chile** sigue obligatorio, visible y protegido por el resolver y los componentes públicos existentes. El editor no ofrece una acción para ocultarlo o reemplazarlo. Sus imágenes están excluidas de personalización; tocarlas abre la explicación institucional.

## Validación realizada

| Verificación | Resultado |
| --- | --- |
| `npm.cmd run typecheck` en frontend | Correcto, ambos proyectos TypeScript |
| `npm.cmd run build` | Correcto con la configuración estándar; 182 módulos transformados |
| Todas las suites `frontend/tests/*.cjs` | 24 suites correctas |
| `node tests/editor-emprendedor-ux.cjs` | 15 pruebas correctas |
| `node tests/visual-editor.cjs` | 58 pruebas correctas |
| `node tests/visual-editor-final.cjs` | 6 pruebas correctas |
| `node tests/visual-config.cjs` | 47 pruebas correctas |
| `node tests/landing-editor.cjs` | Correcto |
| `node tests/landing-content.cjs` | Correcto |
| `node tests/account-navigation.cjs` | Correcto |
| `git diff --check` | Correcto |

La revisión final ejecutó el build estándar después de las correcciones, con permisos de ejecución autorizados. No fue necesario sustituir la configuración ni cambiar la política de PowerShell. Se utilizó `npm.cmd`. Vite conserva su aviso sobre el chunk principal de aproximadamente 509 kB.

Las nuevas pruebas ejercitan la navegación visible, selección actual, cambio de páginas, apertura contextual, plantillas, estado pendiente de plantilla, descarte, guardando/error/guardado, historial, paletas, controles avanzados, ajuste de imagen, selección por teclado, protección institucional y recuperación de identidad. El responsive del editor se comprueba mediante la cascada de reglas CSS; sus tres anchos también se prueban en el componente. Estas pruebas no sustituyen una revisión visual en un navegador real.

Se agregó `npm run test:editor-ux` para ejecutar las tres suites del editor conjuntamente.

## Comprobación final y correcciones al retomar

Se corrigió la apertura de Opciones al cambiar de página después de usar Plantillas, y al volver a Contenido y secciones. El tamaño de las imágenes decorativas ahora ofrece Pequeño / Mediano / Grande / Personalizado directamente, con escalas 80 / 100 / 140 y validación del valor exacto. Se añadieron dos pruebas de regresión. En tablet (761–1000 px), Opciones ocupa una fila debajo del lienzo para evitar tres columnas estrechas. En móvil el lienzo tiene 80 vh y al menos 600 px, para que los controles superiores no consuman casi toda la vista de la tienda.

El navegador integrado permitió revisar el código real en el entorno aislado `frontend/tests/visual-review`, puerto 5175, con la tienda sintética 987654 y autenticación ficticia aceptada únicamente por los fixtures. Se comprobaron páginas visibles y previews de Inicio, Catálogo, Producto, Carrito, Acceso, Seguimiento, Perfil y Mis pedidos; selección de imagen de Producto y opciones específicas; cambio de tamaño, estado pendiente y guardado; fuentes Georgia/Calibri conservadas al recargar; paleta Bosque y sus colores computados en barra superior y pie (`rgb(21, 128, 61)`); cuatro etapas de Checkout con sus encabezados renderizados; cuatro tarjetas de plantilla, prueba de Soft Discovery, retorno a Producto con Opciones abiertas y descarte a Studio Pop. No hubo compras ni escrituras en backend.

La revisión visual confirma el editor en la ventana móvil disponible, no una sesión real de propietario ni publicación compartida. La evidencia de captura se guarda en `C:/Users/maria/.codex/visualizations/2026/10/09/01a11eff-fafa-7220-a62c-ab3cc514bff3/editor-ux-producto.png`.

## Pendientes y límites de esta sesión

1. Completar la revisión visual del editor en una ventana real de laptop y tablet, cargas de archivos y diálogos. El navegador integrado sí estuvo disponible en la revisión final; su ventana permaneció en 341 × 932 pese al ajuste solicitado de viewport. Los otros tamaños del editor se validaron mediante la cascada CSS y pruebas de componentes; no se declaran capturas de desktop/tablet realizadas.
2. Validar el editor con una sesión auténtica de emprendedor. La ruta del servidor real redirige a Acceso al no haber sesión en este navegador; la revisión visual se hizo en el entorno sintético existente.
3. Revisar por separado las tres migraciones pendientes, sin atribuirles el error de identidad que no se reprodujo. No se aplicaron automáticamente.
4. Validar la experiencia con emprendedores reales. Las miniaturas ilustrativas pueden ampliarse con capturas de la tienda cuando se disponga de navegador.
5. La edición de textos y fotografías de negocio sigue usando Portada / Productos, ahora con accesos contextuales. La edición de ese contenido dentro del mismo panel y el guardado visual compartido entre dispositivos requieren trabajo posterior.

No se ejecutaron compras ni pagos reales, no se aplicaron migraciones, no se modificó `automation/`, no se eliminó funcionalidad del editor y no se hicieron commit ni push.
