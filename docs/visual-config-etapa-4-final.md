# Etapa 4 final — Edición visual por página

11 de octubre de 2026. Repositorio `C:\Users\maria\Ecommerce\ua-consultoria-openmind`,
rama `feature/mejoras-flujos-tienda`. Trabajo previo preservado. Sin commit, push,
merge, rebase, reset Git, stash, cambio de rama, migraciones ni modificaciones en
`automation/`. El working tree contiene también cambios de las etapas anteriores.

## 1. Alcance final y pendientes heredados

El editor ya enumeraba rutas, pero Producto vacío abría catálogo y las demás vistas
necesitaban carrito, pedido o sesión. Esto impedía diseñarlas sin preparar datos.
Ahora el editor abre ejemplos seguros explícitos, anteriores al montaje del Outlet
real. Se conserva el resolver defaults → preset → overrides → borrador, la publicación
local scoped por tienda y los consumidores públicos. No hay un segundo resolver.

La implementación y las validaciones automáticas están terminadas. La aceptación
visual final en navegador permanece pendiente; el servicio de aprobación no pudo
abrir el navegador por límite de uso. No se declara certificada esa revisión.

## 2. Páginas editables y selector

El control visible se llama «Página que estás editando». Ofrece Inicio, Catálogo,
Producto, Acceso, Carrito, Checkout, Confirmación de pedido, Seguimiento, Perfil,
Mis pedidos, Términos, Privacidad y Reembolsos. Nuestra historia aparece en Velta.
Producto utiliza `producto/ejemplo-editor` y no vuelve al catálogo por falta de slug.
Las páginas nuevas usan datos ficticios sin requerir una sesión de comprador.
Inicio y Catálogo conservan sus previews y controles existentes.

## 3. Controles por página

| Página | Grupos disponibles |
| --- | --- |
| Producto | Título y espaciado, Distribución, Imagen principal, Galería, Información, Precio, Cajas e información, Variantes, Cantidad, Botones |
| Carrito | Título y distribución, Productos, Productos y resumen, Cantidad, Botones |
| Acceso | Título y distribución, Formulario, contenedor, Campos, Botones |
| Checkout | Título y distribución, Opciones y resumen, Datos y opciones, Botones |
| Confirmación | Título y distribución, Pedido y resumen, Botones |
| Seguimiento | Título y distribución, Formulario, Resultado y estados, campos, Botones |
| Perfil | Título y distribución, Formulario, Datos personales, Campos, Botones |
| Mis pedidos | Título y distribución, Lista y detalle, Botones |

Los grupos de cajas/campos/botones conservan color, padding, radio, borde y los
controles de sombra pertinentes. Los ajustes están en `pages.<página>` y sus
overrides responsive. Las superficies de una misma página comparten estilo:
por ejemplo, cajas de productos y resumen comparten la rama `panel`; no se ofrece
un estilo independiente por cada tarjeta o por cada opción individual.

## 4. Estilo general frente a página actual

El menú tiene encabezados «ESTILO GENERAL» y «PÁGINA ACTUAL — nombre». Paleta y
tipografías, barra superior, encabezado y pie quedan en el primer grupo. Los demás
controles cambian con la página. No aparecen controles de Hero dentro de Carrito.
Las páginas sin campos no muestran un grupo de campos irrelevante.

## 5. Producto individual

Se muestra un bolso con imagen, tres vistas de galería, nombre, precio, descripción,
color/tamaño, stock ficticio, cantidad, Agregar al carrito, Comprar ahora e información
adicional. Hay controles de proporción, tamaño/radio de imagen, ancho relativo de
imagen/información, columnas o pila, miniaturas, texto y precio. Se añadieron marcadores
a las tres composiciones públicas de ProductDetail para consumir esas propiedades.
Los handlers de variantes, stock y compra reales no fueron reemplazados.
El link público abre el catálogo para elegir un producto real; el slug ficticio no
se presenta como un producto publicado.

## 6. Carrito

