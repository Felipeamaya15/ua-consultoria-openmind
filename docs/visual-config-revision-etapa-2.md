# Revisión técnica, funcional y visual — Etapa 2

Repositorio: `C:\Users\maria\Ecommerce\ua-consultoria-openmind`.
Rama conservada: `feature/mejoras-flujos-tienda`. Fecha: 10 de octubre de 2026.

Resultado: las comprobaciones técnicas pasan y el flujo local de edición, guardado,
recarga y consumo público funciona. Se recomienda avanzar a Etapa 3 dentro del
alcance señalado al final. Esta revisión no certifica publicación remota ni sustituye
una prueba autenticada contra Django. No se implementó una nueva etapa.

La comparación usa el estado actual, `git diff`, la versión anterior de ThemeEditor
en HEAD y los informes de Etapa 1. Como las dos etapas tienen cambios sin commit,
el diff contra HEAD incluye ambas; no se presenta ese diff completo como si fuera
exclusivamente Etapa 2. Se conservaron los cambios anteriores.

## 1. Problemas encontrados

| Hallazgo comprobado | Consecuencia | Resolución |
| --- | --- | --- |
| Paletas rápidas ausentes durante la refactorización | Pérdida de los cuatro atajos anteriores | Restituidas en módulo propio |
| Cards/grilla seleccionadas en catálogo apuntaban al inspector de landing | Cambios en una rama diferente al consumidor visible | Inspector y reset usan `catalog.card`/`catalog.grid` |
| Preview capturaba una imagen ya personalizada como original | Restaurar tras recargar podía conservar la imagen publicada | Baseline DOM compartido antes de personalizar |
| Escala de imagen admitía 500 en el control, pero persistencia admite 400 | Valor visible no sobrevivía al guardado | Límite del control corregido |
| Iframe ocupaba el ancho disponible sin preservar viewport lógico | Desktop podía mostrar estilos de tablet o recortarse | Viewport fijo y ajuste de escala por ResizeObserver |
| Algunos tokens nuevos no tenían consumidor efectivo | Inputs sin efecto real | Marcadores y reglas conectados; controles no disponibles deshabilitados |
| Header sticky anidado de Soft Discovery | Sticky quedaba limitado por el contenedor | Sticky aplicado al shell del header |
| Categorías del header heredaban geometría de tarjetas | Franja crecía y tapaba el contenido | Franja conserva flex y no hereda aspect ratio |
| Grilla anidada y botón de Velta desbordaban a 375 px | Scroll horizontal de 411 px frente a 365 útiles | Grilla responsive y botón acotado |
| CTA outline ignoraba el color de texto elegido | Control sin efecto en esa variante | Consumidor de texto común a las variantes |
| Textos internos de cards oscuras conservaban colores claros de otra plantilla | Legibilidad inconsistente | Herencia del color de superficie/texto |
| Regla de toggle nueva podía ocultar filtros originales de Velta en desktop | Pérdida de navegación funcional de filtros | Toggle original fuera de esa regla |
| Nuevos paddingTop/Bottom de beneficios heredaban 64 en vez de su paddingY=16 | Cambio accidental del espaciado base | Ambos nuevos defaults quedan en 16 |
| Mocks antiguos de stock/variantes no cargaban el nuevo contrato de IDs | Fallo de suites sin fallo de lógica de compra | Mocks actualizados para importar contrato real |

## 2. Problemas corregidos

Se corrigieron los hallazgos de la tabla y se completaron los consumidores necesarios
para revisar el editor. Los cambios afectan composición visual, selección, controles,
restauración y pruebas. Los manejadores de SKU, stock, carrito, checkout y pagos
conservan su lógica. Las suites de negocio pasaron después de las correcciones.

No se añadió una integración de filtros nueva a Velta: sus controles de posición y
categorías dentro del grupo Catálogo están deshabilitados y explican el pendiente.
Su panel original sigue disponible. Así se distingue una limitación de integración
de una regresión funcional, que sí fue corregida.

## 3. Regresiones de ThemeEditor

Las paletas antiguas se recuperaron con sus nombres y colores originales: Océano,
Bosque, Ciruela y Grafito. La edición de imágenes se mantiene en un inspector
separado; su restauración ahora recupera fuente y estilos anteriores a la publicación.
El máximo de escala coincide con la normalización. El error de guardado no se
transforma en éxito: si `setConfig` falla, el borrador sigue dirty.

El antiguo popover de imagen se sustituyó por el inspector lateral. La funcionalidad
se conserva; no se mantuvo la posición flotante del popover como requisito visual.

## 4. Funcionalidad antigua preservada

