# Dashboard operativo: navegación interactiva

Cambios locales en `feature/sprint5-dashboard-operativo`, sin staging, commits ni publicación.

## Implementación

Se reutilizan `/emprendedor/pedidos`, su listado real y su panel lateral de detalle. No se crearon páginas ni rutas de producción nuevas. La API sigue siendo `/api/tienda/pedidos/`, autenticada y restringida al propietario de la tienda; las métricas y últimas órdenes mantienen sus endpoints actuales.

El dashboard guarda el período en `?periodo=7`, `30` o `year`. Las tarjetas usan las fechas exactas recibidas del backend para conservar el mismo corte temporal al navegar, sin recalcularlo respecto del reloj del cliente. Las tarjetas solo son enlaces cuando los datos están listos; carga/error no generan destinos con fechas desconocidas. Un período sin datos sigue siendo navegable para consultar el listado vacío.

## Destinos y filtros

| Componente | Destino | Resultado |
| --- | --- | --- |
| Ventas Totales | `/emprendedor/pedidos?fecha_desde=...&fecha_hasta=...&estado=confirmed&periodo=...` | Solo `pagado`, `preparando`, `en_origen`, `enviado`, `en_reparto`, `entregado`, de acuerdo con `Pedido.ESTADOS_PAGADOS`. |
| Órdenes Totales | `/emprendedor/pedidos?fecha_desde=...&fecha_hasta=...&periodo=...` | Todos los estados registrados en el período, incluidos pendientes/cancelados. |
| Por Despachar | `/emprendedor/pedidos?fecha_desde=...&fecha_hasta=...&estado=dispatch&periodo=...` | `pendiente`, `pagado`, `preparando`, `en_origen`, exactamente como el contador del backend. Los pendientes de pago permanecen incluidos conforme al criterio existente. |
| Fecha del histórico | `/emprendedor/pedidos?fecha_desde=AAAA-MM-DD&fecha_hasta=AAAA-MM-DD&periodo=...` | Todos los pedidos registrados ese día. |
| Número de última orden | `/emprendedor/pedidos?pedido=ID` | Abre el panel de detalle existente usando la clave primaria del pedido. |

El histórico encontrado en el repositorio es una **tabla diaria**, no una biblioteca de gráficos. Se añadió un enlace accesible en cada fecha, conservando la tabla y sus montos/conteos.

Las últimas órdenes mantienen su contrato: las cinco más recientes de toda la tienda, independientes del período estadístico. Sus enlaces de detalle no agregan restricciones de fechas que pudieran ocultar la orden. "Ver todos" continúa abriendo el listado completo.

## Cambios en Pedidos

- El estado, las fechas y el pedido seleccionado se derivan de `useSearchParams`. La URL es la fuente de verdad; no hay un segundo estado local de filtros que desincronice atrás/adelante.
- Los botones de estado existentes se conservan y se agregan **Pagos confirmados** y **Por despachar**. Cambiarlos modifica la URL y mantiene las fechas.
- Se agregaron controles Desde/Hasta y Limpiar filtros. Editar fechas elimina el marcador de período original; el rango escrito es el filtro efectivo. Limpiar conserva el detalle seleccionado, como los cambios de categoría anteriores.
- Se filtra realmente el array completo de pedidos autorizado que entrega la API existente. No se utilizan `config.orders` ni datos simulados en la implementación.
- Cada fecha de creación se convierte a `America/Santiago`; los límites de fecha son inclusivos. Se usa el mismo criterio de fecha de registro del dashboard y no la fecha de confirmación de pago.
- Se rechazan filtros de fecha inexistente/invertida, estados desconocidos, identificadores inválidos y parámetros repetidos. Un filtro inválido muestra un aviso y cero resultados; no se amplía silenciosamente al listado completo.
- Seleccionar/cerrar un pedido actualiza `pedido=ID` en URL. La recarga y atrás/adelante recuperan la selección. El detalle puede mostrarse aunque la orden no coincida con el filtro de la lista, conservando el comportamiento independiente del panel existente.
- El detalle recibe foco al abrirse, para navegación por teclado. Si el ID no aparece en el listado autorizado, se muestra un mensaje de no disponibilidad.
- Se reutilizó el catálogo de etiquetas/colores de `orderStatus.ts`, eliminando su copia en Orders. Las acciones de aprobar transferencia/verificar Linkify se conservan.
- Se cancelan las consultas del listado al desmontar para ignorar respuestas tardías.

## Accesibilidad y diseño

Las tarjetas son enlaces nativos, con cursor, efecto hover discreto, indicador “Ver pedidos →” y foco visible. Enter activa la navegación; se permite abrir en otra pestaña mediante el comportamiento normal del navegador. El selector y el botón de reintento están fuera de los enlaces para evitar clics accidentales.

La fecha del histórico y el número de la última orden son enlaces explícitos, con nombres accesibles. No se convirtió toda la fila de la tabla en una zona de clic. Las filas de Pedidos mantienen Enter/Espacio y reflejan la selección mediante `aria-expanded`; los botones de estado usan `aria-pressed` y el cierre del detalle tiene etiqueta accesible.

## Archivos de esta tarea

