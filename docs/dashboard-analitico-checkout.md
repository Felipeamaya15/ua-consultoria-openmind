# Dashboard analítico y retiro desplegable en checkout

Implementación local en `feature/sprint5-dashboard-operativo`. Se preservaron los cambios anteriores de dashboard, Pedidos y retiro manual/verificado. No se realizaron staging, commits, cambios de rama ni publicaciones.

## Resultado

El dashboard conserva el selector, las tarjetas y las últimas cinco órdenes. Incorpora una línea con área de ingresos confirmados, barras de pedidos, distribución por estados y máximos diarios. Incluye cuatro tarjetas navegables, foco visible, leyendas exactas por hover/foco y una tabla diaria desplegable como alternativa accesible. Los días sin actividad se representan con cero.

| Elemento | Cálculo y destino |
| --- | --- |
| Ventas Totales | Suma de pedidos en `Pedido.ESTADOS_PAGADOS`; Pedidos con `estado=confirmed` y fechas del período. |
| Órdenes Totales | Todos los pedidos del período, incluidos pendientes y cancelados; Pedidos sin restricción de estado. |
| Por Despachar | Estados existentes `pendiente`, `pagado`, `preparando`, `en_origen`; Pedidos con `estado=dispatch`. |
| Ticket promedio | Ventas confirmadas / cantidad de pedidos con pago confirmado; sin pagos muestra ausencia de datos. Enlaza a los confirmados. |
| Variaciones | `(actual - anterior) / anterior * 100`, redondeo decimal a dos cifras. Sin base positiva anterior muestra «Sin base anterior para comparar». |
| Ventas y pedidos históricos | Cada punto/barra abre el intervalo exacto; ventas filtra pagos confirmados. Hasta 31 días: diario; hasta 100: intervalos de siete días; más de 100: meses de calendario, acotados al período. |
| Distribución | Estados reales y sus etiquetas del modelo, cada barra abre el mismo período con ese estado. |
| Actividad destacada | Máximo diario real; ante empates enlaza al primer día e informa cuántos comparten el máximo. |
| Últimas órdenes | Mantiene el servicio existente, cinco últimas de la tienda y el detalle actual de Pedidos. |

Las fechas se resuelven en el servidor con `America/Santiago`. El año es desde el 1 de enero hasta hoy; el comparativo es el tramo inmediatamente anterior con la **misma cantidad de días**, no el mismo tramo del año anterior. Los totales reflejan el estado actual del pedido por su fecha de creación; no constituyen un libro contable por fecha de liquidación del pago.

La navegación sigue usando `fecha_desde`, `fecha_hasta`, `estado`, `periodo` y `pedido`. No se añadieron páginas ni filtros alternativos; Pedidos reutiliza su integración previa con la URL y atrás/adelante.

## Backend compatible

Se amplió exclusivamente la agregación del dashboard existente. `GET /api/tienda/dashboard/` conserva sus campos anteriores y agrega `pedidos_pagados`, `ticket_promedio`, `distribucion_estados` y `comparacion`. El frontend acepta también respuestas antiguas sin esos campos.

Una consulta agrupada por fecha/estado calcula ambos períodos, sin joins que dupliquen pedidos. Se conservan autenticación, autorización del propietario, aislamiento por tienda y cache deshabilitada. Las pruebas mantienen el límite de tres consultas incluyendo autorización. No hay migraciones ni dependencias nuevas. Los montos y porcentajes se calculan con Decimal en servidor.

## Checkout

La tarjeta de retiro muestra «Retiro en tienda», «Retira tu pedido en nuestro establecimiento», «Gratis ($0)» y el botón «ⓘ Ver dirección y horarios». El desplegable inicia cerrado y muestra dirección y horarios en bloques separados. Reutiliza la agrupación existente de días con horarios iguales, incluso no consecutivos, y conserva el texto de configuraciones antiguas.

El botón está fuera del `label` del radio, dentro de la misma tarjeta, tiene `type=button`, `aria-expanded`, `aria-controls`, foco visible y flecha de estado. Expandirlo no selecciona retiro, no altera el costo ni abandona el checkout. Se conservan las variantes y variables visuales de las cuatro plantillas. No se generan enlaces de mapas ni coordenadas. No se modificaron modelos, contratos, configuración del retiro, validación manual/Google, transportistas ni pagos.

## Archivos de esta entrega

Rutas relativas a la raíz del repositorio:

