# Informe de Verificación de Requisitos Responsive — Sprint 7

## 1. Tamaños de pantalla usables y resoluciones comprobadas

La plataforma soporta un rango continuo de pantallas desde **360 px de ancho** (móviles compactos) hasta **1920 px+** (monitores de escritorio), estructurado en tres puntos de quiebre principales mediante Tailwind CSS, `storefront.css`, `visual-config.css` y `admin.css`:

| Categoría de dispositivo | Rango de ancho usable | Resoluciones representativas evaluadas | Comportamiento estructural principal |
| :--- | :--- | :--- | :--- |
| **Móvil (Smartphone)** | **`360 px` – `639 px`** (navegación compacta hasta `767 px`) | **`360×800 px`** (Android estándar) y **`375×812 px`** (iPhone X/13 Mini) | Grillas de 1 columna (`grid-cols-1`), menú móvil desplegable (`.store-mobile-navigation` / drawer `.admin-sidebar`), controles táctiles de al menos `44×44 px` (`min-h-11`), sin paneles `sticky` que resten alto útil. |
| **Tablet (Vertical / Horizontal)** | **`640 px` – `1023 px`** (`sm` a `md`) | **`768×1024 px`** (iPad vertical) y **`820×1180 px`** (iPad Air) | Catálogo en 2 columnas (`sm:grid-cols-2`) con panel lateral de filtros (`md:col-span-3`), formularios de dirección y pago en 2–3 columnas (`sm:grid-cols-2`), resumen de carrito y checkout apilado en ancho completo sin superposición. |
| **Escritorio (Laptop / Monitor)** | **`1024 px` – `1920 px+`** (`lg` y `xl`, contenedor máx. `1560 px`) | **`1280×800 px`** (Laptop) y **`1440×900 px`** (Desktop estándar) | Catálogo en 3 columnas (`lg:grid-cols-3`), detalle de producto en 2 columnas (`lg:grid-cols-2`), carrito y checkout con panel de resumen lateral fijo (`lg:sticky lg:top-24`), y panel administrativo con barra lateral fija de `256 px` y tablas completas (`lg:block`, `xl:grid-cols-5`). |

---

## 2. Matriz de verificación en las 6 vistas prioritarias

| Vista prioritaria | Móvil (`360×800` / `375×812`) | Tablet (`768×1024`) | Escritorio (`1440×900`) | Resultado |
| :--- | :--- | :--- | :--- | :--- |
| **1. Catálogo (`Catalog.tsx`, `ProductCard.tsx`)** | Buscador y selector de orden al 100% de ancho; filtros colapsables mediante botón táctil (`min-h-11`); tarjetas en 1 columna (grilla y lista apilada). | Filtros visibles en columna lateral (`md:col-span-3`) y resultados en 2 columnas (`sm:grid-cols-2`). | Filtros sticky (`md:sticky`) y grilla de 3 columnas (`lg:grid-cols-3`) en las 4 plantillas. | **APROBADO (con Fix 1 aplicado)** |
| **2. Detalle de producto (`ProductDetail.tsx`, `QuantityControl.tsx`)** | Galería e información apiladas en 1 columna; selector de cantidad `.product-quantity` (`44×44 px` por botón) y botón «Agregar al carrito» al 100%; productos relacionados en 1 columna. | Galería superior con miniaturas desplazables y grilla de productos relacionados en 2 columnas (`sm:grid-cols-2`). | Vista dividida en 2 columnas (`lg:grid-cols-2`) y productos relacionados en 4 columnas (`lg:grid-cols-4`). | **APROBADO (con Fix 3 aplicado)** |
| **3. Carrito (`Cart.tsx`)** | Tarjetas de producto con `min-w-0`, controles de cantidad y subtotales apilados (`flex-col sm:flex-row`), campo de código promocional flexible y resumen no sticky al final. | Ítems en fila con controles alineados y panel de resumen inferior de ancho completo. | Grilla de 2 columnas (`lg:grid-cols-[1fr_360px]`) con resumen lateral sticky. | **APROBADO** |
| **4. Checkout (`Checkout.tsx`)** | Resumen del pedido arriba (`order-first`, no sticky); stepper con scroll horizontal táctil (`overflow-x: auto`); botones «Volver / Continuar» apilados al 100% (`column-reverse`); datos de transferencia con `overflow-wrap: anywhere`. | Resumen superior y pasos del formulario con grillas de dirección en `sm:grid-cols-2` y `sm:grid-cols-3`. | Grilla `lg:grid-cols-5` (`lg:col-span-3` formulario + `lg:col-span-2` resumen sticky a la derecha). | **APROBADO (con Fix 5 aplicado)** |
| **5. Autenticación (`Login.tsx`)** | Formulario fluido (`w-full px-4`) sin desbordamiento; selector «Ingresar / Registrarse» adaptable y enlace de recuperación de contraseña alineado a la derecha. | Tarjeta centrada (`max-w-md` / `max-w-[460px]`) con controles de `48 px` de alto (`h-12`). | Tarjeta centrada con espaciado amplio e identidad visual de cada plantilla. | **APROBADO (con Fix 4 aplicado)** |
| **6. Panel Administrativo (`AdminLayout`, `Dashboard`, `Products`, `Orders`)** | Sidebar oculta fuera de pantalla (`translateX(-100%)`, `visibility: hidden`) con apertura por botón hamburguesa; resumen `.catalog-overview` en 1 columna; listado de productos en modo tarjeta (`lg:hidden`). | Tarjetas de KPIs del Dashboard en 2 columnas (`sm:grid-cols-2`); filtros de pedidos adaptados y listado en tarjetas. | Sidebar fija (`256 px`), KPIs en 4 columnas (`xl:grid-cols-4`), tabla completa de productos (`lg:block`) y vista maestro-detalle de pedidos (`xl:grid-cols-5`). | **APROBADO (con Fix 2 aplicado)** |

