# SCRUM-495 — Revisión de accesibilidad

Fecha: 2026-10-31. Fuente: archivos reales de la rama `develop` (commit `d379679`). Alcance: Compradores y emprendedores: requisitos cumplidos y observaciones.

| Campo | Detalle |
| --- | --- |
| Ticket | SCRUM-495 · Revisión transversal de accesibilidad |
| Backlog | BL-421 (relacionado con BL-390 a BL-393) |
| Componente | Frontend: tienda del comprador y panel del emprendedor |
| Versión del código | Rama `develop`, commit `d379679` |
| Fecha | 31 de octubre de 2026 |
| Estado | Revisión del código y pruebas en el navegador (Lighthouse, teclado y zoom) realizadas; quedan solo comprobaciones opcionales (sección 8.3) |
| Resultado | 18 requisitos cumplidos y 15 observaciones (5 de severidad media y 10 baja); Lighthouse de accesibilidad: 100, 98, 96, 96, 100 y 100 |
| Evidencia | `docs/sprint7/SCRUM-495-evidencia/` (configuración del análisis y resultados en JSON) |

## 1. Propósito y alcance

Este documento recoge la revisión transversal de accesibilidad de las principales vistas y flujos de la aplicación, con el foco en las pantallas de **compradores** y de **emprendedores**. Cubre los siete aspectos del ticket: legibilidad del contenido, contraste, tamaños de texto, identificación de campos y botones, mensajes comprensibles, navegación por teclado y uso correcto de los elementos interactivos.

- **Comprador:** páginas de inicio de las cuatro plantillas, catálogo, detalle de producto, carrito, compra, confirmación, seguimiento, ingreso, perfil, preferencias comerciales y páginas legales.
- **Emprendedor:** las 16 páginas del panel (productos, pedidos, ventas, página principal, diseño, promociones, marketing, pagos, entregas, autenticación, contactos, correos, SEO, legal y perfil).
- **Referencia:** WCAG 2.1 nivel AA como guía. El ticket pide “requisitos básicos”, por lo que no se busca una certificación formal.

> **Alcance de esta revisión**
>
> Combina la revisión del **código fuente** con pruebas en el navegador hechas por el equipo (Lighthouse, teclado y zoom). No se probó con un lector de pantalla, que queda como prueba opcional (sección 8.3).

## 2. Método

1. Análisis estático de **250 archivos** TypeScript y TSX de `frontend/src` con `eslint-plugin-jsx-a11y`, en su configuración recomendada y en la estricta.
2. Revisión del código de los componentes compartidos (campos, diálogos, menús, tablas) y de cada hallazgo en su contexto, para separar los problemas reales de los falsos positivos.
3. Cálculo del contraste WCAG de las 10 paletas predefinidas y de las 4 plantillas, con la misma fórmula que usa el proyecto (`contrast.ts`).
4. Búsqueda de patrones en todo el código: tamaños de texto, foco, mensajes, títulos, enlaces de salto y movimiento reducido.
5. Ejecución de las pruebas de teclado y de adaptación a móviles que ya existen en el repositorio.
6. Pruebas en el navegador (Chrome) hechas por el equipo el 31 de octubre de 2026: Lighthouse de accesibilidad en 6 pantallas, recorrido con teclado y zoom desde 200 %.

## 3. Resumen por aspecto del ticket

