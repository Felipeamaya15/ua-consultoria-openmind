# Dashboard operativo — Sprint 5

Implementación local en `feature/sprint5-dashboard-operativo`, sin commits, publicación ni integración.
Repositorio: `C:\Users\maria\Ecommerce\ua-consultoria-openmind`.

| Tarea | Estado de implementación | Resultado |
| --- | --- | --- |
| SCRUM-366 | Implementada | Dashboard conectado al backend; estados de carga, error, reintento y vacío; últimas órdenes conservadas. |
| SCRUM-367 | Implementada | Ventas confirmadas, formato CLP y actualización por período. |
| SCRUM-368 | Implementada | Cantidad real de pedidos registrados, independiente del pago. |
| SCRUM-369 | Implementada | Selector existente de 7 días, 30 días y año; referencia al día actual de Chile. API valida también rangos explícitos. |
| SCRUM-370 | Implementada | Tabla histórica diaria, días sin actividad con ceros, misma consulta y período de las tarjetas. |
| SCRUM-372 | Implementada | Agregación SQL de ingresos, protegida por autenticación y propiedad. |
| SCRUM-373 | Implementada | Conteo SQL por pedido, sin joins que multipliquen filas. |

La implementación está lista para revisión local. La validación completa en el entorno de integración permanece pendiente por las limitaciones descritas abajo.

## Reutilización

Se conservan el diseño del panel, el selector, los componentes UI, `formatPrice`, la autenticación con Token y la resolución/autorización de tienda existente. `RecentOrders.tsx`, `recentOrdersService.ts`, `orderStatus.ts` y `presentation/recent_orders.py` no fueron modificados. El histórico usa una tabla accesible: no se añadió una biblioteca de gráficos ni dependencias nuevas. Se eliminó la lectura de `config.orders` del dashboard.

## Contrato REST

Nueva ruta única: `GET /api/tienda/dashboard/?periodo=30`.
Valores: `7`, `30`, `year`; por defecto `30`. Las tres métricas y el histórico llegan en una sola respuesta para mantener consistencia y evitar consultas duplicadas.

Alternativa para clientes que necesiten un rango explícito:
`GET /api/tienda/dashboard/?fecha_desde=2026-10-01&fecha_hasta=2026-10-14`.
No se añadió otro selector a la interfaz porque el existente satisface los períodos solicitados.

Autenticación: `Authorization: Token <token>` del propietario activo.
Respuesta según el envelope existente `exito`, `mensaje`, `data`; `Cache-Control: no-store`.

Campos de `data`:
- `fecha_desde`, `fecha_hasta`: fechas ISO inclusivas.
- `zona_horaria`: `America/Santiago`; `moneda`: `CLP`.
- `total_ventas`: decimal como string de dos decimales.
- `total_pedidos`, `por_despachar`: enteros.
- `historico`: lista ordenada de `{fecha, ventas, pedidos}`, incluyendo días con ceros.

Errores: 400 con `PERIODO_INVALIDO` para períodos desconocidos, fechas inválidas/incompletas, fechas futuras, inversión de rango, más de 366 días, parámetros repetidos o combinación de rango y período. Autorización y errores de tenant siguen el manejo existente: 401, 403, 400 por identificador ajeno y 503 por instalación sin tienda o con múltiples tiendas. Los métodos de escritura retornan 405.

Ruta reutilizada sin cambios: `GET /api/tienda/pedidos/ultimos/?limite=5`.
Las últimas órdenes muestran las cinco más recientes de toda la tienda y permanecen independientes del período estadístico, preservando su contrato actual.

## Criterios comerciales y fechas

