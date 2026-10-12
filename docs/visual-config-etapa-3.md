# Etapa 3 — Integración visual del storefront

Fecha: 10 de octubre de 2026. Repositorio `ua-consultoria-openmind`, rama
`feature/mejoras-flujos-tienda`. Etapas 1 y 2 conservadas. Sin commit, push,
merge, rebase, reset, stash, cambio de rama ni migraciones.

## 1. Objetivo y arquitectura

Completar consumidores de la configuración visual efectiva y corregir diferencias
entre las vistas. Se mantiene la cadena defaults → preset → overrides → borrador,
el resolver central, los overrides parciales y el almacenamiento por tienda.
No se añadieron resolvers por página ni se persiste la configuración efectiva.

## 2. Páginas conectadas

Inicio, catálogo, producto, login, registro, carrito, checkout, confirmación,
seguimiento, perfil, lista y detalle de pedidos, términos, privacidad, reembolsos
y Nuestra historia en Velta. El retorno Webpay mantiene su flujo y recibe colores
de presentación. Las rutas privadas conservan sus permisos.

## 3. Consumidores visuales

Se sustituyeron utilidades de colores fijos en las páginas secundarias por tokens
de página/globales. Se marcaron superficies y acciones existentes; no se cambiaron
handlers, precios, consultas, cálculos o validaciones de negocio.

Los paneles consumen fondo, texto, borde, radio, padding y sombra. Los campos
consumen fondo, texto, borde, radio y padding. Los botones distinguen principal,
secundario, outline, ghost, accent, danger y selección. Cantidad conserva su
composición compacta, sin aplicar padding de un panel grande.

Se conectaron foco visible, disabled, borde de error, placeholder y accent-color
de checkbox/radio. Los campos con iconos conservan el espacio para ellos. Los
colores semánticos de Alert/Badge y los mensajes de stock permanecen separados
de los colores decorativos. No se introdujeron reglas nuevas con `!important`.

## 4. Paletas

Las cuatro paletas existentes ahora escriben doce propiedades: principal,
secundario, acento, fondo, texto, superficie y borde globales; fondo y texto del
encabezado; fondo de barra superior; fondo y texto del pie.

Aplicar una paleta coordina esas propiedades en el breakpoint seleccionado.
Editar luego una propiedad individual reemplaza solo esa hoja. En navegador,
Ciruela produjo fondo `#faf5ff`, cuerpo Arial y títulos Cambria; el pie se cambió
a `#234567` sin modificar la barra `#7e22ce`. Después, la barra se cambió a
`#3b2864` sin alterar el pie. Ambos valores persistieron al publicar y recargar.
Volver a elegir una paleta actualiza las propiedades incluidas en ella.

## 5. Tipografías

Se mantienen las 15 opciones aprobadas: sans, serif, sistema, Arial, Calibri,
Cambria, Georgia, Times New Roman, Verdana, Tahoma, Trebuchet MS, Courier New,
Garamond, Palatino y Comic Sans MS. Cuerpo y títulos son independientes.
Encabezados h1–h6 y clases de títulos usan la familia de títulos; controles usan
la del cuerpo. El branding conserva su tipografía institucional protegida.
Las fuentes locales tienen alternativas; no se descargan nuevas familias.

## 6. Landing

Se conservaron los consumidores aprobados de barra, header, Hero, CTA, categorías,
grilla, cards, beneficios/contenido, contacto, ubicación y footer. No se rehízo
el banner ni la arquitectura. La nueva conexión compartida del botón de compra
de cards también alcanza la landing. Se revisó junto a las páginas secundarias.

## 7. Catálogo

Se mantienen título, alineación, ancho, spacing, grilla, tarjetas, filtros y
paginación existentes. `catalog.grid` y `catalog.card` siguen independientes
de los de landing. Inputs y selects adoptan fondo, texto, borde, radio y fuente.