- Plantilla determinada por Diseño/query validada o configuración existente.
- Colores libres y cuatro paletas rápidas; colores legacy compatibles.
- Imagen por URL/archivo, encuadre X/Y, escala, radio y restauración.
- Iframe de la tienda real, guardar, mensajes de éxito/error y apertura pública.
- Links y navegación pública, catálogo, carrito y feedback de stock.
- Configuración scoped de Etapa 1 y overrides parciales por plantilla.

Las imágenes de contenido de negocio siguen perteneciendo a Landing Page/Productos,
como establece la protección de Etapa 1. El aviso identifica esos editores.

## 5. Arquitectura actual

| Archivo | Responsabilidad |
| --- | --- |
| `controls.tsx` | Inputs reutilizables, validación de controles, labels y resets |
| `model.ts` | Documento sparse, resolución central, dirty, edición, resets y publicación |
| `sections.ts` | Catálogo con etiquetas y selección desde marcador |
| `sectionIds.ts` | Contrato tipado de IDs compartido con storefront |
| `inspector.tsx` | Descriptores tipados de propiedades, grupos y contexto responsive/catálogo |
| `palettes.tsx` | Atajos de las paletas anteriores |
| `images.tsx` | Inspector legacy de imágenes |
| `preview.ts` | Delegación de eventos, CSS del draft, resaltado y cleanup |
| `ThemeEditor.tsx` | Composición, estado React, guardado, navegación y ciclo del iframe |

Se utiliza el resolver de Etapa 1; no se creó otro algoritmo para obtener valores
efectivos. El editor distingue documento guardado y borrador, y la selección no vive
dentro del documento persistible. La caché de selección del puente solo representa
el resaltado DOM; React mantiene el estado que gobierna sidebar e inspector.

## 6. Selección visual

Hay 13 IDs tipados, únicos y compartidos. Los componentes usan `VISUAL_SECTION`
para emitir `data-visual-section`. La selección usa `closest`, por lo que un elemento
interno llega a su sección más cercana. Hover y selección tienen trazos diferentes.

En navegador se comprobó selección directa de TopBar, Header, Hero, CTA, Categories,
Contact, Location y Footer; selección de card dentro del catálogo; sidebar de grilla
y su atributo de resaltado. El inspector mostrado coincidió con cada sección.
Seleccionar no activó dirty. Para una sección ausente se muestra aviso, conservando
sus ajustes para cuando exista contenido. No todas las plantillas muestran todas las
secciones de negocio en cada página.

## 7. Iframe y preview

Protocolo same-origin v1: IDs de sección y eventos capturados/delegados. Click y submit
no navegan en el iframe conectado al editor; la tienda independiente conserva sus
eventos. Hay acciones explícitas para probar un link y abrir la tienda en otra pestaña.

El puente desconecta listeners, MutationObserver y estilos al recargar/unmount; el
ResizeObserver de escala también se desconecta. Las cargas asíncronas se atienden
con un observer de childList, sin observar los atributos que el propio puente escribe.
Las variables del borrador usan un stylesheet separado para sobrevivir a actualizaciones
React. Los `!important` quedan en ese stylesheet y en el resaltado del editor.

Secciones/productos no dependen de índices DOM. Solo las imágenes legacy mantienen
`image-N`, cuya limitación se conserva explícitamente. La captura del original usa un
símbolo compartido sobre el nodo DOM: no se guarda en storage ni contamina el schema.

## 8. Dirty y draft local

Editar modifica el documento local y actualiza el iframe. El modelo no escribe storage.
Solo guardar llama al repositorio. Cargar, cambiar sección o viewport no activa dirty.
Guardar con éxito y descartar lo limpian; fallo de guardado lo conserva. Reset cambia
dirty si el documento resultante difiere del baseline.

Navegación React con cambios abre advertencia; se comprobó en navegador. La primera
acción recibe foco, Tab queda dentro del diálogo y Escape permite seguir editando.
`beforeunload` protege cierre/recarga según las reglas del navegador. Su instalación y
cleanup se revisaron en código; no se afirma haber automatizado el diálogo nativo.

## 9. Guardar y publicar

Prueba REAL de navegador con API sintética y localStorage real: editar hero/CTA/cards/
categorías/footer → guardar → recargar editor → valores conservados → abrir
`/plantilla/1` sin editor → consumidores conservados. También se publicó una TopBar
verde y una card de catálogo con radio independiente de 41 px.

La publicación visual sigue siendo local, por tienda/API y navegador. La UI de éxito
lo explica. No se envió una publicación visual a Django ni se validó que otro dispositivo
vea esos cambios. El fixture nunca se importa por la entrada de producción.

## 10. Descartar

En navegador, cambiar el ancho del CTA y descartar devolvió 420 px y pill al estado
guardado. Restaurar una imagen original y descartar devolvió su radio guardado de
25 px. Los tests verifican documento, imágenes y contenido preservados; no se
cambia la plantilla guardada ni se publica al descartar.