Ejemplo con un producto, imagen, variante, dos unidades, precio, eliminar, resumen,
subtotal, envío, total y acciones. Imagen/radio, cantidad y precio tienen controles
adicionales; filas y resumen heredan cajas y espaciado de la página. El preview
no sincroniza ni modifica el carrito real. La página pública conserva sus cálculos.

## 7. Acceso y registro

El selector alterna Inicio de sesión y Crear cuenta; registro incluye nombre y
confirmación de contraseña. Datos ficticios, sin autenticación. Se ajustan ancho y
posición del formulario, caja, títulos, campos y botones. Sus nuevas dimensiones
tienen consumidor en los formularios públicos existentes.

## 8. Checkout por etapas

Contacto, Entrega, Pago y Confirmación se abren directamente desde el selector,
sin carrito real y sin atravesar una compra. Contacto muestra nombre/email/teléfono;
Entrega muestra despacho/retiro, dirección, región, comuna y transportista de ejemplo;
Pago muestra transferencia y Webpay ilustrativos e instrucciones; todas incluyen
resumen cuando corresponde. La disponibilidad pública de medios sigue dependiendo
de la configuración real: el ejemplo no habilita métodos de pago.

Contacto/Entrega/Pago comparten `pages.checkout`; Confirmación usa
`pages.confirmation`, también al seleccionarla dentro de Checkout. Las acciones
públicas «Ver mi pedido» y «Seguir comprando» conservan sus handlers y rutas.
No se cambiaron cotizaciones, shipping, stock ni servicios de pago/pedido.

## 9. Seguimiento

Formulario y resultado de un pedido ficticio con estados recibidos/preparación/envío/
entrega. No se montan los efectos de Tracking dentro de este ejemplo y no se realiza
una consulta de tracking. Formulario, cajas, títulos y botones son editables.
No se alteraron las consultas, cancelaciones ni privacidad de la vista pública.

## 10. Perfil y Mis pedidos

Perfil muestra datos/formulario y guardar; Mis pedidos muestra dos filas y un detalle
con timeline. Los ejemplos se renderizan antes del Outlet, sin montar RequireCustomer.
Esta sustitución requiere el iframe same-origin del editor y `visualExample=1`.
Fuera de ese contexto se renderizan las páginas y guards originales, incluso si
alguien copia el parámetro a una URL pública.

## 11. Tipografías

«Fuente de textos» y «Fuente de títulos» independientes. Se mantienen las 15 familias;
sans/serif muestran Plus Jakarta Sans/DM Serif Display y las restantes sus nombres
reales, incluidos Calibri, Arial y Georgia. Select/opciones usan la fuente y se añade
una muestra «Aa · Tu tienda, tu estilo 123». El navegador/sistema puede ignorar el
estilo de opciones nativas o usar una alternativa si no tiene la fuente instalada.
No hay nuevos paquetes de fuentes. Se conserva la persistencia de ambas familias.

## 12. Paletas y overrides

Se conserva la paleta coordinada de doce propiedades y los overrides individuales
posteriores de barra/pie/colores. Una paleta se registra como una acción de historial.
No se persisten valores calculados ni se escribe storage al mover controles.

## 13. Deshacer y rehacer

Historial local de hasta 40 estados, incluyendo controles, imágenes y resets.
Un cambio nuevo después de Deshacer elimina la rama Rehacer. No-op no crea historial.
Guardar actualiza baseline; Descartar vuelve al último guardado y limpia el historial.
Cambiar plantilla inicia otro historial; seleccionar página/viewport no crea cambios.
No se almacena historial en backend ni localStorage. La nueva sesión empieza vacía.

## 14. Responsive

Se mantienen iframe lógico de 375, 768 y 1440 px y escala por ResizeObserver.
Los cambios responsive son overrides parciales. Las columnas de ejemplo pasan a
una columna a 639 px; imágenes/cantidad/formularios se acotan al espacio disponible.
Hay cobertura de variables y herencia, y evidencia previa de tamaños de etapas 2/3;
no se certifican screenshots actuales de las nuevas composiciones.