| Aspecto | Estado | En una frase |
| --- | --- | --- |
| Legibilidad del contenido | Cumple con observaciones | Idioma declarado y encabezado principal en las 18 páginas de la tienda; Lighthouse da 100 en inicio, ingreso y panel, y 96 a 98 en catálogo, producto y compra por la estructura de encabezados y listas (O13 a O15) |
| Contraste | Cumple con observaciones | Texto, texto secundario, botones y color primario superan 4,5:1 en todas las paletas; fallan el color de acento usado como texto (O2) y los bordes de los campos (O5) |
| Tamaños de texto | No cumple en parte | Hay 162 usos de texto de 9 a 11 px en la tienda (O3); con zoom al 200 % el encabezado se desborda (O11) y aparece scroll horizontal (O12) |
| Identificación de campos y botones | Cumple | Campos con etiqueta y 230 elementos con `aria-label`; el interruptor de PayPal de la pantalla de Pagos tiene nombre (“Activar PayPal”); solo hay un interruptor sin nombre en un componente que ninguna pantalla usa (O1) |
| Mensajes comprensibles | Cumple | Mensajes en español y anunciados (41 alertas, 56 estados y 9 regiones en vivo) |
| Navegación por teclado | Cumple con observaciones | La compra se completa solo con teclado y el foco siempre se ve; el interruptor de PayPal se activa con Espacio. Falta el enlace “Saltar al contenido” (O4: 27 pulsaciones de Tab hasta el primer producto) |
| Uso correcto de elementos interactivos | Cumple con observaciones | 31 avisos del analizador: 7 corresponden a observaciones reales y 24 son patrones correctos (sección 5.1) |

## 4. Requisitos cumplidos

| # | Requisito | Evidencia |
| --- | --- | --- |
| R1 | Idioma de la página declarado | `index.html` con `<html lang="es">` |
| R2 | El zoom del navegador no está bloqueado | La etiqueta `viewport` no usa `maximum-scale` ni `user-scalable=no` |
| R3 | Imágenes con texto alternativo | La regla `alt-text` no arroja hallazgos en los 250 archivos |
| R4 | Botones con nombre accesible | La regla estricta `control-has-associated-label` no arroja hallazgos; hay 230 `aria-label` |
| R5 | Campos con etiqueta y error asociado | El componente `Input` de la tienda usa `label htmlFor`, `aria-invalid` y `aria-describedby` hacia el mensaje de error |
| R6 | Tablas con estructura accesible | Encabezados `th scope` y `caption` en el histórico diario, informes y ventas |
| R7 | Regiones con scroll accesibles por teclado | Tablas anchas con `role="region"`, nombre y `tabIndex=0` (7 casos) |
| R8 | Mensajes anunciados a las tecnologías de apoyo | 41 `role="alert"`, 56 `role="status"` y 9 `aria-live`; errores del panel traducidos con `humanizeAdminError` |
| R9 | Foco visible | Reglas globales `:focus-visible` en cabeceras, pies y controles de las cuatro plantillas y del panel; 144 estilos de foco |
| R10 | Teclado en menús y diálogos | Escape cierra los menús móviles y los diálogos; el panel usa `<dialog>` nativo, que mantiene el foco dentro |
| R11 | Teclado en componentes propios | Tarjetas interactivas con Enter y Espacio, pestañas con flechas, Inicio y Fin, y control de cantidad con flechas |
| R12 | Contenido principal alcanzable | `main` con `id` y `tabIndex=-1` en las cuatro plantillas y en el panel |
| R13 | Diseño adaptable a móviles | Las pruebas de adaptación (landing, catálogo, compra y acciones) pasan |
| R14 | Movimiento reducido respetado | `prefers-reduced-motion` en 3 archivos |
| R15 | Contraste del texto principal y de los botones | Texto sobre fondo desde 15,66:1, texto secundario desde 5,65:1 y botones desde 5,02:1 en las 10 paletas |
| R16 | Auditoría de accesibilidad del navegador | Lighthouse (móvil): 100, 98, 96, 96, 100 y 100, promedio 98,3; las únicas fallas fueron de estructura (encabezados y listas) |
| R17 | Interruptor de PayPal operable con teclado y con nombre | Se llegó con Tab y se activó con Espacio (M2); su nombre es “Activar PayPal” y Lighthouse en modo Snapshot dio 25 de 25 auditorías aprobadas (M6) |
| R18 | Flujo de compra operable solo con teclado | Se completó la compra usando solo el teclado y el foco se vio en todo momento (prueba M1) |

Además, el código no tiene ninguna supresión de reglas de accesibilidad (0 `eslint-disable`), y los títulos de pestaña de la tienda cambian según la página (`seoService`).