Modificados:
- `frontend/src/features/admin/pages/Dashboard.tsx`: período en URL.
- `frontend/src/features/admin/components/dashboard/DashboardMetrics.tsx`: tarjetas y fechas navegables.
- `frontend/src/features/admin/components/dashboard/RecentOrders.tsx`: enlaces al detalle.
- `frontend/src/features/admin/pages/Orders.tsx`: filtros/detalle sincronizados con URL y foco.
- `frontend/src/features/admin/data/orderStatus.ts`: grupos de estados comerciales compartidos.
- `frontend/tests/dashboard.cjs`, `recent-orders.cjs`, `customer-orders.cjs`: adaptación de mocks al router y dependencias nuevas.
- `frontend/tests/dashboard-visual.cjs`: adaptación de los enlaces para renderizar la vista actual.

Creados:
- `frontend/src/features/admin/services/orderNavigation.ts`: construcción de destinos, validación y filtrado por estado/fecha de Chile.
- `frontend/tests/dashboard-navigation.cjs`: cinco pruebas del contrato de navegación y reglas de filtrado.
- `frontend/tests/dashboard-navigation-visual.cjs`: navegación completa con componentes reales y BrowserRouter en Edge.
- `docs/dashboard-interactivo.md`: este informe.

No se cambiaron backend, rutas de producción, contratos REST, pagos ni configuración de retiro. Se verificaron por hash **19 archivos del módulo de retiro y su configuración**, todos intactos respecto del inicio de esta tarea.

## Pruebas realizadas

- `node frontend/tests/dashboard-navigation.cjs`: **5 pruebas OK**. Fechas/período de cada destino; seis estados pagados y cuatro por despachar; conteo total; límites de día en Chile y cambio horario; histórico diario/detalle; rangos/estados/IDs inválidos. Incluye comprobación de que los grupos de estados coinciden con las constantes del backend actual.
- `node frontend/tests/dashboard.cjs`: **7 pruebas OK**.
- `node frontend/tests/recent-orders.cjs`: **21 pruebas OK**.
- `node frontend/tests/customer-orders.cjs`: OK, incluidos contratos del listado del propietario y errores.
- Se ejecutaron los **31 archivos funcionales `.cjs` del frontend**, excluyendo los scripts de navegador: todos terminaron con código 0.
- Prueba con **Edge a 375, 768 y 1280 px**: OK. Usa Dashboard, Orders, servicios y BrowserRouter reales; solo sesión y respuestas de API están aisladas mediante fixtures. Se comprobó cada tarjeta, aplicación efectiva de filtros, días del histórico, detalle desde última orden, selección mediante Espacio, foco del detalle, cierre, recarga, atrás/adelante, limpieza/edición de fechas, períodos 7/año y ausencia de desbordamiento horizontal del dashboard. Navegador configurado en **Asia/Tokyo** para comprobar que el filtro sigue usando Chile. Se comprobó que Aprobar pago sigue disponible para una transferencia pendiente; no se ejecutaron transacciones reales.
- `npm run typecheck --prefix frontend`: OK.
- `npm run build` desde frontend: OK, incluye ambos proyectos TypeScript. Advertencia existente de Vite por chunk mayor de 500 kB.
- `git diff --check`: sin errores, solo avisos de LF/CRLF en archivos de trabajo previo.
- No hay comando de lint configurado; no se añadió una dependencia nueva.

Capturas de dashboard y Pedidos en las tres resoluciones guardadas fuera del repositorio, en la carpeta de visualizaciones del chat.

## Límites y verificación manual

El filtrado se hace en frontend sobre el **listado completo** que devuelve actualmente el endpoint del propietario. Si esa API incorpora paginación en el futuro, los filtros deben trasladarse al servidor para cubrir todas las páginas. No se necesita ese cambio para el contrato actual.

La prueba de navegador aísla las respuestas de backend y la sesión; falta el recorrido contra PostgreSQL/MongoDB reales con un propietario autenticado. No se afirma que se haya probado el entorno desplegado. No se ejecutaron pruebas de backend en esta tarea porque su código permanece intacto.

Para verificar manualmente con el proyecto iniciado:
1. Elegir 7 días, 30 días o año en el dashboard.
2. Abrir Ventas Totales: comprobar Pagos confirmados y fechas visibles; no deben aparecer pendientes/cancelados.
3. Volver con el navegador, abrir Órdenes Totales y luego Por Despachar. Revisar que las fechas se conservan y que cada grupo corresponde a los estados indicados en la tabla.
4. Abrir una fecha del histórico y comprobar que Desde/Hasta coinciden en ese día.
5. Abrir una última orden: se debe mostrar su detalle en la página Pedidos. Recargar, cerrar y usar atrás/adelante para restaurar la selección.
6. Editar un filtro de estado/fecha y comprobar que cambia la URL y la lista. Usar atrás/adelante y Limpiar filtros.
7. Repetir con Tab/Enter y Espacio en las filas, y en móvil/tablet/escritorio.

Para repetir las pruebas de navegador desde frontend:
```powershell
node tests/dashboard-navigation-visual.cjs
```
Requiere Playwright disponible en el entorno y Edge instalado. Se puede indicar la ruta del módulo con `DASHBOARD_PLAYWRIGHT_MODULE`; no se agregó Playwright como dependencia del producto. El script inicia un servidor HTTP efímero local y lo cierra al finalizar.

Todos los cambios permanecen sin staging ni commits en `feature/sprint5-dashboard-operativo`. No se ejecutaron operaciones de integración, publicación ni cambios de rama.