## 15. Inspector, paneles y ayudas

Secciones e Inspector pueden ocultarse desde botones con `aria-expanded/controls`.
Grupos colapsables recuerdan su apertura durante la sesión. El menú de páginas muestra
grupos concretos, evitando listas enormes; conserva scroll y disposición móvil.
Se mantiene ayuda con foco, mouse, click y Escape, sin dependencias. El aviso de datos
ficticios explica que los botones seleccionan su diseño, no ejecutan operaciones.

## 16. Resets

Propiedad elimina la hoja para recuperar herencia. Restablecer el grupo visible
elimina sus hojas en desktop/tablet/mobile, incluidas dimensiones nuevas de producto.
Los demás grupos/páginas se conservan. Volver al diseño original conserva imágenes,
contenido y otras plantillas; el diálogo explica que se retiran overrides comunes.
Todos son cambios de borrador y pueden deshacerse antes de publicar.

## 17. Imágenes legacy

Nueva clave `image-key-<hash>` basada en ID explícito, o fuente ORIGINAL + rol semántico;
preview y storefront comparten la derivación. No depende del índice actual del DOM.
Se mantiene lectura de `image-N` como fallback para tiendas antiguas. Al editar una
imagen con ajuste antiguo, su nuevo ajuste se guarda con clave estable; restaurar
elimina ambas claves de esa selección. No se ejecutó una migración.
Las configuraciones antiguas no editadas conservan su fallback por índice. Cambiar
la fuente original de un asset sin ID explícito cambia su identidad; dos imágenes
decorativas con igual fuente/rol comparten ajuste. El logo institucional y las imágenes
de contenido protegidas continúan excluidos.

## 18. Revisión de accesibilidad

Revisión de código/markup, no certificación WCAG ni prueba con lector de pantalla:

| Aspecto | Resultado |
| --- | --- |
| Selects/campos | Labels visibles, aria-label existentes y labels que contienen campos en ejemplos |
| Botones/estados | Texto, disabled, pressed y mensajes; no dependen solo de color |
| Foco/teclado | Focus-visible, summaries nativos, botones de panel y diálogo con Tab/Escape existentes |
| Ayudas | Tooltip asociado por aria-describedby y cierre por Escape |
| Contraste | Aviso cuando texto/fondo global, header o footer hex opaco tienen ratio inferior a 4,5 |
| Texto pequeño | Hints/notas del editor elevados a 12 px; otras composiciones conservan su jerarquía previa |

El aviso no modifica colores, no analiza imágenes/transparencias/currentColor y no
certifica todos los colores semánticos o estados. Revisión visual/teclado real y
contraste completo de contenido publicado requieren comprobación manual.

## 19. Rendimiento

Resolución memoizada, historial acotado, iframe no recargado por cambios de propiedad.
El puente calcula el CSS al actualizar configuración; seleccionar o recibir un cambio
DOM reutiliza ese CSS y evita reescribirlo si es idéntico. Observer sigue limitado a
childList, sin observar sus propios atributos. Listeners/observers se desconectan.
Los sliders actualizan solo borrador; no publican mientras se arrastran.
No se tomaron métricas de profiler, heap o tiempos en dispositivos reales.

## 20. Bundle

Carga diferida con boundaries locales por página pública y para ThemeEditor. Los
layouts/providers se conservan durante la carga de chunks. Build: 177 módulos;
principal 496,19 kB (gzip 152,06), antes 740,49 kB (gzip 200,32). Editor 42,15 kB
(gzip 14,04), CSS principal 286,03 kB (gzip 34,14). Ya no aparece aviso >500 kB.
El principal sigue cerca del umbral; no se reestructuraron todos los módulos admin
para perseguir un tamaño menor. La división reduce carga inicial, no elimina código.

## 21. Presets y filtros Velta