1. Ingresos: suma decimal de `Pedido.monto_total` solo para `Pedido.ESTADOS_PAGADOS`: `pagado`, `preparando`, `en_origen`, `enviado`, `en_reparto`, `entregado`. Los estados logísticos mantienen el pago confirmado según las reglas existentes. Pendientes y cancelados no suman; el rechazo manual se registra como `cancelado`. No hay una tabla independiente de pagos confirmados usada para estas métricas.
2. Pedidos: todos los registros de `Pedido` de la tienda dentro del período, incluidos pendientes y cancelados. Se cuenta la clave primaria, no el identificador comercial (que no es único), ni ítems ni notificaciones de pago.
3. Por despachar: `pendiente`, `pagado`, `preparando`, `en_origen`. Se conserva el criterio previo de incluir pendientes de pago y se incorporan los estados reales anteriores al envío. Cancelados y pedidos enviados/repartidos/entregados quedan fuera. El texto de la tarjeta explicita el criterio.
4. Fecha: creación del pedido. El modelo no tiene fecha de confirmación de pago; por ello el histórico representa ingresos actualmente confirmados de pedidos registrados ese día, no flujo de caja por fecha de pago. Una confirmación posterior puede actualizar el histórico de un día anterior.
5. Ventanas: siete o treinta días calendario incluyen hoy; `year` significa desde el 1 de enero del año actual hasta hoy. La fecha actual la determina el servidor en `America/Santiago`, no los mocks ni el reloj del cliente. SQL utiliza inicio inclusivo y medianoche del día siguiente exclusiva, con zona explícita también en la agrupación diaria y soporte de cambios horarios.
6. Tenant: se reutiliza `resolver_tienda(..., exigir_propietario=True)`. La arquitectura actual admite una tienda por instalación. No se selecciona una tienda enviada por el cliente; identificadores y cabeceras solo se contrastan y se rechazan si son ajenos. Con dos tiendas en la instalación falla de forma cerrada con 503, igual que los endpoints existentes. No se cambió esta arquitectura.
7. Una agregación SQL diaria produce tarjetas e histórico; no hay joins con ítems, ni consulta por cada día. La prueba verifica como máximo tres consultas SQL incluyendo autorización.

## Archivos

Creados:
- `backend/apps/core/infrastructure/dashboard.py`: consulta agregada.
- `backend/apps/core/presentation/dashboard.py`: autenticación, rango y respuesta REST.
- `backend/apps/core/test_dashboard.py`: pruebas de contrato, métricas, fechas, acceso y regresión.
- `backend/scripts/test_dashboard.py`: runner SQLite en memoria, no toca la BD local.
- `frontend/src/features/admin/services/dashboardService.ts`: consulta con token, cancelación y validación de respuesta.
- `frontend/src/features/admin/components/dashboard/DashboardMetrics.tsx`: tarjetas y tabla histórica.
- `frontend/tests/dashboard.cjs`: pruebas de servicio, estados, selección y respuestas fuera de orden.
- `frontend/tests/dashboard-visual.cjs`: render de componentes reales con fixtures y CSS compilado, comprobaciones en navegador.
- `docs/dashboard-operativo-sprint5.md`: este informe.

Modificados:
- `backend/apps/core/urls.py`: registro de la ruta.
- `frontend/src/features/admin/pages/Dashboard.tsx`: integración y eliminación de cálculos simulados.
- `frontend/package.json`: comando `test:dashboard`.
- `frontend/tests/recent-orders.cjs`: adaptación de mocks a las dependencias nuevas del dashboard.

## Pruebas ejecutadas (14 de octubre de 2026)