Velta tenía una conexión pendiente: su panel no consumía posición ni categorías.
Se conectó a `catalogLayout/catalogFilters/catalogResults`, al contrato de
categorías y a los handlers de filtrado ya existentes. El preset conserva panel
desplegable como presentación inicial; Izquierda/Arriba/Panel desplegable son
ahora utilizables. En móvil, la distribución pasa a columna y el panel se abre
con el botón. Sigue siendo un panel colapsable, sin offcanvas/backdrop.

La nueva barra lateral expuso una superposición de precio y botón en tarjetas
estrechas. Se corrigió haciendo que la fila de acciones pueda envolver su
contenido; los precios ya no quedan cortados. La categoría Ropa filtró tres
productos de QA y conservó `catalogo?cat=Ropa`.

## 8. Producto

Imágenes/superficies, información, precio, descripción, características, variantes,
cantidad y CTA consumen tokens de página/globales. `ProductAttributes` conserva
sus variantes de composición y reemplaza sus colores fijos. Selección y disabled
conservan sus estados; no se modificó la lógica de variantes ni stock.
Las cards relacionadas usan sus consumidores compartidos.

## 9. Login y registro

Ambos modos adoptan las mismas familias, superficies, campos, radios, bordes y
roles de botones. Se conservan modo, credenciales, handlers y validación existentes.
No se certificó autenticación contra Django o proveedores externos: el navegador
utilizó una sesión sintética de QA. Los comportamientos de demostración que ya
existían en algunas variantes no se reemplazaron por nuevas integraciones.

## 10. Carrito

Items, resumen, campos, cantidades, precios, acciones y estado vacío consumen la
presentación compartida. Eliminar conserva un rol de peligro y cantidad conserva
un control compacto. No se cambiaron persistencia, stock, precios ni navegación.

## 11. Checkout

Contacto, Entrega, Pago y Confirmación utilizan paneles, campos, selects, radios,
botones y spacing existentes. Se conserva el selector de cuatro etapas del editor,
válido solo dentro de su iframe. Fuera de él, `visualStep` no permite saltar etapas.

Invitado/Ingresar/Google muestran selección con `aria-pressed` y tokens de elección.
No se modificaron Webpay, transferencia, cotizaciones, shipping, stock, totales,
creación de pedidos, métodos de pago ni validaciones. El editor sigue interceptando
clics/envíos: no realiza compras desde la vista previa.

## 12. Confirmación

Se conservan exactamente las acciones «Ver mi pedido» y «Seguir comprando», sus
rutas y los datos de navegación. La página figuraba como editable pero redirigía
sin pedido. Ahora presenta un ejemplo exclusivamente dentro del iframe del editor,
con aviso «Pedido de ejemplo, sin compra realizada» y orden `VISTA-PREVIA`.
No llama servicios ni escribe pedidos. Un padre de otro origen no puede activar
el ejemplo; fuera del editor, sin estado de pedido, mantiene la redirección al
catálogo. El retorno Webpay conserva su rama anterior al ejemplo.

## 13. Seguimiento

Formulario, paneles de resultado, timeline, tipografías y acciones consumen tokens.
Badges de estado y errores mantienen significado semántico. No se alteraron
identificador/email, cancelación de consultas, privacidad, throttling o permisos.

## 14. Perfil y pedidos

Formularios, acciones, navegación de cuenta, lista, detalle y tabla heredan la
misma configuración. Se mantienen guards y llamadas existentes. QA ofrece un
perfil y un pedido sintéticos únicamente en la entrada de pruebas; no se
reemplazan datos reales en la aplicación de producción.

## 15. Legales e informativas

Términos, privacidad, reembolsos y Nuestra historia usan títulos, texto, superficies,
bordes y ancho de lectura de su composición existente. Los subtítulos se limitan
a 28 px para conservar jerarquía respecto del título principal configurable.
No se cambió el contenido legal ni se añadieron rutas informativas inexistentes.