## 11. Reset de propiedad

Elimina la hoja de las ramas de plantilla y comunes para recuperar la herencia del
preset; no copia el valor efectivo. Para colores retira también su equivalente legacy.
El test cambia posteriormente el radio del preset y comprueba que el valor heredado
se actualiza, conservando overrides hermanos. La publicación sparse no reintroduce
el color heredado después del reset.

## 12. Reset de sección

Retira la rama elegida y sus ramas tablet/mobile sin tocar hermanos. En catálogo,
card/grilla retiran `catalog.card`/`catalog.grid`, no las ramas de landing. Se comprobó
en tests y en navegador: editar radio de card de catálogo y reset volvió al 12 heredado.

## 13. Restaurar preset

Retira overrides visuales comunes y de la plantilla activa, incluidos colores legacy.
Conserva imágenes, contenido de negocio y overrides de otras plantillas. La confirmación
explica que los comunes también se retiran; esto puede afectar otras plantillas que
heredaban esos comunes. Solo guardar publica el resultado.

Esta semántica está cubierta por tests del modelo. El intento de automatizar la
confirmación nativa `window.confirm` bloqueó el canal de control de esa pestaña del
navegador embebido; no se declara validado visualmente el ciclo completo de esa
confirmación. Los otros flujos se comprobaron en una pestaña independiente.

## 14. Hero

Altura mínima, alineación horizontal/vertical, título/subtítulo, ancho de texto, overlay,
intensidad/color, spacing y posición del CTA tienen tokens y consumidores. Se añadieron
marcadores de layout/content/overlay a los cuatro homes. Soft conserva su composición
con tarjetas flotantes; un overlay propio no reordena ese diseño.

En navegador se cambió alineación horizontal y se observó el efecto inmediato. Se
inspeccionaron los cuatro heroes a 375/768/1440. Los demás controles tienen cobertura
de contrato y consumidores CSS; no se simularon visualmente todas sus combinaciones.

## 15. CTA

En navegador se verificaron left/center/right (`flex-start`/`center`/`flex-end`), auto,
full y custom. El ancho custom de 420 px llega a tienda pública y queda acotado por
`max-width:100%` en móvil. Square/rounded/pill producen 0/8/999 px en el caso probado;
solid/outline/ghost cambian fondo y borde. El texto respeta su color en las variantes.

Padding X/Y, font size/weight y borde tienen consumidores. Controles irrelevantes se
deshabilitan (radio con square/pill, fondo no solid, borde ghost). El resolver rechaza
customWidth negativo, infinito, NaN o string; los tests verifican fallback válido.

## 16. Header

Background, texto, altura mínima, logo, nav alignment/gap, borde, sombra y sticky
tienen consumidores. En navegador se desactivó sticky y se obtuvo `position:relative`.
La activación produce `sticky`; Soft aplica el estado al shell, evitando el límite del
padre corto. Soft y Velta conservan su estado estático original como preset; Studio y
Obsidian heredan sticky. Altura es mínima para permitir wrapping en tamaños pequeños.

## 17. TopBar

Visible, fondo, texto, altura, alineación y fuente usan variables scoped; la franja
institucional dejó de imponerse desde el azul inline anterior. En navegador se editó
`#157347`, se guardó y se verificó `rgb(21,115,71)` en la tienda independiente. Los
tests comprueban false, altura 0 y tamaño de fuente. El azul de presets sigue siendo
un valor base válido, no una regla que impida personalizar.

## 18. ProductCard

Tamaño compact/normal/large corresponde a density compact/normal/spacious, con
factores .85/1/1.15. Hay consumidores de padding, radio, borde, sombra, imagen/ratio,
título/precio, descripción, botón visible/ancho/forma/radio y alineación.

Varias cards de landing mostraron radio 30 px y las de catálogo 41 px tras publicar.
La grilla Velta móvil se corrigió usando el consumidor responsive en su grilla anidada.
La lógica de variantes, agregar al carrito y stock no fue reescrita. No todas las
cards decorativas/focales de un hero se tratan como ProductCard: pertenecen al Hero.

## 19. Categories

Pills/cards/links, columnas, gap, padding, radio, fuente, alineación, borde, sombra y
fondo tienen consumidores donde existe esa sección. Pills se probó en navegador.
Las imágenes se ocultan para links/pills. Los controles sin efecto en la presentación
elegida se deshabilitan. La franja de header y las categorías de filtro conservan su
layout flexible; los filtros conservan selección con `aria-pressed`.

Velta catálogo no tiene ese consumidor de categorías y lo señala en el inspector.
No se certifica cambio visual de categorías en una página donde no hay categorías.

## 20. ProductGrid

