# Finalización de OpenMind: avance verificable

Fecha: 20 de noviembre de 2026. Rama: `fix/conciliacion-webpay-actividades`.
Restricciones: sin commits, merges, push ni despliegues; sin pagos de producción,
sin modificar pedidos históricos ni activar seguimiento o recordatorios.

## Fase 0 — Auditoría inicial

Repositorio real: `C:\Users\maria\Ecommerce\ua-consultoria-openmind`.
HEAD y develop local: `4aaac08`. Los últimos cambios de develop incluyen selección
de plantilla en servidor (`4aaac08`, `4c45dcd`), categorías y colores (`815252f`,
`22f5bb9`) y retorno Webpay (`3255933`, `fb5963a`). No se descargaron referencias
remotas. El directorio inicial de OneDrive contiene materiales y otro prototipo.

Estado de entrada: modificación local en `backend/apps/landing/webpay_activity_orders.py`
y `catalogo_meta_previa.tsv` sin seguimiento. El TSV no se incorpora al trabajo.

Los estados siguientes describen código encontrado, **no certifican pagos reales**.

| Funcionalidad | Estado actual | Problema encontrado o límite | Archivos involucrados | Solución propuesta | Pruebas necesarias |
| --- | --- | --- | --- | --- | --- |
| Webpay: inicio y retorno | Implementado, con pruebas existentes | API 1.0 para tokens previos y 1.2 para nuevos; falta validar sandbox de punta a punta | `backend/apps/catalog/application/use_cases.py`, `backend/apps/catalog/presentation/views.py`, `frontend/tests/payment-return.cjs` | Conservar tokens y versiones, comprobar retorno e identidad | Inicio, retorno GET/POST, identidad de sesión/orden/monto |
| Webpay: conciliación de talleres | Implementado parcialmente; prioridad P0 | Cambio local cancela INITIALIZED por antigüedad en integración, sin resultado terminal | `backend/apps/landing/webpay_activity_orders.py` | Retener cupos ante incertidumbre; liberar solo sin inicio o con estado terminal verificado | Autorización, rechazo, abandono, vencimiento, retorno tardío/repetido, comunicación, concurrencia |
| Reservas y cupos | Implementado | `en_pago` y `revision_pago` ocupan cupos incluso vencidos; debe mantenerse al conciliar | `backend/apps/landing/paid_availability.py`, `backend/apps/core/infrastructure/expiracion_pedidos.py` | Reutilizar bloqueos SQL y disponibilidad existentes | Capacidad agotada, reserva simultánea, expirador frente a confirmación |
| Carrito mixto | Implementado y condicionado por flags | Necesita PostgreSQL y MongoDB reales para verificar inventario e idempotencia | `backend/apps/landing/mixed_activity_orders.py`, `backend/apps/core/presentation/checkout.py`, `backend/apps/landing/test_mixed_webpay_activities.py` | Conservar marcadores atómicos de inventario y validación del total | Webpay/transferencia, stock insuficiente, reintentos, despacho físico |
| Transferencia de actividades | Implementado, confirmación manual | Debe permanecer separada del expirador de Webpay | `backend/apps/landing/transfer_activity_orders.py`, `backend/apps/landing/test_activity_transfer_pilot.py` | Ejecutar regresiones existentes | Confirmación/cancelación manual, cupos, compra mixta |
| PayPal y Mercado Pago | Implementados mediante adaptadores, verificación y flags | Sin evidencia nueva de sandbox ni credenciales por tienda | `backend/apps/landing/external_activity_orders.py`, `backend/apps/core/payments.py` | Auditar capacidades sin anunciar métodos deshabilitados | Éxito, rechazo, cancelación y respuesta incierta |
| TUU y Linkify | Integraciones existentes, capacidades distintas de Webpay | No asumir compatibilidad con actividades por su existencia para productos | `backend/apps/core/payments.py`, `backend/apps/core/test_scrum_509_tuu.py`, `backend/apps/core/test_linkify_notificacion.py` | Conservar habilitación y callbacks propios | Configuración, autenticidad, duplicados, error |
| Devoluciones | Implementadas, con libro de operaciones y revisión manual | Diferenciar reversa/anulación total/parcial y devolución manual; pendiente sandbox | `backend/apps/landing/webpay_activity_refunds.py`, `backend/apps/landing/external_activity_refunds.py`, `backend/apps/landing/transfer_activity_orders.py` | Reutilizar operaciones existentes y verificar idempotencia | Total, parcial, timeout y segundo intento |
| Consultas de talleres/servicios | Implementadas | Huella incluye sección, tipo, día y contenido; la unicidad por email solo limita inscripciones | `backend/apps/landing/activity_views.py`, `backend/apps/landing/activities.py`, `backend/apps/landing/models.py` | Probar consultas distintas y repetición accidental antes de cambiar | Dos talleres, dos servicios, mensajes diferentes, duplicados |
| Correos | Consultas y pedidos implementados; cobertura de inscripción al emprendedor por verificar | Webpay solo programa aviso al cliente en producción; no asumir aviso al dueño | `backend/apps/landing/activity_owner_notifications.py`, `backend/apps/core/infrastructure/notificaciones_pedido.py`, `backend/apps/landing/webpay_activity_orders.py` | Reutilizar transporte y callbacks después del commit; probar sin correo real | Destinatarios, contenido, duplicados, fallo SMTP, Mailpit |
| Eliminación del carrito | Pendiente de confirmación en las rutas inspeccionadas | Botones llaman directamente a removeItem/remove | `frontend/src/features/storefront/pages/Cart.tsx`, `frontend/src/features/storefront/components/store/ActivityCartPreview.tsx` | Confirmación usando patrones de diálogo existentes, conservar diseño | Aceptar/cancelar, última unidad, cuatro plantillas y móvil |
| Carrito abandonado | Implementado, deshabilitado por defecto en código | Verificar también propagación de flags en Compose y cancelación al comprar | `backend/apps/landing/cart_reminders.py`, `backend/apps/landing/abandoned_cart_jobs.py`, `docker-compose.yml` | Mantener deshabilitado, reutilizar consentimiento y deduplicación | Inactividad, consentimiento revocado, compra completada, no reenvío incierto |
| Meta Pixel | Implementado, con consentimiento y pruebas existentes | Pendiente verificar Purchase tras pago y valores de carritos mixtos | `frontend/src/features/storefront/services/metaPixelService.ts`, `frontend/tests/seo-pixel.cjs`, `frontend/tests/meta-pixel-public-store.cjs` | Conservar activación explícita y deduplicación | Cinco eventos, consentimiento, recarga y total confirmado |