---

## 3. Problemas responsive detectados y soluciones implementadas

| # | Vista / Archivo | Problema detectado | Solución implementada |
| :--- | :--- | :--- | :--- |
| **1** | **Catálogo (Plantilla 3 `Visual`)** (`frontend/src/styles/storefront.css`) | Existían dos botones con `data-visual-part="catalogFiltersToggle"` (uno dentro del `<aside>` de filtros y otro sobre la lista de productos). Al desplegar los filtros (`filtersOpen = true`), ambos botones quedaban visibles simultáneamente. | Se ocultó en `storefront.css` el botón duplicado interno (`[data-catalog-page="visual"] [data-visual-part="catalogFilters"] [data-visual-part="catalogFiltersToggle"]`), conservando un único control interactivo para abrir y cerrar filtros. |
| **2** | **Panel Administrativo — Productos** (`frontend/src/features/admin/admin.css`) | El bloque `.catalog-overview` mantenía `grid-template-columns: repeat(3, minmax(0, 1fr))` en móviles `< 640 px`, comprimiendo los 3 indicadores en columnas de ~`100 px` de ancho. | En `@media(max-width: 639px)` se definió `.catalog-overview { grid-template-columns: minmax(0, 1fr); }` y se reemplazó el borde izquierdo divisor por borde superior (`border-top: 1px solid #edf0f6`). |
| **3** | **Detalle de Producto (Plantilla 1 `Editorial`)** (`frontend/src/styles/storefront.css`) | La grilla de «Productos relacionados» en la plantilla `Editorial` usaba `grid-cols-2 sm:grid-cols-4`, dejando dos tarjetas con selector de variantes por fila en pantallas móviles de `360 px`. | Se añadió en `@media (max-width: 639px)` de `storefront.css` la regla `[data-visual-page="product"] section .grid.grid-cols-2 { grid-template-columns: minmax(0, 1fr); }`, unificándola a 1 columna en móvil igual que las otras 3 plantillas. |
| **4** | **Autenticación (Plantilla 4 `Catalog`)** (`frontend/src/features/storefront/pages/Login.tsx`) | El botón «¿Olvidaste tu contraseña?» tenía aplicadas por error las clases de botón ancho de Google (`h-12 flex items-center justify-center gap-3 border...`), un `<svg>` vacío y el manejador `loginConGoogle()`. | Se corrigió en `Login.tsx` por un botón compacto `data-page-action="ghost"` alineado a la derecha con el mensaje de recuperación de demostración, consistente con las demás plantillas. |
| **5** | **Checkout — Paso 3 Pago** (`frontend/src/styles/storefront.css`) | La grilla `grid-cols-2` con los datos de `Transferencia bancaria` no incluía `min-width: 0` ni `overflow-wrap: anywhere`, por lo que un correo de confirmación o titular extenso podía generar scroll horizontal en `360 px`. | Se añadió `min-width: 0; overflow-wrap: anywhere; word-break: break-word;` en `storefront.css` para todas las celdas `[data-checkout-page] [data-page-panel] .grid.grid-cols-2 > span`. |

---

## 4. Evidencia de verificación automatizada

Comando ejecutado:
```powershell
docker compose run --rm --no-deps frontend node --test tests/sprint7-responsive.cjs