Columnas desktop/tablet/mobile y gap/ancho se consumen en landing y catálogo.
Los campos explícitos de columnas guardan cada viewport en su hoja; los demás campos
pueden editar overrides parciales tablet/mobile. Las grillas del catálogo usan su rama
propia. Se observaron grillas reales de los cuatro presets en los tres anchos, con una
columna en móvil y dos en tablet para los catálogos, y tres en desktop.

## 21. Footer

Footer real tiene background/text, layout/columnas, alineación, padding superior/
inferior, gap, título/visibilidad, branding y max-width. Se marcaron bloques reales de
los cuatro footers; Obsidian recibió la línea de branding requerida por su control.
En navegador, fuera del editor, el fondo guardado fue `rgb(35,69,103)` (`#234567`).
Ancho y columnas responsive se inspeccionaron. No se ejecutaron visualmente todas las
combinaciones de branding/títulos/layout; su conexión se revisó en código/tests.

## 22. Catalog

Heading, alignment, spacing, contentWidth, grid y cards tienen consumidores en las
cuatro variantes. Selección de cards/grid redirige al modelo de catálogo. Studio,
Soft y Obsidian consumen left/top/drawer; top se comprobó como flex-direction column.
Drawer representa un panel colapsable, no un drawer offcanvas con backdrop. Se
publicó y se abrió el panel en la tienda pública.

Velta conserva su panel original y botón operativo en desktop; se comprobó abierto
con `aria-expanded=true`. El fixture no incluye sus atributos dinámicos de filtrado,
por lo que mostró el vacío original “No hay filtros disponibles”. Posición y categorías
de ese catálogo quedan pendientes para Etapa 3 y deshabilitadas en UI.

## 23. Storefront público

Se abrió sin editor la ruta `/plantilla/1` y se comprobaron CTA 420 px/pill 999 px,
cards de landing 30 px, categorías pills, TopBar verde y footer `#234567`. En catálogo
se comprobaron cards 41 px. No existían `ua-theme-preview-vars` ni estilos especiales
del editor: las variables procedían de la configuración publicada.

Se hizo click en el link público Catálogo y navegó a `/plantilla/1/catalogo`; el toggle
de filtros abrió su panel. En editor, los clicks de selección no cambiaron la URL del
iframe. Se conservaron los handlers de CTA/links de la tienda normal.

## 24. Responsive

| Superficie | 375 px | 768 px | 1440 px |
| --- | --- | --- | --- |
| Cuatro homes | Inspección visual; sin overflow después de corregir Velta | Inspección visual; sin overflow | Inspección visual; sin overflow |
| Cuatro catálogos | 365 px útiles y scrollWidth 365 | 758 útiles y scrollWidth 758 | 1430 útiles y scrollWidth 1430 |
| Editor | Stack vertical, controles accesibles, scrollWidth 375 | Tres paneles, inspector 270 px, scrollWidth 768 | Tres paneles, iframe desktop lógico y ajuste de escala |

Las diferencias entre viewport y ancho útil corresponden a scrollbar, no overflow.
No se encontró scroll horizontal en las páginas comprobadas. La vista de tablet en
el editor se escala para dejar usable el inspector; no cambia el viewport interno a
desktop. El override temporal de viewport se restableció al terminar.

## 25. Accesibilidad básica y controles

Inputs tienen aria-label, resets nombrados, toggles/segmentos estado pressed/checked,
secciones un nav etiquetado, iframe title y mensajes status/alert. Hay foco visible,
labels textuales de paletas y estados Heredado/Personalizado. Disabled llega también
al reset. Números conservan 0, toggles false; sliders incluyen output y step/unidades.

Se comprobó el foco inicial y Escape en advertencia de navegación. No se realizó
auditoría automática WCAG ni contraste exhaustivo de colores que el usuario puede
elegir, ni pruebas con lectores de pantalla. Esa cobertura avanzada sigue pendiente.

## 26. Presets y defaults

Studio mantiene serif/azul y franja de categorías; Soft, tipografía grande sans,
composición flotante y morado; Velta, editorial blanco/negro y bordes; Obsidian,
superficies oscuras y acento naranja. Se inspeccionaron los cuatro en navegador.

Se añadieron defaults para campos nuevos, sin sustituir los valores anteriores por
los de un inspector. Padding independiente hereda paddingY/padding legacy, radio de
botón hereda radio de card mientras no haya override explícito. Beneficios conserva
16 px. Sticky false en Soft/Velta conserva comportamiento previo; customWidth base
320 solo se usa cuando se elige custom. Los presets siguen siendo parches del baseline.

## 27. Persistencia, aislamiento y rendimiento

Continúa el envelope v1 scoped por API/storeId. El modelo parte de overrides raw y
legacy raw, evitando persistir colores efectivos como si fueran explícitos. Guardar
rehidrata AdminContext desde el repositorio. La prueba de otra tienda verificó que
guardar no altera su clave; otra instalación API tampoco comparte namespace.