## 5. Observaciones

Son 15: 5 de severidad **media**, que conviene corregir antes de dar la accesibilidad por cumplida, y 10 **bajas**, que son mejoras.

| # | Aspecto | Observación y dónde | Severidad | Recomendación | WCAG |
| --- | --- | --- | --- | --- | --- |
| O1 | Campos y botones | El componente `PayPalConfigForm.tsx` (línea 110) tiene un interruptor oculto sin texto ni etiqueta. **Ninguna pantalla lo usa**: la tarjeta de PayPal de Pagos usa el componente `Toggle`, con `ariaLabel="Activar PayPal"` | Baja | Eliminar el archivo, o corregirlo antes de usarlo | 4.1.2 |
| O2 | Contraste | El color de acento como texto no llega a 4,5:1 en ninguna de las 10 paletas predefinidas (de 1,89 a 4,35). Se usa como texto en 7 lugares de la tienda (`CatalogHome`, `ProductCard`, `EditorialHome` y `Catalog`), alguno en 10 px | Media | Usar el color primario o el texto oscuro para texto, y dejar el acento para elementos decorativos o textos grandes | 1.4.3 |
| O3 | Tamaños de texto | Hay 162 usos de texto de 9 a 11 px en la tienda (los más frecuentes en `Cart`, `ProductDetail` y `ProductCard`, incluida la etiqueta del selector de variantes) y 14 reglas CSS; en el panel, 17 y 81. Son sobre todo rótulos en mayúsculas, pero algunos son funcionales | Media | Subir a 12 px como mínimo el texto informativo (idealmente 14 px) y priorizar las etiquetas de campos y variantes | 1.4.4, buena práctica |
| O4 | Teclado | No existe un enlace “Saltar al contenido” (0 encontrados), aunque `main` ya es enfocable. Quien navega con teclado debe recorrer toda la cabecera en cada página | Media | Agregar un enlace al inicio de las cuatro plantillas y del panel que apunte a `#main-content` | 2.4.1 |
| O5 | Contraste | Los bordes de los campos tienen 1,43:1 en las paletas del sistema (y 1,23 a 1,55 en 2 de las 4 plantillas), bajo el 3:1 para componentes de interfaz | Baja | Oscurecer el borde hasta 3:1 o sumar otro indicador (fondo, subrayado) | 1.4.11 |
| O6 | Legibilidad | El título de la pestaña del panel no cambia según la sección: solo la tienda lo actualiza (`seoService`) | Baja | Asignar `document.title` en cada página del panel | 2.4.2 |
| O7 | Teclado | `SoftwareVersionModal` no mueve el foco al abrirse y su texto de estado usa `text-neutral-400` (unos 2,5:1 sobre blanco, 11 px) | Baja | Enfocar el diálogo al abrir y usar un gris más oscuro | 2.4.3, 1.4.3 |
| O8 | Teclado | 5 campos de la tienda quitan el contorno con `outline-none` sin otra clase de foco en la misma línea: `ProductCard` (114), `Checkout` (2169), `MinimalHome` (158), `Catalog` (304) y `Cart` (796). Probablemente los cubre la regla global de foco | Baja | Comprobar con teclado que se ve el foco; si no, agregar `focus-visible` | 2.4.7 |
| O9 | Campos y botones | `TimePicker` pone `aria-invalid` en un botón, un rol que no lo admite. `TimePicker.tsx`, línea 50 | Baja | Quitarlo y enlazar el mensaje de error con `aria-describedby` | 4.1.2 |
| O10 | Elementos interactivos | `LandingPageContent` usa `<nav role="tablist">`, que reemplaza la región de navegación por un rol de pestañas. Línea 153 | Baja | Usar un `div` con `role="tablist"` | 4.1.2 |
| O11 | Tamaños de texto | Con zoom al 200 % los enlaces Inicio, Catálogo y Seguimiento del encabezado de la tienda se salen de la pantalla y no se ven; desde 250 % también los botones “Volver al panel” y “Salir”. Prueba manual M3. Código: encabezados de las plantillas y `AccountNavigation.tsx` | Media | Hacer que el encabezado pase al menú compacto antes (o que sus elementos se envuelvan) y probar con anchos de 960, 640 y 320 px | 1.4.4, 1.4.10 |
| O12 | Tamaños de texto | Con zoom al 200 % o más aparece scroll horizontal en las pantallas probadas; al 100 % no aparece. Probablemente sea consecuencia de O11 (el encabezado no se adapta). Si persiste al corregir O11, puntos de partida: usos de `100vw` en `CatalogHome.tsx` (188) y `Contacts.tsx` (60) | Media | Corregir O11 y repetir la prueba; si persiste, encontrar el elemento con el comando de la sección 9 | 1.4.10 |
| O13 | Legibilidad | Lighthouse (98) marca el orden de los encabezados: el título del producto es un `h3` sin `h2` previo en el catálogo. `ProductCard.tsx`, líneas 186, 350, 459 y 663 | Baja | Usar `h2` para los títulos de producto de los listados | 1.3.1 |
| O14 | Elementos interactivos | Lighthouse (96) marca el breadcrumb del detalle de producto: es una `ol` con enlaces y separadores “/” como hijos directos, sin `li`. `ui/index.tsx`, línea 306 | Baja | Envolver cada elemento en un `li` y marcar el separador con `aria-hidden` | 1.3.1 |
| O15 | Elementos interactivos | Lighthouse (96) marca el paso a paso de la compra: es una `ol` con `div` separadores como hijos directos. `ui/index.tsx`, línea 328 | Baja | Poner las líneas dentro de los `li` o dibujarlas con CSS | 1.3.1 |