## 16. Header y footer

Los cuatro layouts ya compartían la configuración efectiva y el badge institucional.
Se conservaron sus composiciones y navegación, sin reconstruirlos ni duplicar su
lógica. La publicación y el preview utilizan los mismos consumidores.
«Ver tienda» en el editor abre ahora la página seleccionada; no lleva el parámetro
de etapa de checkout a la tienda pública.

## 17. Branding

Logo original y referencia a Universidad Autónoma de Chile obligatorios en los
cuatro presets y tamaños. Se conservan tamaño y contraste protegidos, exclusión
del editor de imágenes y rechazo de `brandingVisible: false`. No se abrió otro
control de visibilidad ni se alteró la compatibilidad legacy de Etapa 2.

## 18. Presets

Studio Pop, Soft Discovery, Velta Editorial y Obsidian Showcase conservan geometría,
tipografías iniciales, colores y composición distintas. Las páginas adicionales
heredan los radios existentes del preset (8/28/0/14 px) y su sombra de tarjetas,
mediante un patch de preset generado desde sus valores existentes. Los overrides
explícitos por página y breakpoint se resuelven después y mantienen precedencia.
Los bordes de página sin personalización usan el borde global; un borde individual
explícito conserva su color.

## 19. Responsive

Revisión final: 13 vistas × cuatro presets × 375/768/1440 = 156 combinaciones.
Sin overflow horizontal, precios cortados ni pérdida de identificaciones.
Además, detalle de pedido en cuatro presets y tres tamaños, e historia en Velta
en tres tamaños: 15 combinaciones adicionales.

El checkout del editor se revisó en sus cuatro etapas y tres tamaños: 12 casos.
La confirmación de ejemplo se revisó en cuatro presets y tres tamaños: 12 casos.
Las tres posiciones del filtro Velta se revisaron en tres tamaños: nueve casos.
El ancho útil de los frames puede ser 10 px menor por la barra de scroll.

## 20. Navegador real y datos

Se utilizó React/Vite real en `127.0.0.1:5175`, con entrada y API sintéticas aisladas
en `tests/visual-review/`. No se transmitieron pedidos, datos de cliente o pagos
a Django, Webpay ni otro servicio. La entrada de QA no es importada por producción.

Se cambió y publicó Ciruela + Arial/Cambria, se abrió la tienda pública y se navegó:
Inicio → Ropa → Catálogo → Producto → Carrito → Contacto → Retiro → Transferencia
sintética → Confirmación QA-7001 → Ver mi pedido → Seguimiento. Se comprobaron
configuración, recarga y overrides independientes de barra/pie.

La API sintética permitió atravesar los handlers reales de navegación y pedido
sin efectuar una compra. Esto no certifica la integración bancaria ni de envío.
También se verificó que confirmación pública sin pedido redirige al catálogo.
Login/registro se abrieron mediante sus rutas, con sesión de QA ya iniciada; no
se afirma haber validado credenciales reales ni un acceso externo de extremo a extremo.

Evidencia en `docs/visual-review-etapa-3/`: `browser-checks.json`,
`catalogo-velta.jpg`, `producto-obsidian-mobile.jpg`, `confirmacion.jpg`,
`confirmacion-preview.jpg`, `seguimiento-mobile.jpg`, `checkout-preview.jpg`,
`tests.txt`, `build.txt` y estado Git final.

## 21. Tests y validación técnica

Las 15 suites frontend pasan: account-navigation, cart-checkout, checkout-shipping,
customer-orders, entrepreneur-profile, landing-content, landing-editor,
order-tracking, product-creation, product-editing, profile, stock-feedback,
storefront-variants, visual-config y visual-editor.