El flujo de navegador guarda en el origen QA 5175, API sintética y tienda 987654.
No cambió configuración local de la tienda real del origen 5173. No hay persistencia
por slider, reload de iframe ni fetch disparado por propiedad visual; el src del iframe
depende de plantilla/página. Resolución memoizada, updates de variables y observer
de childList evitan recargas. Se revisó este camino; no se tomó un perfil de rendimiento
con métricas cuantitativas. La emisión CSS tiene 160 tokens base con aliases responsive.

## 28. Tests

Resultado final: **15 suites frontend aprobadas**, incluyendo **47 tests de configuración
visual** y **34 del editor**. Las pruebas del editor cubren selección/protocolo/cleanup,
draft/dirty/guardar/error/descarte, resets, herencia futura, 0/false, customWidth inválido,
sticky, TopBar, cards, categorías/footer, responsive, consumidores CSS, catálogo,
paletas, imágenes y aislamiento de tiendas. Parte del test de ThemeEditor usa hooks
mockeados; se complementó con la prueba REAL del flujo en navegador.

También se volvieron a ejecutar **4 SimpleTestCase backend**, aprobados, sin acceso
a BD, creación de BD de pruebas ni migraciones. No hubo cambios backend nuevos en
Etapa 2; se cubrió el contrato de identidad ya pendiente de Etapa 1.

Comandos desde frontend:

```powershell
npm run typecheck
npm run build
Get-ChildItem tests -Filter '*.cjs' | Sort-Object Name | ForEach-Object {
  node $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "Falló $($_.Name)" }
}
```

Desde backend: `.\venv\Scripts\python.exe manage.py test apps.visual_config.test_store_identity --noinput`.

## 29. Validación visual REAL y reproducción

Se usó navegador embebido, DOM real, controles reales y screenshots. Datos de productos,
landing, perfil y sesión son sintéticos, servidos por el fixture; la ejecución React,
iframe, CSS y localStorage son reales. No se fingió una sesión Django ni se emitieron
escrituras al backend. Se comprobó explícitamente guardar → recargar → abrir público,
además de descarte, restauración de imagen, CTA, selección y responsive descritos arriba.

Evidencia: [editor](visual-review-etapa-2/editor.jpg) y
[storefront independiente](visual-review-etapa-2/storefront.jpg).

Para reproducir desde frontend:

```powershell
$env:VITE_API_URL='http://visual-review.example.test'
npm run dev -- --config tests/visual-review/vite.config.ts --host 127.0.0.1
```

Abrir el puerto que imprima Vite y `/emprendedor/diseno/editor?plantilla=editorial`.
Este entry de pruebas no forma parte del build de producción. La regla de transformación
del fixture contempla el query de HMR. Los detalles de producto también se simulan para
que el catálogo pruebe productos con SKU, stock y descripción.

## 30. Typecheck

`npm run typecheck` aprobado. El build final volvió a ejecutar ambos proyectos
TypeScript (`tsconfig.app.json` y `tsconfig.node.json`) sin errores.

## 31. Build

`npm run build` aprobado: 168 módulos, CSS 142.52 kB (gzip 22.37), JS 710.06 kB
(gzip 195.51). Vite advierte chunk mayor a 500 kB; queda pendiente evaluar división
por rutas. No se alteró el límite para esconder la advertencia.

La primera ejecución en sandbox falló por EPERM en realpath de `src/main.tsx`. La
misma validación se ejecutó correctamente fuera del sandbox mediante la aprobación
del entorno. No fue un error de TypeScript ni de código generado.

## 32. Diff y Git

`git diff --check` aprobado, sin errores de whitespace. Git informa conversión futura
LF/CRLF en ThemeEditor; no se ejecutó ninguna operación para normalizar o alterar el
historial. `git branch --show-current` confirmó `feature/mejoras-flujos-tienda`.
`git status --short` sigue mostrando modificaciones y archivos nuevos pendientes.

No se ejecutaron commit, push, merge, rebase, reset, stash, cambio de rama ni migraciones.

## 33. Archivos modificados y nuevos

El inventario íntegro de `git status --short` se conserva en
[estado del repositorio](visual-review-etapa-2/git-status.txt). Incluye cambios previos
de Etapa 1; no deben atribuirse todos a esta revisión.

Los archivos principales de Etapa 2/revisión son:

- `frontend/src/features/admin/pages/ThemeEditor.tsx` y `context/AdminContext.tsx`.
- `frontend/src/features/admin/visualEditor/{controls,model,sections,inspector,preview,palettes,images}.tsx/ts` y `editor.css` (ver nombres reales en inventario).
- `frontend/src/features/storefront/visual/{types,defaults,presets,resolveVisualConfig,cssVariables,imageSettings,sectionIds}.ts`.
- `frontend/src/styles/visual-config.css`.
- `StoreVisualRoot`, layouts/headers/footers de cuatro plantillas y `ProductCard`.
- Homes `EditorialHome`, `MinimalHome`, `VisualHome`, `CatalogHome`, `Catalog` y `LandingDetails`.
- `frontend/src/features/storefront/context/StoreContext.tsx`.
- `frontend/tests/visual-config.cjs`, `visual-editor.cjs`, `stock-feedback.cjs`, `storefront-variants.cjs` y fixture `tests/visual-review/`.
- Este informe y `docs/visual-review-etapa-2/` con evidencia.

`Checkout`, Transbank, servicios/identidad/storage y el cambio backend que aparecen
en status corresponden al trabajo anterior de Etapa 1, no a una nueva lógica de pagos
añadida durante la revisión del editor.

## 34. Limitaciones pendientes

- Publicación local; no sincronización remota/multidispositivo ni sesión Django
  autenticada comprobada en navegador.
- Posición/categorías de filtros Velta pendientes de integración y deshabilitadas.
- Drawer como panel colapsable; offcanvas y backdrop no implementados.
- Confirmación nativa de restaurar preset cubierta en modelo, con limitación de
  automatización del navegador embebido indicada en el punto 13.
- Imágenes legacy por índice DOM: reordenar imágenes puede cambiar esa asociación.
- No se probaron visualmente todas las combinaciones de cada control en cada preset;
  se separa la prueba visual de la cobertura de schema/tokens/consumidores.
- Contraste/lectores de pantalla y medición formal de rendimiento pendientes.
- Bundle con aviso de tamaño y componentes de contenido ausentes según plantilla.

## 35. Recomendación para Etapa 3

**Sí, recomiendo avanzar a Etapa 3 para continuar las integraciones visuales pendientes.**
La base del editor tiene responsabilidades separadas, overrides parciales, guardado
local comprobado fuera del preview y suites técnicas aprobadas. Se corrigieron las
regresiones reales encontradas. La aceptación debe conservar el alcance de publicación
local y las limitaciones explícitas de catálogo/Velta, en vez de tratar esta revisión
como certificación de publicación remota o cobertura visual exhaustiva.

No se implementó Etapa 3 y todos los cambios siguen disponibles para revisión sin commit.

## Ajustes UX posteriores a la revisión

Fecha: 10 de octubre de 2026. Esta sección actualiza las conclusiones anteriores:
la identidad institucional ya no es editable ni ocultable, y la confirmación de
restaurar diseño utiliza un diálogo React verificado en navegador. Después, el
usuario amplió el alcance visual a paletas, fuentes y las demás páginas públicas.
La ampliación utiliza el mismo resolver, borrador y almacenamiento de overrides.

### 1. Tamaño real de la portada

El selector «Tamaño del banner principal» escribe las alturas existentes para
computadora/tablet/móvil: Pequeño 320/280/260, Mediano 480/400/340, Grande
640/520/440 y Destacado 800/640/520 px. La altura anterior sigue disponible
en «Ajuste avanzado de altura» y se identifica como personalizada.

Se corrigió la imagen que imponía su altura natural al contenedor: ahora ocupa
el marco del banner con `object-fit: cover`. El encuadre Arriba/Centro/Abajo
usa el nuevo campo validado `hero.imagePosition`. En Soft Discovery se reducen
las decoraciones y el espaciado con la altura; las categorías existentes quedaron
después de la portada para que no impongan su tamaño mínimo.

La altura es mínima: contenido largo puede ampliarla para conservar texto y
botones completos. En navegador, Studio Pop midió 320/480/640 px en computadora,
280/400/520 en tablet y 319/340/440 en móvil. Soft Discovery midió aproximadamente
378/504/672, 362/420/546 y 373/448/508 respectivamente. No hubo desbordamiento.

### 2. Causa y corrección de «Ropa»

`EditorialLayout` generaba una navegación adicional de categorías dentro del
encabezado, antes del Hero. No era un breadcrumb ni un filtro. Esa franja duplicaba
la sección de categorías que ya renderiza `EditorialHome`.

Se retiró la franja del layout y se conservó la sección existente. «Ropa» mantiene
su enlace `catalogo?cat=Ropa`: comprobado en la tienda pública y visible dentro
de la misma sección en el editor. Las etiquetas de categoría de cada producto
siguen siendo información del producto, no una segunda navegación.

### 3. Nombres claros

Portada principal, Botón principal, Encabezado, Barra superior, Distribución de
productos, Diseño de productos y Parte final de la página sustituyen los términos
técnicos. Opciones, grupos, instrucciones, restablecimiento e imágenes usan
etiquetas en español. Los identificadores del contrato conservan compatibilidad.

### 4. Ayuda contextual