### 5.1 Resultado del analizador, avisos revisados uno por uno

La configuración recomendada marcó **31 avisos en 23 de 250 archivos** (la estricta sumó 4 del mismo tipo). Se revisó cada uno en su contexto:

| Regla | Avisos | Conclusión |
| --- | --- | --- |
| `no-noninteractive-tabindex` | 7 | Patrón correcto: regiones con scroll enfocables, con rol y nombre (R7) |
| `label-has-associated-control` | 5 | 1 en un componente sin uso (O1, `PayPalConfigForm`); 4 son etiquetas que envuelven el campo con el texto en elementos anidados, que la herramienta no reconoce |
| `no-noninteractive-element-interactions` | 5 | Escape o flechas en menús, diálogos y el control de cantidad: aceptable |
| `click-events-have-key-events` | 4 | Clic en el fondo de los diálogos; el teclado cierra con Escape. En `SoftwareVersionModal` se suma el foco (O7) |
| `interactive-supports-focus` | 3 | Falsos positivos: el grupo de opciones de entrega (2) delega el foco en sus opciones, y el editor de campos (1) es `contentEditable` |
| `no-autofocus` | 3 | El foco se mueve a propósito tras una acción del usuario (diálogos de paletas y fuentes, renombrar borrador): aceptable |
| `no-static-element-interactions` | 2 | Los mismos fondos de diálogo de arriba |
| `no-noninteractive-element-to-interactive-role` | 1 | Real y menor (O10) |
| `role-supports-aria-props` | 1 | Real y menor (O9) |
| **Total** | **31** | **7 corresponden a observaciones (O1, O7, O9, O10; O1 está en código sin uso) y 24 son patrones correctos o falsos positivos** |

## 6. Contraste de las paletas

Se calcularon 101 pares de colores de las 4 paletas del sistema, las 6 heredadas y las 4 plantillas. El texto exige 4,5:1 y los componentes de interfaz 3:1.

