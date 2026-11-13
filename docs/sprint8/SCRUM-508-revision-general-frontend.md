# SCRUM-508 — Revisión y mejora general del Frontend (Vistas Comprador y Emprendedor)

**Proyecto:** OpenMind — E-commerce (`ua-consultoria-openmind`)  
**Sprint:** N° 8  
**Responsable Frontend:** Francisco Salas  
**Rama:** `develop`  
**Ubicación oficial de este documento:** `docs/sprint8/SCRUM-508-revision-general-frontend.md` (referenciado en `README.md`).

---

## 1. Objetivo y alcance

Documentar el proceso de revisión integral del Frontend del E-commerce en las **2 vistas principales** (**Vista Comprador** en las 4 plantillas: *Studio Pop*, *Soft Discovery*, *Velta Editorial* y *Obsidian Showcase*, y **Vista Emprendedor / Panel de Administración** en `/emprendedor/*`), así como la resolución completa de los hallazgos y observaciones registrados por el Escuadrón ES3 en la planilla de QA del Sprint 8 (`ES3_QA_PLANTILLA_S8`).

---

## 2. Resumen de correcciones y mejoras implementadas

| # | Hallazgo / Observación de QA (`SCRUM-508`) | Solución implementada | Archivos intervenidos |
| :--- | :--- | :--- | :--- |
| **1** | **Plantilla 3 (*Velta Editorial*): texto `"TIENDA"` de más en la App Bar** | Se eliminó el separador vertical y el texto redundante `"TIENDA"` contiguo al nombre de la tienda en la cabecera superior. | `frontend/src/features/storefront/components/store/visual/VisualHeader.tsx` |
| **2** | **Plantilla 3 (*Velta Editorial*): eliminar botón `"Nuestra historia"` en Inicio y en la App Bar** | Se retiró el botón/enlace `"Nuestra historia"` en la portada (`VisualHome`), en la barra superior (`VisualHeader`), en el menú móvil (`CompactMobileNavigation`) y en el pie de página (`VisualFooter`), evitando que el cliente sea redirigido a una vista aparte y permitiéndole hacer scroll hacia abajo en el inicio. | `frontend/src/features/storefront/pages/VisualHome.tsx`<br>`frontend/src/features/storefront/components/store/visual/VisualHeader.tsx`<br>`frontend/src/features/storefront/components/store/visual/VisualFooter.tsx`<br>`frontend/src/features/storefront/components/store/CompactMobileNavigation.tsx` |
| **3** | **Plantilla 3 (*Velta Editorial*): mejorar el estilo y disposición de los filtros y categorías en el Catálogo** | En escritorio y tablet (`>= 768px`), se dispuso el panel de filtros en una barra lateral izquierda fija (`col-span-3`, igual que en las demás plantillas) donde las categorías, disponibilidad, rango de precios y atributos se ven directamente sin necesidad de abrir un panel oculto. En pantallas móviles (`< 768px`), se muestran píldoras de acceso rápido a las categorías en la parte superior junto con el botón colapsable `"Filtros + / −"` a ancho completo. | `frontend/src/features/storefront/pages/Catalog.tsx`<br>`frontend/src/styles/storefront.css` |
| **4** | **Plantilla 2 (*Soft Discovery* / `minimal`): darle un aspecto más redondeado a fotos de productos y componentes** | Se incrementó el radio de bordes en `.template-minimal` a `26px` en tarjetas de producto, paneles y contenedores de filtros, `22px` en las fotografías de productos (catálogo, detalle de producto y checkout) y formato píldora (`9999px`) en botones, buscador y selectores. | `frontend/src/styles/storefront.css`<br>`frontend/src/features/storefront/pages/Catalog.tsx` |
| **5** | **Añadir un efecto de diseño especial al pasar el mouse (`hover`) sobre cada botón en todas las vistas de comprador** | Se incorporó un efecto interactivo global en `[data-storefront-visual]` para todos los botones, CTAs y filtros de categoría con elevación suave (`translateY(-2px)`), sombra dinámica y realce de brillo, igualando la respuesta visual de la vista de emprendedor. | `frontend/src/styles/storefront.css` |
| **6** | **UX en la vista `"Diseño"` del emprendedor (`/emprendedor/diseno`) y en el Editor Visual (`/emprendedor/diseno/editor`)** | 1) En `Design.tsx`, al pulsar `"Usar esta"`, la plantilla se activa y guarda automáticamente en la vista del comprador sin obligar a hacer scroll hacia arriba para presionar `"Guardar cambios"`.<br>2) Se ubicó el botón principal `"Abrir editor de plantillas →"` en el bloque superior de la página, se dejó la sección `"Colores de la tienda"` antes de la selección de plantillas y se agregó el botón `"Editar plantilla →"` en cada tarjeta.<br>3) En `ThemeEditor.tsx`, se actualizó el enlace superior por `"← Volver al panel de administración"` para hacer explícito el retorno al panel. | `frontend/src/features/admin/pages/Design.tsx`<br>`frontend/src/features/admin/pages/ThemeEditor.tsx` |
| **7** | **Cambiar la vista posterior a cancelar un pago (ej. Webpay) para que no saque al cliente del carrito** | Antes de redirigir a la pasarela de pago se guarda una copia de respaldo de los ítems en `sessionStorage`. Si el pago es cancelado o rechazado en Webpay, PayPal o Mercado Pago, el sistema restaura automáticamente los productos en el carrito y presenta la vista `"Pago cancelado · Tu carrito sigue disponible"` con las acciones principales `"Volver al carrito"`, `"Volver al checkout"` y `"Reintentar pago"`. | `frontend/src/features/storefront/context/CartContext.tsx`<br>`frontend/src/features/storefront/pages/TransbankReturnResult.tsx`<br>`frontend/src/features/storefront/pages/ExternalPaymentReturnResult.tsx` |
| **8** | **Verificación en distintos tamaños de pantalla (incluyendo Android)** | Se inspeccionaron y validaron las vistas principales de comprador (Inicio, Catálogo, Detalle de Producto, Carrito, Checkout, Seguimiento, Login/Registro y Páginas Legales) y del panel de emprendedor en resoluciones de **Android (`360×800 px` y `412×915 px`)**, **Tablet (`768×1024 px`)** y **Escritorio (`1440×900 px`)**. | `frontend/tests/sprint7-responsive.cjs`<br>`frontend/src/styles/storefront.css` |