### Entorno y límites iniciales

- Docker CLI está instalado, pero no existe el pipe `dockerDesktopLinuxEngine`:
  Docker Desktop/daemon Linux está detenido. No se ejecutan workers contra los datos existentes.
- El Python global 3.14 no tiene Django; `backend/venv/Scripts/python.exe`
  tiene Python 3.13 y dependencias de Django/psycopg2/requests.
- Existen binarios locales de PostgreSQL 17 y MongoDB 8.3. Se evaluará usarlos
  con bases efímeras aisladas, sin reutilizar bases de desarrollo ni históricas.
- Postman CLI 1.75.0 está disponible; `postman status` no está soportado.
  La consulta pública a Orbit no resolvió DNS. Se consultó la documentación
  oficial de Transbank como fuente alternativa:
  <https://github.com/TransbankDevelopers/transbank-developers-docs/blob/master/documentacion/webpay-plus/README.md>.
- Variables a revisar por presencia, sin mostrar valores: PostgreSQL/MongoDB,
  `PAYMENT_CREDENTIALS_KEY`, flags `PAID_ACTIVITY_*`, `EMAIL_*`,
  `STORE_MAIL_*`, `CART_REMINDERS_ENABLED` y configuración Pixel/consentimiento.
  Las credenciales comerciales de pasarelas se guardan por tienda; la presencia
  de variables no demuestra que estén configuradas ni que funcionen.

## Fase 1 — Webpay y reservas vencidas