- `python backend/scripts/test_dashboard.py`: **39 pruebas OK**, 15 del dashboard y regresión de últimas órdenes/estados de pedido. Base SQLite aislada en memoria. Incluye estados confirmados, pendientes/cancelados, precisión decimal, identificadores repetidos e ítems, ventanas actuales, límites UTC/Chile, cambio horario, ceros, rangos inválidos, usuario ajeno/inactivo/anónimo, suplantación y múltiples tiendas.
- `npm run test:dashboard`: **28 pruebas OK** (7 dashboard + 21 últimas órdenes). Incluye token, errores HTTP/red/JSON, respuesta inválida, cancelación, carga/vacío/reintento, cambio de período y descarte de respuesta anterior.
- Se ejecutaron los **29 archivos funcionales `.cjs` de frontend** (excluyendo la prueba de navegador, ejecutada aparte): todos terminaron con código 0.
- `npm run build`: **OK**, incluidos ambos proyectos TypeScript. Primer intento bloqueado por acceso de esbuild a carpetas superiores en sandbox; reintento autorizado de compilación local exitoso. Advertencia de Vite por chunk mayor de 500 kB, sin error.
- `dashboard-visual.cjs`: **12 escenarios OK** con Edge sin interfaz: anchos 375/768/1280 px × datos/carga/error/vacío. Se verifica ausencia de desbordamiento de página y tarjetas apiladas o en fila según tamaño. Capturas fuera del repositorio, en la carpeta de visualizaciones del chat. Inspección visual de móvil con datos y escritorio con error completada. Usa fixtures de prueba, no una sesión autenticada contra datos productivos.
- `git diff --check`: **OK**; solo aviso de conversión LF/CRLF.
- No existe comando/configuración de lint en el proyecto; no se añadió herramienta nueva ni se afirma haber ejecutado lint.
- La suite ampliada `apps.core` se interrumpió tras errores repetidos de infraestructura; la repetición con `--failfast` descubre 323 pruebas y falla en la primera prueba existente de checkout, en setup y cleanup, porque `mongodb:27017` no se resuelve. No se afirma que la suite completa pase.

## Limitaciones y QA pendiente

- Validación del backend realizada con SQLite, no con PostgreSQL real. Se debe repetir con los servicios del proyecto disponibles.
- MongoDB no accesible desde esta ejecución local; limita las pruebas existentes de checkout y la suite completa.
- Verificación visual de componentes reales y CSS compilado, con fixtures; falta recorrido completo con propietario autenticado y pedidos reales en el entorno de integración.
- La instalación permite una tienda; múltiples tiendas no constituyen una selección multi-tenant soportada actualmente.
- Confirmar en revisión funcional que la tarjeta "Por Despachar" continúe incluyendo pendientes de pago y los estados previos al envío, como se documenta arriba.

## Cómo ejecutar y verificar

Desde la raíz:
```powershell
python backend/scripts/test_dashboard.py
```
Desde `frontend`:
```powershell
npm run test:dashboard
npm run build
```
Para repetir las capturas, usar Playwright disponible en el entorno sin instalarlo como dependencia del proyecto. El script permite la ruta del módulo mediante `DASHBOARD_PLAYWRIGHT_MODULE` y el canal mediante `DASHBOARD_BROWSER_CHANNEL` (por defecto Edge):
```powershell
node tests/dashboard-visual.cjs
```

Para QA con los servicios completos, seguir `EJECUCION_LOCAL.md` (`docker compose up --build`). No se ejecutó ese comando durante esta tarea. Dentro del contenedor del backend:
```powershell
docker compose exec backend python manage.py test apps.core.test_dashboard apps.core.test_ultimas_ordenes apps.core.test_estados_pedido
```

Abrir `http://localhost:5173`, iniciar sesión como propietario activo y acceder al dashboard del panel emprendedor. Cambiar entre 7/30/año y comprobar métricas e histórico. Verificar un período sin pedidos, fallo de conexión y reintento. Comprobar que una orden pendiente/cancelada se contabiliza como pedido pero no suma ingresos; un pago confirmado y sus estados logísticos sí. Contrastar la tabla diaria con las tarjetas. Verificar que últimas órdenes sigue mostrando las cinco más recientes y "Ver todos" funciona. Repetir a 375, 768 y 1280 px, incluido el desplazamiento horizontal del histórico. Con otra cuenta o identificador de tienda ajeno, la API debe rechazar el acceso.

## Git

Rama verificada: `feature/sprint5-dashboard-operativo`. Árbol inicialmente limpio. Todos los cambios permanecen sin staging ni commits. No se ejecutaron add, commit, push, merge, rebase, cambios de rama ni creación de PR. La salida final de `git status --short --branch` se incluye en la entrega.