- `backend/apps/core/infrastructure/dashboard.py`: agregación extendida.
- `backend/apps/core/test_dashboard.py`: cinco pruebas analíticas adicionales.
- `frontend/src/features/admin/pages/Dashboard.tsx`: encabezado y presentación.
- `frontend/src/features/admin/components/dashboard/DashboardMetrics.tsx`: cuatro KPIs y comparativos.
- `frontend/src/features/admin/components/dashboard/DashboardAnalytics.tsx`: nuevo componente de gráficos, estados, máximos y tabla.
- `frontend/src/features/admin/services/dashboardService.ts`: campos opcionales y validación del contrato.
- `frontend/src/features/admin/services/dashboardAnalytics.ts`: nueva agrupación y cálculos de presentación.
- `frontend/src/features/storefront/pages/Checkout.tsx`: tarjeta concisa e integración del detalle.
- `frontend/src/features/storefront/components/checkout/PickupDetails.tsx`: nuevo desplegable reutilizable.
- `frontend/tests/analytics-checkout.cjs`: nuevas pruebas de agregación, picos y desplegable.
- `frontend/tests/checkout-pickup-visual.cjs`: nueva prueba interactiva de checkout en cuatro plantillas y tres resoluciones.
- `frontend/tests/dashboard.cjs`: contrato analítico, render y estados de carga/error.
- `frontend/tests/dashboard-navigation-visual.cjs`: filtros reales desde gráficos diarios/mensuales, estados y ticket.
- `frontend/tests/dashboard-visual.cjs`: adaptación del diseño de cuatro tarjetas y estados visuales.
- `frontend/tests/checkout-shipping.cjs`, `frontend/tests/cart-checkout.cjs`: adaptaciones del arnés para el nuevo componente; mantienen sus pruebas de negocio.
- `frontend/tests/recent-orders.cjs`: arnés actualizado para el icono del dashboard, sin cambiar la lógica de últimas órdenes.
- `frontend/package.json`: comando local `test:analytics`.
- `docs/dashboard-analitico-checkout.md`: este informe.

Varios de estos archivos ya estaban sin seguimiento por el trabajo anterior; «archivo nuevo» se refiere a esta entrega, no a todo lo mostrado por `git status`. Los restantes archivos de retiro, configuración, pedidos y entorno que aparecen en el estado Git pertenecen a cambios locales anteriores.

## Verificación

- **163 pruebas de backend OK**: dashboard, últimas órdenes, estados, retiro, entregas, cotizaciones, errores y transferencias. Incluyen comparación equivalente, aislamiento entre tiendas, límites de fechas en Chile, denominador del ticket y redondeos. SQLite aislado en memoria; no se alteró la BD de desarrollo.
- **32 archivos funcionales frontend OK**, incluidos dashboard, navegación, carrito/checkout, transportistas, pagos, editor y validación del retiro.
- `npm run test:analytics`: **OK**; contrato, metadatos inválidos, 8 pruebas dashboard, 5 de navegación, 4 analíticas/desplegable, 61 de checkout/entregas y pruebas de carrito.
- **3 escenarios interactivos de dashboard OK** a 375/768/1280 px: las cuatro tarjetas, gráficos diarios/mensuales, estados, tabla, detalle, recarga, URL, atrás/adelante. Navegador en Tokio comprueba que los filtros siguen usando Chile.
- **12 escenarios interactivos de checkout OK**: cuatro plantillas × 375/768/1280 px. Retiro habilitado/deshabilitado, dirección real del fixture, agrupación, teclado, selección y costo conservados, presencia de Chilexpress/Starken y ausencia de desbordamiento.
- **12 comprobaciones visuales adicionales OK**: dashboard con datos, cargando, error y vacío en tres resoluciones. Capturas revisadas de dashboard y checkout.
- **TypeScript y compilación de producción OK**. Vite advierte que el chunk principal supera 500 kB; no impide compilar.
- `git diff --check`: OK; avisos de conversión LF/CRLF en archivos ya modificados, sin errores de espacios.

Reproducción desde la raíz:

```powershell
& 'C:\Users\maria\anaconda3\python.exe' backend/scripts/test_dashboard.py apps.core.test_pickup apps.core.test_delivery apps.core.test_shipping apps.core.test_shipping_errores apps.core.test_pending_transfers apps.core.test_transfer_configuration apps.core.test_dashboard apps.core.test_ultimas_ordenes apps.core.test_estados_pedido
npm run test:analytics --prefix frontend
npm run build --prefix frontend
$env:DASHBOARD_PLAYWRIGHT_MODULE='C:/Users/maria/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
node frontend/tests/dashboard-navigation-visual.cjs
node frontend/tests/checkout-pickup-visual.cjs
node frontend/tests/dashboard-visual.cjs
```

Las pruebas de navegador compilan los componentes reales con esbuild, usan CSS del build y Edge, e interceptan las APIs con fixtures identificados como pruebas. No crean pedidos ni contactan proveedores externos. El arnés de checkout abre el paso de entrega únicamente dentro del bundle de prueba; la aplicación conserva las validaciones de pasos normales.