Validación local realizada; sandbox real pendiente. La regla segura es conservar un pedido pendiente y sus cupos cuando
la transacción tiene token y resultado incierto. Un timeout local no prueba
rechazo. AUTHORIZED requiere identidad coincidente y autorización; FAILED,
REVERSED y NULLIFIED permiten cancelar pedidos pendientes sin efectos de stock.
La conciliación automática nunca debe ejecutar el commit del pago.

Cambios mínimos: retirada la cancelación local por antigüedad de INITIALIZED;
registro explícito de `revision_pendiente` y `motivo_revision` sin liberar cupos;
fallos de consulta/confirmación conservan el pedido pendiente. Tras una confirmación
incierta, los retornos posteriores solo consultan hasta obtener evidencia final.
La autorización o cancelación verificada cierra la marca de revisión.
Se conserva el bloqueo SQL por pedido/reserva y el inventario idempotente existente.

Pruebas ejecutadas:

- Línea base: 16 pruebas correctas antes de cambiar la implementación.
- Reproducción: INITIALIZED vencido se cancelaba y el callback tardío no podía
  confirmar; ambas regresiones fallaron antes de la corrección.
- Suite final de esta fase: **49 pruebas correctas**, sin omisiones, con PostgreSQL 17
  y MongoDB 8.3 locales aislados. Incluye concurrencia expirador/callback, identidad,
  rechazo/reversa/anulación, abandono con token, vencimiento sin token, confirmación
  tardía y repetida, taller iniciado, stock insuficiente y mixto, transferencia y reembolsos.
- Cinco de esas pruebas usaron HTTP real contra una simulación local de Postman:
  GET/PUT exitosos, conciliación sin PUT, GET 503, PUT 503 con retorno repetido y FAILED.
  El registro del simulador mostró las peticiones esperadas. En el caso de PUT incierto
  hubo dos GET y **un solo PUT**; se conservaron los cupos.
- Estas pruebas **no son pagos reales en sandbox**. Las respuestas del proveedor se
  controlan mediante mocks; las transacciones/bloqueos SQL y las operaciones Mongo son reales.
- Docker sigue detenido. El primer intento dentro del sandbox del agente no pudo
  conectar por la restricción TCP (`10013`). Se ejecutó posteriormente el entorno
  aislado con la escalación autorizada; no se iniciaron workers ni bases existentes.

Se agregó `config.test_commerce` para reproducir las pruebas con bases exclusivas
en puertos 55439/55440, correo en memoria y sin leer `.env`. La simulación escucha
en 55442 y no usa credenciales reales. Los datos temporales están en el directorio
ignorado `backend/.pytest_cache/commerce-qa`. Falta validar el navegador y la pasarela
Transbank de integración de punta a punta; la fase no se certifica completa externamente.

### Comprobación del frontend

`npm --prefix frontend run build`: correcto (TypeScript y Vite).
La ejecución inicial de pruebas Node encontró problemas previos en los harness:
imports de Meta Pixel y metaPurchaseTracking sin mock y `import.meta.env` sin
transformar; las pruebas de navegador requieren Playwright, ausente en dependencias.
Las pruebas existentes de `seo-pixel.cjs` y `sprint7-payment-security.cjs` pasaron.

## Fase 2 — Compras mixtas y pagos de talleres

**38 pruebas correctas** en bases aisladas. Se conservaron las implementaciones:
el total se calcula en servidor, las actividades no generan despacho propio,
los medios se filtran por compatibilidad y flags y el stock se descuenta al pagar
mediante marcadores atómicos Mongo. Se agregaron pruebas de transferencia mixta:
dos confirmaciones manuales de un pedido sintético descontaron una sola unidad
y confirmaron la reserva una vez; su flag específico deshabilitado rechazó la compra.
Una prueba concurrente con dos compradores solicitando dos cupos cada uno en un
taller de tres aceptó una reserva y rechazó la otra, usando bloqueos reales PostgreSQL.

Se actualizó la fixture de configuración pagada para incluir una portada con el
formato actual del editor; no se relajó la validación del producto. No hubo cambios
en plantillas, colores, categorías ni editor. Checkout y pagos reales de navegador
siguen pendientes. `manage.py check`: sin problemas; `makemigrations --check
--dry-run`: sin cambios detectados, usando `config.test_commerce`.