`FieldHelp` muestra una «i» circular y texto accesible mediante hover, foco y clic.
Relaciona botón y explicación con `aria-describedby`, expone `aria-expanded` y
permite cerrar con Escape. Cubre portada, tamaño, botón principal, categorías,
productos, pie, identidad y las nuevas secciones de páginas.

La explicación ocupa espacio dentro del inspector y mantiene el botón en su
posición, evitando superposición y movimientos que interrumpan el clic.
Se verificaron clic, foco, Escape y ausencia de superposición en 1440/768/375 px;
hover tiene además cobertura automática. No se incorporaron dependencias ni GIFs.

### 5. Identidad institucional obligatoria

Se eliminó el control de visibilidad y se presenta «Identidad institucional ·
Elemento obligatorio de la plataforma». Los cuatro layouts y pies utilizan la
misma identificación con logo original y referencia completa a la Universidad
Autónoma de Chile. El logo conserva 32 px y el texto 12 px, contraste fijo y
visibilidad independiente de los colores o títulos personalizados.

La barra institucional permanece visible aunque existan valores antiguos de
barra oculta o altura cero. El editor de imágenes también excluye sus logos y
explica que no se pueden reemplazar. Restablecer pie y restaurar diseño mantienen
la identidad, comprobado con acciones reales en el editor.

### 6. Compatibilidad antigua

`brandingVisible` permanece en el contrato para lectura, pero el resolver rechaza
`false` y el valor efectivo es `true`, incluso en overrides de plantilla y
responsive. CSS mantiene su visibilidad. `false` y `0` siguen válidos en propiedades
que sí los admiten. No se migraron datos ni se alteraron las claves por tienda.

La prueba de navegador sembró deliberadamente datos v1 con branding falso,
títulos del pie ocultos, barra oculta y un reemplazo de `image-0` a escala cero.
Los cuatro diseños conservaron el logo original y la referencia.

### 7. Navegador y evidencia

Se utilizó React/Vite real con una entrada aislada de QA y API sintética en
`127.0.0.1:5175`; la publicación escribe solo el almacenamiento local de esa
tienda ficticia. No se enviaron cambios al backend Django ni a servicios de pago.

- Banner: Pequeño/Mediano/Grande, tres pantallas, guardar, tienda pública y recarga;
  encuadre Abajo publicado como `object-position: 50% 100%`.
- Identidad: cuatro diseños × portada/catálogo × 1440/768/375 = 24 combinaciones.
  Todas conservaron dos identificaciones visibles, logo original y tamaño seguro.
- Paleta Bosque: barra y pie `#15803d`; luego cambio individual del pie a
  `#234567`, conservando la barra. Persistencia pública comprobada.
- Fuentes: Calibri para cuerpo y Georgia para títulos, comprobadas en estilos
  calculados de la tienda pública.
- Acceso, carrito y checkout: cuatro diseños × tres tamaños = 36 combinaciones
  sin desbordamiento horizontal. Se corrigió el contraste del botón «Invitado»
  en el diseño oscuro.
- Acceso: selección directa del campo, radio 19 px guardado, conservado en registro.
- Compra: paneles con radio 23 px en Contacto, Entrega, Pago y Confirmación;
  igual en la tienda pública. El parámetro de etapa se ignora fuera del iframe
  del editor: la compra pública conserva su inicio en Contacto.
- Producto, seguimiento, perfil, pedidos, las tres páginas legales y Nuestra
  historia de Velta se abrieron dentro del editor. La confirmación sin pedido
  muestra su estado vacío real. La sesión cliente usada para QA es sintética.

Evidencia: `docs/visual-review-etapa-2/ux-editor.jpg`, `ux-storefront.jpg`,
`ux-branding-mobile.jpg`, `ux-checkout-editor.jpg`, `ux-checkout-mobile.jpg`
y `ux-browser-checks.json` con medidas y resultados.

### 8. Validaciones técnicas

Las 15 suites frontend pasan, incluyendo 47 pruebas de configuración visual y
54 del editor. Se añadieron pruebas de tamaños/persistencia, encuadre, categorías,
ayuda, identidad obligatoria, reset, paletas coordinadas y ajustes manuales,
fuentes, aislamiento de páginas, overrides responsive y etapas de compra
restringidas a la vista previa. Las pruebas funcionales de carrito, envío,
checkout, pedidos, perfiles y stock siguen aprobadas.

`npm run typecheck`, `npm run build` y `git diff --check`: aprobados.
Build: 172 módulos; JS 723,72 kB (gzip 199,80), CSS 241,20 kB (gzip 31,95).
Persiste el aviso de chunk JS superior a 500 kB. No hubo cambios backend durante
estos ajustes, por lo que no se repitieron sus tests ni se aplicaron migraciones.

### 9. Límites restantes