---

## 3. Registro de verificación responsiva (Android, Tablet y Escritorio)

| Vista / Flujo | Android (`360px - 412px`) | Tablet (`768px`) | Escritorio (`1440px`) | Resultado |
| :--- | :--- | :--- | :--- | :--- |
| **Cabeceras y Navegación (4 plantillas)** | Logo institucional UA, logo y nombre completo de la tienda visibles sin truncamiento; menú móvil colapsable y carrito operativo sin superposición. | Navegación adaptable con alto contraste y foco visible por teclado. | Cabecera completa en una sola fila con accesos directos a Catálogo, Seguimiento, Cuenta y Carrito. | **CUMPLE** |
| **Portadas / Landing Pages (4 plantillas)** | Sin scroll horizontal; en *Soft Discovery* el buscador mantiene input y botón en una sola línea; en *Velta Editorial* se eliminó el botón `"Nuestra historia"` permitiendo scroll continuo. | Escalamiento fluido de banners, carrusel y bloques de beneficios. | Aprovechamiento del ancho (`min(96%, 1760px)`) y distribución uniforme de secciones. | **CUMPLE** |
| **Catálogo y Filtros (4 plantillas)** | Grilla de 1 columna fluida (`minmax(0, 1fr)`); en *Velta Editorial* píldoras de categorías visibles arriba y botón `"Filtros + / −"` desplegable sin desbordes. | Barra lateral de filtros a la izquierda (`col-span-3`) y grilla de 2 columnas (`col-span-9`). | Barra lateral de filtros fija a la izquierda (`270px` / `col-span-3`) y grilla de 3 columnas con cambio vista grilla/lista. | **CUMPLE** |
| **Detalle de Producto, Carrito y Checkout** | Imágenes, selector de variantes, control de cantidad y resumen de compra apilados a 1 columna con botones de altura mínima `44px`. | Estructura adaptable de 2 paneles sin elementos cortados. | Distribución en columnas con resumen lateral y celdas de transferencia bancaria sin desbordamiento. | **CUMPLE** |
| **Retorno de Pago Cancelado (Webpay / Pasarelas)** | Botones `"Volver al carrito"`, `"Volver al checkout"` y `"Reintentar pago"` apilados a ancho completo; carrito restaurado automáticamente. | Botones en fila con conservación íntegra de los productos del carrito. | Vista centrada clara que mantiene al comprador dentro de su flujo de carrito/checkout. | **CUMPLE** |
| **Panel de Administración y Editor Visual** | Menú lateral desplegable, tarjetas apiladas a 1 columna y previsualización móvil (`375px`) en el editor. | Layout adaptable con controles de edición accesibles (`768px`). | En `/emprendedor/diseno`, botón `"Abrir editor de plantillas →"` arriba del todo, colores antes de las plantillas, activación directa con `"Usar esta"` y botón `"← Volver al panel de administración"` en el editor. | **CUMPLE** |

---

## 4. Pruebas automatizadas ejecutadas

Se ejecutaron las suites de validación sobre el contenedor `frontend` verificando el cumplimiento de todos los contratos visuales, de navegación, responsividad y flujo de compra:

```bash
docker compose run --rm --no-deps frontend node --test \
  tests/sprint7-responsive.cjs \
  tests/sprint7-keyboard-navigation.cjs \
  tests/account-navigation.cjs \
  tests/legal-pages.cjs \
  tests/order-tracking.cjs \
  tests/cart-checkout.cjs \
  tests/visual-editor.cjs
```