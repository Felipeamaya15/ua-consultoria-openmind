# Producto: consistencia entre editor y tienda pública

## Problema y causa

La vista de Producto del editor tenía una implementación independiente: selectores desplegables, un campo de cantidad de solo lectura y un botón Comprar ahora que no existía en el detalle público. No reproducía los diseños de las cuatro plantillas.

El detalle público tenía tres implementaciones del selector de cantidad. Una usaba también `data-page-panel`, por lo que recibía estilos propios de cajas de información. Su contenedor podía estirarse junto a una columna con dos acciones. Los tamaños y espaciados de los botones de variantes y compra dependían de clases diferentes según la plantilla.

## Componentes y consumidores compartidos

- `EditorPageExample` ahora renderiza el mismo `ProductDetail` utilizado por las rutas públicas, con un producto sintético y las seis combinaciones de color y tamaño. Mantiene la carga diferida mediante `lazy` y `Suspense`.
- `ProductDetail` recibe opcionalmente `previewProduct`. En ese modo evita las consultas de producto y relacionados y la escritura en el carrito real. Los clics del editor conservan su función de seleccionar controles de diseño.
- `ProductAttributes` usa la misma presentación de características en ambos contextos. Recibe atributos de ejemplo sin realizar consultas en el preview.
- `QuantityControl` reemplaza los tres selectores públicos y aparece también en el preview. Los límites, selección de variantes y operaciones del carrito permanecen en `ProductDetail`.
- Las reglas de `visual-config.css` están limitadas a Producto y utilizan las mismas variables de cantidad, campos y botones. Se conservan los consumidores de título, distribución, imagen, galería, información, precio y cajas.
- La selección contextual reconoce también las cajas de información públicas y la acción Ir al carrito. Variantes y Cantidad mantienen su inspector propio.

## Cantidad

El control usa una cuadrícula con botones de 44 px y un número centrado. Tiene ancho mínimo de 132 px, no crece en altura para igualarse a las acciones y no hereda el espaciado o la sombra de una caja de información. El inspector refleja ese ancho mínimo.

El ancho configurado sigue aplicándose. El espacio interior aumenta la altura cuando se solicita, conservando una superficie táctil mínima de 44 px. Fondo, texto, borde y redondeado consumen la configuración de campos. Hay estados deshabilitados, hover, foco visible dentro del control y etiquetas Aumentar/Disminuir cantidad. En 1, disminuir queda deshabilitado; se conserva el límite mínimo existente.

## Variantes y acciones

Las opciones tienen un mínimo de 44 px, espacio interior configurable y estados activos mediante `aria-pressed`. Las opciones agotadas conservan su lógica y estado deshabilitado. La tipografía, colores y bordes siguen la configuración del editor.

Agregar al carrito e Ir al carrito tienen altura mínima coherente, alineación centrada y texto que puede ajustarse a varias líneas. La acción de compra ocupa el espacio restante en escritorio y pasa debajo del selector en móvil. El preview presenta las acciones que realmente tiene el detalle público; se retiró su botón ficticio Comprar ahora.

## Validación manual

Se utilizó el entorno local de revisión con datos sintéticos y sin escrituras en servicios reales.

- Producto público: seleccionar talla M, aumentar de 1 a 2, agregar al carrito y abrirlo. El carrito mostró SKU QA-1-M y dos unidades de esa variante.
- Editor: abrir Producto desde el selector, seleccionar Variantes, Cantidad y Botones desde el preview. Cambiar tamaño de opciones produjo una fuente de 18 px en el ejemplo.
- Cantidad: cambiar el ancho a 168 px produjo el mismo ancho en el preview y la página pública.
- Botones: cambiar el fondo a `#315b46`, guardar y recargar. El preview y el producto público mostraron `rgb(49, 91, 70)` después de la recarga.
- Se verificaron las cuatro plantillas públicas en 375, 768 y 1440 px: sin desbordamiento horizontal y botones de cantidad de 44 px de altura. Los previews en esos tres tamaños tampoco desbordaron.
- Las medidas del iframe pueden aparecer escaladas en `getBoundingClientRect` porque el editor ajusta el canvas al espacio disponible; sus variables y ancho lógico siguen coincidiendo con los públicos.

## Pruebas automáticas

- Typecheck y build aprobados.
- Las 26 suites de `frontend/tests/*.cjs` aprobadas, incluidas variantes, stock, carrito, checkout y editor.
- Nueva `product-visual-consistency.cjs`: selector compartido, incremento/decremento, límites, accesibilidad, variables visuales y aislamiento del preview.
- `storefront-variants.cjs`: se conserva la verificación de SKU, precio y stock en las cuatro plantillas y se añade que comprar en el ejemplo no altera el carrito real.
- Se adaptaron las pruebas de stock y del editor al componente compartido, conservando sus verificaciones funcionales.
- `git diff --check` aprobado y estado del repositorio revisado.

## Pendientes y límites

El producto del editor sigue siendo representativo: sus fotos, atributos, stock y precio pueden diferir del producto real elegido por un cliente. Los relacionados públicos dependen del catálogo y no se consultan en el ejemplo. Los cambios de diseño se guardan mediante el mecanismo local existente del editor; no se añadió publicación remota.

La revisión manual no utilizó una cuenta real ni realizó un pago. Continúa el aviso de Vite sobre un paquete de más de 500 kB. No se cambiaron contratos, permisos, checkout, despacho ni promociones. No se aplicaron migraciones, ni se hizo commit, push o cambio de rama.