- La publicación continúa siendo local al navegador, sin sincronización remota.
- El contenido puede ampliar banners pequeños para evitar recortes.
- Las fuentes de sistema utilizan alternativas si no están instaladas en el
  dispositivo; no se descargan fuentes externas nuevas.
- La vista previa utiliza el carrito, sesión y pedidos actuales. Los formularios
  de checkout requieren un producto; las páginas privadas mantienen sus guards;
  confirmación y detalle de pedidos requieren datos reales para sus estados completos.
- No se permite ejecutar pagos, enviar formularios o modificar el carrito desde
  el iframe: los clics seleccionan secciones. Las cuatro etapas tienen un selector
  visual separado, válido solo dentro del editor.
- No se certificaron todas las combinaciones de estilos, estados de error y datos
  de cada página. La validación de navegador se distingue de la cobertura automática.
- Siguen las limitaciones previas de filtros Velta, panel colapsable e imágenes
  legacy asociadas por índice. GIFs y medición formal de rendimiento quedan pendientes.

### Ampliación solicitada: paletas, fuentes y demás apartados

Las paletas actualizan seis overrides: principal, secundario, acento, fondo de
barra superior, fondo del pie y texto del pie. Los controles individuales siguen
disponibles y pueden reemplazar cualquiera de esos colores después. Restablecer
la paleta retira esos overrides. La edición conserva el breakpoint seleccionado.

Hay 15 familias: las tres existentes y Arial, Calibri, Cambria, Georgia,
Times New Roman, Verdana, Tahoma, Trebuchet MS, Courier New, Garamond, Palatino
y Comic Sans MS. Cuerpo y títulos son independientes y aplican a las vistas públicas.

«Página de vista previa» permite Inicio, Catálogo, Producto, Acceso/Registro,
Carrito, Finalizar compra, Confirmación, Seguimiento, Perfil, Pedidos y páginas
legales; Nuestra historia se ofrece en Velta, donde la ruta existe. Producto
admite el identificador/slug del catálogo. Checkout incluye selector de sus cuatro
etapas; Acceso permite alternar la presentación de inicio de sesión y registro.

`StorePageContent` identifica la ruta y aplica ajustes independientes en
`pages.<página>.layout/panel/field/button`, con el mismo esquema
defaults → preset → overrides → draft. El catálogo mantiene sus controles propios
de título, filtros, distribución y tarjetas para conservar su comportamiento.
Guardar, descartar, restablecer y responsive reutilizan el modelo del editor.
El nuevo wrapper y los marcadores son de presentación; los servicios, permisos,
validaciones, stock, envío y ejecución de pagos conservan su implementación.

Archivos principales adicionales: `visual/pages.ts`, `StorePageContent.tsx`,
`visual/types.ts`, `defaults.ts`, `cssVariables.ts`, `ThemeEditor.tsx`,
`visualEditor/inspector.tsx`, `palettes.tsx`, `controls.tsx`, los cuatro layouts,
marcadores en formularios/páginas y `tests/visual-editor.cjs`.
`scripts/generate-visual-css.cjs` genera 460 aliases responsive y los enlaces
de variables por página desde el contrato existente; no introduce otro resolver.

La rama permanece `feature/mejoras-flujos-tienda`, con los cambios anteriores
intactos y sin commit, push, merge, rebase, reset, stash ni cambio de rama.

## Cierre final de Etapa 2

Fecha: 10 de octubre de 2026. Al retomar se revisaron `git status`,
`git diff --stat` y este informe. Las funcionalidades, la evidencia de navegador,
las 15 suites frontend, typecheck y build ya estaban terminados y registrados
después de los últimos cambios. No quedó un bug detectado sin corregir dentro
del alcance descrito. Faltaba registrar explícitamente el cierre final.

Se contrastó la integración existente de las seis propiedades de paleta, las
15 familias tipográficas, las rutas adicionales, las cuatro etapas de preview
y la protección de identidad institucional. No se modificó código ni se
repitieron suites aprobadas. Se volvió a ejecutar `git diff --check`, con salida
exitosa; los avisos LF/CRLF corresponden a normalización de fin de línea.

El estado final conserva 41 archivos rastreados modificados y 18 entradas sin
rastrear, incluyendo directorios y cambios de etapas anteriores. Estos números
no equivalen al total de archivos nuevos dentro de los directorios. En este
cierre solo se actualizó este informe y se refrescó el registro de estado Git
en la carpeta de evidencia. No hubo cambios backend ni migraciones.

**Etapa 2 queda cerrada para el alcance visual y la publicación local descritos
en este informe, con las limitaciones documentadas.** Este cierre no certifica
integración remota, pagos reales ni todas las combinaciones visuales posibles.
No se inició Etapa 3 y no se realizó ninguna operación Git prohibida.