## Fase 3 — Integraciones y devoluciones

Suite de **139 pruebas: 137 correctas y 2 omitidas**, con pasarelas simuladas y
bases aisladas. Cubre credenciales/habilitación, firmas y montos de TUU/Linkify,
identidad y tipo de cambio de PayPal, Mercado Pago, retorno/reintento de Webpay,
conciliación, devolución parcial/total de actividades y bloqueo del segundo
reembolso tras un resultado incierto. No se cambiaron adaptadores ni habilitaciones.

Las dos omisiones prueban señales POSIX del daemon del expirador. Se añadió
`skipIf` únicamente en Windows: `os.kill(..., SIGTERM)` terminaba el runner en
este sistema antes de generar el informe. Estas pruebas permanecen activas en
Linux/Docker y deben ejecutarse allí; no se las considera aprobadas aquí.

Capacidades encontradas:

| Método | Cobro / verificación | Actividades | Devoluciones |
| --- | --- | --- | --- |
| Webpay | Creación y redirección, retorno y confirmación/consulta en backend | Flag y lista de tiendas; producción protegida | API 1.2 total/parcial según saldo e identidad; tokens 1.0 requieren revisión |
| PayPal | Orden externa, aprobación y captura; FX CLP/USD vigente | Flag y configuración comercial correspondiente | API cuando está habilitada, con libro e identidad de captura |
| Mercado Pago | Preferencia/redirección y consulta de pago | Flag y credenciales coincidentes | API cuando está habilitada, con libro e identidad del pago |
| TUU | Redirección y callback firmado | Configuración y callback HTTPS, flags externos | Gestión manual cuando no hay capacidad automática implementada |
| Linkify | Enlace externo y notificación validada | Flags externos; ambiente registrado de producción, no se prueba en vivo | Gestión manual según capacidades existentes |
| Transferencia | Instrucciones y validación manual del emprendedor | Flag propio; mixto con flag adicional | Registro manual con autorización y referencia; no declara devolución por pasarela |

No se realizaron pagos ni devoluciones reales. Sandbox y callbacks públicos de
los proveedores quedan sin comprobar; no se activó producción ni se inspeccionaron
credenciales comerciales de las tiendas históricas.

## Fase 4 — Consultas de talleres y servicios

Se corrigió el formulario público: al reabrirlo después de un envío correcto,
vuelve a permitir una nueva solicitud. Se conservan el consentimiento obligatorio,
el bloqueo de doble envío y la clave del reintento mientras el contenido no cambie.
Una prueba reprodujo el bloqueo antes de corregirlo.

**37 pruebas backend y 5 frontend correctas.** Cubren consultas diferentes con el
mismo correo y distintas claves, talleres/servicios, duplicados, panel, permisos,
seguimiento, respuestas y concurrencia de cupos. El frontend prueba los cuatro
renderizadores y que una segunda consulta recibe otra clave. Se mantiene el límite
antispam de cinco envíos por hora/correo. La fixture antigua se actualizó con una
portada válida y el entorno de prueba usa un MEDIA_ROOT aislado.

## Fase 5 — Correo

Se agregó el aviso que faltaba al emprendedor por inscripción pagada, reutilizando
`activity_owner_notifications` y `send_store_mail`. Se programa después del commit
en Webpay, transferencia y pasarelas externas; usa una clave estable por pedido y
el libro existente para evitar duplicados. Solo considera pedidos pagados y cupos
confirmados. Integración/sandbox solo usa transporte local, nunca Gmail externo.
Un fallo del correo no revierte el pago ni las inscripciones.

**89 pruebas correctas**, con correo en memoria, pruebas del servicio existente y
HTTP real hacia el simulador local de Gmail. Se verificaron destinatario, contenido,
no inclusión del token, deduplicación y conservación del pago ante fallo SMTP.
Gmail real y Mailpit real no se probaron: Docker está detenido y no se encontró
un ejecutable local de Mailpit. Los avisos de consulta y del cliente conservan sus
canales existentes; no se enviaron mensajes a destinatarios reales.