| Par de colores | Casos | Mínimo | Máximo | Exigido | Resultado |
| --- | --- | --- | --- | --- | --- |
| Texto sobre el fondo | 14 | 15,66:1 | 20,38:1 | 4,50:1 | Cumple en todas |
| Texto sobre tarjetas | 12 | 16,34:1 | 18,71:1 | 4,50:1 | Cumple en todas |
| Texto secundario sobre el fondo | 12 | 5,08:1 | 10,20:1 | 4,50:1 | Cumple en todas |
| Texto secundario sobre tarjetas | 12 | 5,31:1 | 9,37:1 | 4,50:1 | Cumple en todas |
| Color primario como texto sobre el fondo | 14 | 4,81:1 | 18,88:1 | 4,50:1 | Cumple en todas |
| Color de acento como texto sobre el fondo | 14 | 1,89:1 | 18,88:1 | 4,50:1 | **No cumple en 10 de 14** |
| Texto del botón sobre el botón | 10 | 5,02:1 | 18,88:1 | 4,50:1 | Cumple en todas |
| Borde de campos sobre el fondo (no texto) | 13 | 1,23:1 | 18,88:1 | 3,00:1 | **No cumple en 12 de 13** |

Los valores bajos del acento y de los bordes son decisiones de diseño de las paletas, por lo que la corrección está en cómo se usan (O2 y O5) y no en cambiar la paleta.

## 7. Pruebas del equipo que respaldan la revisión

| Archivo | Qué comprueba | Resultado |
| --- | --- | --- |
| `frontend/tests/sprint7-keyboard-navigation.cjs` | Contenedor principal enfocable, anillo de foco visible, Escape en menús móviles, Enter y Espacio en tarjetas interactivas, y flechas en pestañas | 5 de 5 correctas |
| `frontend/tests/sprint7-responsive.cjs` | Landing, catálogo, compra y acciones en pantallas angostas, en las cuatro plantillas | 5 de 5 correctas |

## 8. Comprobaciones en el navegador

El equipo ejecutó estas pruebas en Chrome el 31 de octubre de 2026, con la aplicación local (`http://localhost:5173`) en el commit `d379679`.

### 8.1 Lighthouse: accesibilidad en móvil

| Pantalla | Puntaje | Fallas encontradas |
| --- | --- | --- |
| Inicio (`/plantilla/1`) | 100 | Ninguna |
| Catálogo (`/plantilla/1/catalogo`) | 98 | Orden de los encabezados: el título del producto (“Polerón”) es un `h3` sin `h2` previo (O13) |
| Detalle de producto (“Polerón”) | 96 | Estructura de lista inválida: el breadcrumb “Catálogo / Ropa / Polerón” es una `ol` con separadores que no son `li` (O14) |
| Compra (`/plantilla/1/compra`) | 96 | Estructura de lista inválida: los pasos “Contacto, Entrega, Pago, Confirmar” son una `ol` con `div` como hijos directos (O15) |
| Ingreso (`/plantilla/1/ingresar`) | 100 | Ninguna |
| Panel, Pagos (`/emprendedor/pagos`) | 100 | Ninguna |
| **Promedio** | **98,3** | **Las únicas fallas fueron de estructura (encabezados y listas)** |

Lighthouse analiza la pantalla recién cargada y no ve lo que aparece después de una acción. Por eso, para el interruptor de PayPal se repitió en modo Snapshot con el formulario abierto (prueba M6). No reemplaza la revisión del código.

### 8.2 Teclado, zoom y otras pruebas

| # | Prueba | Resultado | Conclusión |
| --- | --- | --- | --- |
| M1 | Teclado en la tienda | Se necesitaron 27 pulsaciones de Tab para llegar al catálogo y luego a un producto (el inicio de la tienda no está configurado). El foco se vio siempre y se completó la compra usando solo el teclado | Cumple en foco y en compra completa (R18); confirma O4: falta el enlace “Saltar al contenido” |
| M2 | Teclado en el panel | Se llegó con Tab al interruptor de PayPal y se activó con Espacio | Cumple: es operable con teclado (R17) |
| M3 | Zoom del navegador | Al 200 %, los enlaces Inicio, Catálogo y Seguimiento del encabezado se salen de la pantalla y no se ven. Desde 250 % también los botones “Volver al panel” y “Salir”. En el catálogo, el panel lateral de filtros desaparece pero aparece el botón de filtros que lo despliega; desde 250 % se ve un producto por fila, con Filtrar, Ordenar y Buscar visibles. En todas las pantallas probadas apareció scroll horizontal con el zoom aplicado; al 100 % no hay. El resto del contenido se ve bien | No cumple en el encabezado ni por el scroll horizontal (O11 y O12); el catálogo se adapta bien |
| M4 | Lighthouse | Ver la sección 8.1 | 98,3 de promedio |
| M5 | Lector de pantalla | No realizada (prueba opcional con NVDA) | Pendiente |
| M6 | Nombre del interruptor de PayPal | Lighthouse en modo Snapshot con el formulario de PayPal abierto: 25 de 25 auditorías aprobadas. En el código, el interruptor de Pagos usa `ariaLabel="Activar PayPal"` | Cumple; O1 queda como limpieza de código sin uso |