Studio Pop, Soft Discovery, Velta Editorial y Obsidian Showcase conservan presets y
cascada. Los ejemplos adoptan sus colores/radios/fuentes mediante las mismas variables.
La composición de ejemplo es representativa, no una copia exacta de todos los layouts
públicos de producto/checkout. Los filtros Velta conservan apertura y posiciones ya
corregidas en Etapa 3; el panel vive en el flujo normal, sin superposición offcanvas.
No se alteró su lógica funcional ni se añadió un backdrop innecesario.

## 22. Branding institucional

Universidad Autónoma de Chile mantiene logo original y referencia protegidos en los
cuatro layouts. Rechazo de false en todas las cascadas/breakpoints, mínimos legibles
y exclusión del editor de imágenes conservados. No se abrió control para ocultar,
reemplazar o eliminar branding. Las suites existentes mantienen esa cobertura.

## 23. Pruebas y validaciones

16 suites frontend: las 15 anteriores y `visual-editor-final.cjs` con seis casos nuevos
(múltiples páginas/aserciones por caso). Configuración: 47; editor previo: 58; final: 6.
Cobertura nueva: selector y cambio real de src/inspector, undo/redo, publicación y
rehidratación, ejemplos SSR sin montaje de hijos reales, cuatro etapas/registro,
geometría responsive, claves estables y contraste. Account-navigation/cart-checkout
comprueban también que preview no consulta identidad/carrito.

`npm run typecheck` y `npm run build` pasan. El primer intento de Vite falló por
EPERM de realpath en el sandbox Windows; la ejecución autorizada fuera de él pasó.
Registro de suites: `docs/visual-editor-final-tests.txt`.
Las 16 suites finalizaron con código 0 después de los últimos marcadores visuales.
`git diff --check`: código 0; solo avisos de normalización LF/CRLF. Estado final:
54 archivos rastreados modificados y 26 entradas sin rastrear, contando trabajo previo
y directorios (no equivale al total de archivos nuevos). Rama conservada.
Backend no fue modificado en este trabajo: su diff pertenece a etapas anteriores;
no se ejecutaron nuevas pruebas backend ni migraciones.

La apertura de navegador fue rechazada por fallo del servicio de revisión automática
por límite de uso, no por determinar la acción insegura. Se usó la alternativa de
tests/markup autorizada por el usuario. No se ejecutaron compras/pagos reales.

## 24. Limitaciones y comprobación manual final

- Publicación local por navegador/API/tienda; no sincronización remota/multidispositivo.
- Ejemplos sintéticos representan estados completos, pero no todos los estados de
  error, variantes, métodos o composiciones particulares de cada preset.
- Contacto/Entrega/Pago comparten estilos; paneles/campos de una página también.
- Imágenes antiguas conservan fallback por índice hasta editar; fuentes dependen del sistema.
- La revisión visual actual y medición formal de accesibilidad/rendimiento están pendientes.

Comprobación manual concreta: en el editor autenticado, seleccionar cada una de las
nueve páginas principales, cambiar un control específico, Deshacer/Rehacer, guardar,
recargar y comprobar el consumidor público con datos reales de lectura. En Checkout
revisar las cuatro etapas sin comprar; Perfil/Pedidos públicos requieren una sesión
compradora válida. Repetir con cuatro presets y 375/768/1440; comprobar branding,
foco, contraste, filtros y ausencia de overflow. Producto ficticio no existe en catálogo:
usar un producto real para el consumo público. No iniciar pagos ni crear pedidos.

Archivos principales de este trabajo: ThemeEditor; visualEditor controls/inspector/
editor.css/preview/images/history/contrast; StorePageContent y EditorPageExample;
visual types/defaults/cssVariables/pages/imageSettings; StoreContext/CartContext;
AccountNavigation/EditorialLayout; marcadores en ProductDetail, Cart, Login,
Checkout, OrderConfirmation, Tracking, Profile y CustomerOrders; LazyPage y rutas;
tests finales/account-navigation/cart-checkout; este informe y actualización de Etapa 3.
No hay Etapa 5 iniciada. La lista Git completa incluye trabajo previo y `automation/`
existente, que no se tocó.