## Fase 6 — Experiencia del carrito

Se agregó confirmación nativa antes de quitar productos, actividades y el último
participante/unidad desde el carrito. Cancelar conserva la selección; los demás
ajustes de cantidad conservan la lógica existente. Se mantiene el diseño y no se
modifica la limpieza automática al completar una compra.

**5 pruebas frontend correctas**, que ejecutan las acciones de eliminación y
reducción en los cuatro renderizadores y en talleres/servicios. La revisión de
React no identificó nuevos efectos, peticiones ni dependencias de hooks.
La comprobación visual real de escritorio/móvil todavía está pendiente.

## Fase 7 — Carritos abandonados

La implementación existente pasó **7 pruebas nuevas**: deshabilitado por defecto
sin consultas ni envíos, inactividad mínima de dos horas, consentimiento retirado,
retiro entre las dos comprobaciones, checkout iniciado que detiene publicidad,
un solo recordatorio con baja y resultado incierto que no se reintenta.
Se usaron correo en memoria y datos aislados, sin activar el flag real.
Compose ya propaga `CART_REMINDERS_ENABLED` con valor predeterminado `0`.
Los datos del carrito guardan solo nombres/cantidades y la ruta; se conserva la
frecuencia mínima existente. Entrega por Mailpit/Gmail reales sigue pendiente.

## Fase 8 — Meta Pixel

Se conservó la implementación. La revisión confirma que el banner exige
consentimiento y no inicia el SDK en la vista previa del editor. Checkout solo
guarda datos de medición con el total devuelto por el servidor; Purchase se llama
desde retornos aprobados, seguimiento o pedidos pagados, con deduplicación por
sesión, tienda y pedido. Las actividades usan identificadores `activity:<id>`.

**8 pruebas frontend correctas** en la ejecución inicial de esta fase: consentimiento,
revocación, PageView duplicado, SDK, valor mixto, datos corruptos y retornos de pago.
Se agregó cobertura de que un error o pago pendiente no dispara Purchase y se
actualizó el mock antiguo del retorno. Ninguna prueba contacta Meta.
No se activó Pixel ni se verificó recepción de eventos en Meta; separar las
cuentas/píxeles de pruebas y producción y comprobar todos los eventos en navegador
sigue siendo condición de habilitación, sin afirmar que esté certificado.

## Fase 9 — Regresión final y QA

Se ejecutó la suite completa del backend con:
`python manage.py test apps --settings=config.test_commerce`

Resultados:
- 1.497 pruebas ejecutadas.
- 1.489 aprobadas.
- 8 omitidas.
- 0 errores y 0 fallos.
- Código de salida 0.
- Duración: 200,084 segundos.

Las 30 pruebas del carrusel y biblioteca multimedia pasaron
después de corregir el aislamiento de transacciones mediante
TransactionTestCase.

La integración real con Mailpit queda como prueba opcional,
habilitable mediante RUN_MAILPIT_INTEGRATION=1.

Frontend:
- npm run build: correcto.
- TypeScript sin errores.
- Vite: 375 módulos transformados.
- 7 suites seleccionadas aprobadas.
- Actividades, carrito, confirmación de eliminación,
  retorno de pagos y Meta Pixel validados mediante pruebas automatizadas.
- Cuatro plantillas verificadas automáticamente a 375 px y 1280 px.

No se realizaron pagos reales ni pruebas con proveedores en producción.
Permanecen pendientes el sandbox externo, el envío real por Gmail/Mailpit,
la recepción de eventos en Meta y la revisión visual manual.

## Fase 10 — Documentación y entrega

Se actualizaron los resultados finales de QA y se verificó la
compilación del frontend.

Pendiente antes del merge a develop:
- Revisar los archivos modificados y nuevos.
- Verificar la configuración QA y ausencia de credenciales.
- Confirmar que las pruebas no dependan de archivos temporales de Postman.
- Excluir registros locales de QA y catalogo_meta_previa.tsv.
- Revisar las 8 pruebas omitidas.
- Preparar commit y merge controlados.

No se declara aprobación de producción.