### 8.3 Pruebas opcionales pendientes

1. Si Escape cierra un diálogo del panel y el foco vuelve al botón que lo abrió (M2).
2. Prueba con lector de pantalla (NVDA) en ingreso y compra (M5).
3. Si el scroll horizontal persiste después de corregir O11, ubicar el elemento con el comando de la sección 9 (precisa O12).

## 9. Cómo reproducir el análisis

El analizador se instala en una carpeta aparte, para no modificar el `package.json` del proyecto (PowerShell, desde la raíz del repositorio):

```powershell
$a11y = "$env:TEMP\a11y"
New-Item -ItemType Directory -Force $a11y | Out-Null
Copy-Item .\frontend\src $a11y -Recurse -Force
Copy-Item .\docs\sprint7\SCRUM-495-evidencia\eslint.config.mjs $a11y
Set-Location $a11y
npm init -y
npm i eslint@9 typescript-eslint eslint-plugin-jsx-a11y typescript
npx eslint src
```

Contenido de `eslint.config.mjs`:

```ts
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
const base = jsxA11y.flatConfigs.recommended;
export default [{
  ...base, files: ['src/**/*.{ts,tsx}'],
  languageOptions: { ...base.languageOptions, parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
}];
```

#### Cómo encontrar el elemento que genera el scroll horizontal

En la pantalla afectada, abrir las herramientas de desarrollo (F12), ir a la pestaña **Console**, pegar este código y pulsar Enter. Devuelve el ancho de la página y los elementos que se salen por la derecha:

```js
({ pagina: document.documentElement.scrollWidth, ventana: document.documentElement.clientWidth,
   excedidos: [...document.querySelectorAll('*')]
     .filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
     .slice(0, 15).map(e => e.tagName + ' ' + String(e.className).slice(0, 70) + ' → ' + Math.round(e.getBoundingClientRect().right)) })
```

## 10. Conclusión y limitaciones

- **La base es sólida:** los campos, los mensajes, el foco y el teclado están resueltos con componentes compartidos; el analizador encuentra pocos problemas reales (7 de 31 avisos) y Lighthouse da un promedio de 98,3.
- **Lo que más pesa:** O11 y O12 (el encabezado se desborda y hay scroll horizontal con zoom) afectan a quienes amplían el texto; O2 (acento como texto), O3 (texto pequeño) y O4 (enlace de salto) afectan a quienes tienen baja visión o usan teclado.
- **Lighthouse y el código se complementan:** Lighthouse encontró tres problemas de estructura (O13 a O15) que el análisis del código no ve; el análisis del código marcó un interruptor sin nombre (O1), pero en un componente que ninguna pantalla usa, y Lighthouse confirmó que el real tiene nombre.
- **Limitaciones:** no se probó con lector de pantalla; los contrastes se calcularon sobre las paletas y no sobre las imágenes de fondo; no se evaluó el contenido que escribe cada emprendedor (por ejemplo, el texto alternativo de sus imágenes); las pruebas de Lighthouse y zoom se hicieron en la plantilla 1.
- **Cierre del ticket:** la revisión está completa según el criterio de finalización. Las pruebas de la sección 8.3 son opcionales; queda decidir qué observaciones se corrigen y cuáles se aceptan.