## Comprobación manual y límites

1. Iniciar backend/frontend e ingresar como propietario. Abrir `/emprendedor`, cambiar entre 7 días, 30 días y año. Contrastar las tarjetas con los pedidos reales y las fechas visibles.
2. Con datos en ambos períodos, comprobar porcentajes; con base cero, comprobar el aviso sin porcentaje. Confirmar que pendientes/cancelados no generan ingresos ni ticket promedio.
3. Activar por teclado tarjetas, puntos/barras, estados y máximos. Verificar fechas/estado en Pedidos, usar atrás/adelante y recargar. Abrir una última orden y cerrar su detalle.
4. Configurar retiro y horarios válidos en Entregas. Recargar y abrir una nueva compra en `/plantilla/1/compra` hasta el paso Entrega; repetir con plantillas 2–4.
5. Seleccionar Chilexpress o Starken y abrir/cerrar «Ver dirección y horarios»: debe conservar la selección. Seleccionar retiro y comprobar envío $0 y total constante al expandir/contraer.
6. Comprobar que los días iguales se agrupan y que dirección/horarios coinciden con Entregas. Deshabilitar retiro y abrir un checkout nuevo: no debe ofrecerlo.

Pendiente de verificación en el entorno de despliegue: recorrido con PostgreSQL/MongoDB y datos reales, cotizaciones externas, pagos reales y Google con credenciales válidas. No se afirma haber realizado esas operaciones. Las integraciones permanecen cubiertas por las pruebas locales existentes. La carga de Pedidos sigue usando la lista completa y los filtros existentes; esta entrega no añade paginación ni exportaciones.

## Estado Git al terminar

La salida siguiente incluye trabajo previo y esta entrega. ` M` indica modificación local sin staging; `??` indica archivo/directorio sin seguimiento. No hay cambios en el índice.

```text
Rama: feature/sprint5-dashboard-operativo
 M .env.example
 M backend/apps/core/delivery.py
 M backend/apps/core/presentation/checkout.py
 M backend/apps/core/presentation/serializers.py
 M backend/apps/core/presentation/views.py
 M backend/apps/core/test_checkout.py
 M backend/apps/core/test_delivery.py
 M backend/apps/core/test_linkify_errores.py
 M backend/apps/core/test_pending_transfers.py
 M backend/apps/core/test_tenant_sql.py
 M backend/apps/core/urls.py
 M docker-compose.yml
 M frontend/package.json
 M frontend/src/features/admin/components/dashboard/RecentOrders.tsx
 M frontend/src/features/admin/data/orderStatus.ts
 M frontend/src/features/admin/pages/Dashboard.tsx
 M frontend/src/features/admin/pages/Orders.tsx
 M frontend/src/features/admin/pages/Shipping.tsx
 M frontend/src/features/admin/types/index.ts
 M frontend/src/features/storefront/pages/Checkout.tsx
 M frontend/src/features/storefront/services/shippingService.ts
 M frontend/tests/cart-checkout.cjs
 M frontend/tests/checkout-shipping.cjs
 M frontend/tests/customer-orders.cjs
 M frontend/tests/recent-orders.cjs
?? backend/apps/core/infrastructure/dashboard.py
?? backend/apps/core/infrastructure/pickup_address.py
?? backend/apps/core/pickup.py
?? backend/apps/core/presentation/dashboard.py
?? backend/apps/core/presentation/pickup_address.py
?? backend/apps/core/test_dashboard.py
?? backend/apps/core/test_pickup.py
?? backend/scripts/test_dashboard.py
?? docs/dashboard-analitico-checkout.md
?? docs/dashboard-interactivo.md
?? docs/dashboard-operativo-sprint5.md
?? docs/retiro-tienda-estructurado.md
?? docs/retiro-tienda-manual.md
?? frontend/src/features/admin/components/dashboard/DashboardAnalytics.tsx
?? frontend/src/features/admin/components/dashboard/DashboardMetrics.tsx
?? frontend/src/features/admin/components/shipping/
?? frontend/src/features/admin/services/dashboardAnalytics.ts
?? frontend/src/features/admin/services/dashboardService.ts
?? frontend/src/features/admin/services/orderNavigation.ts
?? frontend/src/features/admin/services/pickupConfiguration.ts
?? frontend/src/features/storefront/components/checkout/
?? frontend/tests/analytics-checkout.cjs
?? frontend/tests/checkout-pickup-visual.cjs
?? frontend/tests/dashboard-navigation-visual.cjs
?? frontend/tests/dashboard-navigation.cjs
?? frontend/tests/dashboard-visual.cjs
?? frontend/tests/dashboard.cjs
?? frontend/tests/pickup-visual.cjs
?? frontend/tests/shipping-pickup.cjs
```