Se conservan 47 pruebas de configuración visual; el editor tiene 58. Las nuevas
pruebas cubren paleta/superficies, overrides independientes, geometría de presets
y precedencia responsive, ejemplo restringido al editor y conexión de filtros
Velta. La suite de tracking renderiza el ejemplo dentro del editor y verifica
la redirección fuera de él; las acciones reales de confirmación siguen cubiertas.
Persistencia sparse y aislamiento entre tiendas reutilizan las pruebas existentes.

`npm run typecheck`: aprobado. `npm run build`: aprobado después de los cambios
finales, incluyendo typecheck. 172 módulos; CSS 248,64 kB (gzip 32,54), JS 740,49 kB
(gzip 200,32). Permanece el aviso de chunk superior a 500 kB.
`git diff --check`: aprobado; los avisos LF/CRLF son normalización de fin de línea.
No se tocó backend en Etapa 3, por lo que no se ejecutaron sus suites ni migraciones.

## 22. Limitaciones y cierre

- Publicación local al navegador; sincronización remota/multidispositivo pendiente.
- No se certifican pagos, envío, autenticación o datos reales de producción con
  la evidencia de QA. Sus servicios y validaciones se conservaron.
- No se certificaron todas las combinaciones posibles de controles, contenidos
  largos, errores, variantes y métodos de pago en cada preset.
- Fuentes sujetas a instalación y alternativas. Contenido extenso puede ampliar
  el Hero y requiere revisión editorial.
- Filtro desplegable sigue siendo colapsable, sin offcanvas/backdrop; imágenes
  legacy siguen asociadas por índice DOM. Auditoría formal de accesibilidad y
  rendimiento, y división del bundle, quedan pendientes.

La Etapa 3 queda completada para la integración visual y el alcance validado aquí.
Se recomienda avanzar a Etapa 4 con estas limitaciones explícitas. No se inició.

### Archivos de esta etapa

`ThemeEditor.tsx`, `visualEditor/palettes.tsx`; contrato existente en `visual/defaults.ts`,
`presets.ts`, `cssVariables.ts`, `pages.ts`; `StorePageContent.tsx`, UI compartida,
`ProductAttributes.tsx`, `visual-config.css`; páginas `ProductDetail`, `Login`,
`Cart`, `Catalog`, `Checkout`, `OrderConfirmation`, `Tracking`, `Profile`,
`CustomerOrders`, `Legal`, `VisualStory`, `TransbankReturnResult`; tests
`visual-editor.cjs`, `order-tracking.cjs` y fixture `visual-review/fixture.ts`;
este informe y evidencia. Los cambios anteriores del repositorio se preservaron.

### Registro final

`git diff --check` terminó con código 0. Estado final: 49 archivos rastreados
modificados y 20 entradas sin rastrear (incluyen directorios y trabajo previo;
no representan el total de archivos nuevos). Rama sin cambios. Se comprobó que
el bundle de producción no contiene los marcadores de token/API/pedido/material
de la entrada de QA. El servidor de QA se detuvo al terminar la validación.

## Pendientes transferidos a Etapa 4

Actualización del 11 de octubre de 2026. La revisión del usuario identificó una
diferencia importante: consumir visualConfig no garantizaba una preview editable
con datos. Producto sin slug volvía al catálogo; carrito, compra y páginas privadas
dependían de datos/sesión reales. La evidencia anterior utilizaba el fixture de QA
y no certificaba esos estados en el editor de producción sin preparación.

El turno de conexión añadió ejemplos seguros en StorePageContent, controles de
geometría de producto/carrito/formulario, selector claro y separación general/página.
Después el usuario autorizó explícitamente Etapa 4 mediante su nuevo archivo.
Se completaron allí historia local, paneles, imágenes estables, contraste y división
del bundle. El cierre vigente está en `visual-config-etapa-4-final.md`.

La revisión real de navegador de estos últimos cambios quedó pendiente por límite
de uso del servicio de aprobación; no se reutiliza la evidencia antigua para
certificarlos. No hubo migración de BD ni una Etapa 5 iniciada.
