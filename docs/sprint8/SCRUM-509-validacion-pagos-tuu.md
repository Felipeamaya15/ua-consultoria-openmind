# SCRUM-509 · Validación integral de pagos e investigación de compatibilidad con TUU


## 1. Registro de pruebas de las pasarelas existentes

Las pruebas manuales de SCRUM-499 dejaron 3 casos NO CUMPLE (P1 a P3, retorno de Webpay con HTTP 404) y 2 NO EJECUTABLE (Linkify y Mercado Pago/PayPal). Esta tarea corrige las causas.


| # | Pasarela | Escenario | Resultado SCRUM-499 | Cambio en SCRUM-509 | Estado actual |
| --- | --- | --- | --- | --- | --- |
| P1 | Webpay | Pago aprobado | NO CUMPLE (404 al volver) | Puente de retorno en el backend que recibe el POST de Webpay y redirige a la tienda con `token_ws` | Test automático OK; 
| P2 | Webpay | Pago rechazado | NO CUMPLE | Mismo puente | Test automático OK; 
| P3 | Webpay | Pago abortado | NO CUMPLE | El puente conserva `TBK_TOKEN`, `TBK_ORDEN_COMPRA` y `TBK_ID_SESION` | Test automático OK;|
| P4 | Webpay | Proveedor no disponible | CUMPLE | Sin cambios | CUMPLE |
| P5 | Webpay | Reintento | CUMPLE| Mismo puente |
| P6-P8 | Transferencia | Aprobar, rechazar, doble aprobación | CUMPLE | Sin cambios | CUMPLE |
| P9 | Linkify | Inicio de transacción | NO EJECUTABLE (sin credenciales) | Botón "Guardar Linkify" propio; apagarlo ya no exige ni borra credenciales | **No validado** |
| P10 | Mercado Pago | Activar y pagar | NO EJECUTABLE (no aparecía en el checkout) | Se habilita: inicio del cobro, retorno y confirmación en el servidor | Test automático OK;  |
| P11 | PayPal | Activar y pagar | NO EJECUTABLE (no aparecía en el checkout) | Se habilita: cobro en USD y captura en el servidor | Test automático OK; |
| P12 | Todas | El checkout muestra solo los métodos habilitados y con credenciales completas | Sin registro | `payment_methods_for_store` | Test automático OK (`test_scrum_509_tuu.py`, `test_scrum_509_paypal_mercadopago.py`) |
| P13 | Todas | Un pago rechazado, fallido o con firma/monto inválido no confirma la compra | Sin registro | Webpay, PayPal, Mercado Pago y TUU solo marcan Pagado con confirmación del servidor | Test automático OK (callback TUU, retorno Webpay, PayPal/Mercado Pago) |



## 2. Informe de compatibilidad Transbank – TUU

Fuente: documentación oficial de TUU (developers.tuu.cl).

### 2.1 Modalidades de TUU

| | TUU Pago Online | TUU Pago Remoto |
| --- | --- | --- |
| Qué es | Intento de pago online con página de pago de TUU | Webservice que envía el cobro a un POS físico |
| Autenticación | `x_account_id` + llave secreta (firma HMAC-SHA256 `x_signature`) | API Key del comercio (Espacio de Trabajo, Pagos > Configuración > API) |
| Endpoint | Integración: `https://frontend-api.payment.haulmer.dev/v1/payment`; Producción: `https://core.payment.haulmer.com/api/v1/payment` | |
|Resultado | Callback POST servidor a servidor (HTTPS) + redirecciones GET | Consulta del estado de la solicitud (Pending, Sent, Canceled, Processing, Failed, Completed) |
| Límites | Solo CLP | Monto entre 100 y 99.999.999; 1 solicitud por minuto y máximo 5 en cola por terminal |
| Ambiente de pruebas | **Sí**: credenciales y tarjetas de prueba publicadas | No documentado: requiere dispositivo |

**Modalidad adecuada para el checkout: Pago Online.** Pago Remoto sirve para cobrar en un local con POS, no para una compra web.

### 2.2 Diferencias con la integración actual de Transbank (Webpay Plus)

| Aspecto | Transbank (actual) | TUU Pago Online |
| --- | --- | --- |
| Credenciales | Código de comercio + API Key (cabeceras `Tbk-Api-Key-*`) | ID de cuenta + llave secreta de TUU |
| Inicio | Devuelve `token` + `url`; el navegador hace POST con `token_ws` | Se firma el cuerpo con HMAC-SHA256; con `X-REDIRECT: false` se espera una URL de pago |
| Retorno al comercio | POST del navegador a `return_url`; luego el backend **confirma** con Transbank | Callback POST servidor a servidor firmado; el backend **valida la firma** |
| Estados | Respuesta de confirmación | `x_result`: `completed`, `failed`, `pending` |
| Reintentos | No aplica | Hasta 10 reintentos si el callback no responde 200 |



### 2.3 Requisitos técnicos, contractuales y de seguridad

- Cuenta de comercio TUU con `x_account_id` y llave secreta (contratación con TUU). 
- URL de callback **HTTPS pública**: desde `localhost` TUU no puede avisar. Para probar se necesita un túnel o un ambiente desplegado.


### 2.4 Decisión: Escenario B (integración independiente)

**¿TUU usa las mismas credenciales que Transbank? No.** TUU Pago Online se autentica con su propio `x_account_id` y una llave secreta propia (firma HMAC-SHA256), distintos del código de comercio y la API Key de Transbank, con otros endpoints y otro mecanismo de retorno (callback firmado servidor a servidor). Por eso no corresponde reutilizar la integración de Transbank (Escenario A): se implementó un **adaptador independiente** (Escenario B) sin tocar Webpay ni la lógica central del checkout. No se necesita máquina física para Pago Online; sí una cuenta TUU contratada y una URL de callback HTTPS pública.

### 2.5 Arquitectura

La arquitectura actual permite añadir TUU sin tocar la lógica central del checkout: el patrón de Linkify (el pedido devuelve `url_pago` y la tienda redirige) se reutiliza tal cual.



### 2.6 Plan de pruebas TUU

Requiere túnel HTTPS y las credenciales de integración de TUU.

| # | Escenario | Esperado | Estado |
| --- | --- | --- | --- |
| T1 | VISA aprobada | Callback `completed`; pedido Pagado; correo de pago | Pendiente |
| T2 | MASTERCARD rechazada | Callback `failed`; pedido sigue Pendiente | Pendiente |
| T3 | Cancelar en la página de TUU | Pedido Pendiente, sin pago | Pendiente |
| T4 | Callback duplicado | Sin efectos duplicados | Cubierto por test automático |
| T5 | Callback con firma o monto alterado | 400 y pedido sin cambios | Cubierto por test automático |
| T6 | Sin `TUU_CALLBACK_BASE_URL` | TUU no inicia pago; mensaje claro | Pendiente |

Tests automáticos: `apps/core/test_scrum_509_tuu.py`, `apps/core/test_scrum_509_retorno_webpay.py` y `apps/core/test_scrum_509_paypal_mercadopago.py` y `apps/core/test_scrum_509_tipo_cambio.py`.

## 3. Limitaciones

- Verificar en sandbox la fuente del tipo de cambio (mindicador.cl o API SIETE del Banco Central con credenciales); las pruebas automáticas usan datos simulados porque el entorno de desarrollo no tuvo acceso a la red.

-Credenciales de prueba:** TUU publica un ID de cuenta, una llave secreta y tarjetas de prueba para integración en https://developers.tuu.cl/docs/payment-intent. pero no se comprobaron.

- TUU Pago Remoto queda fuera del alcance: requiere POS físico, que este proyecto no contempla adquirir.

## 4. Caso especial: Linkify

- Revisada la implementación: crea la URL de pago del pedido y recibe el aviso en `/api/pagos/linkify/notificacion/`.
- Cambios: botón "Guardar Linkify" propio en su sección; apagar Linkify ya no exige la clave privada y conserva las credenciales guardadas.
- Para validarlo de verdad se necesita una cuenta contratada en Linkify (ID de cuenta y clave privada) y una URL pública HTTPS para el aviso de pago; desde `localhost` Linkify no puede alcanzar el backend.

## PayPal y moneda (CLP → USD)

**Limitación.** PayPal no cobra en pesos chilenos de forma estándar. Su documentación solo permite CLP mediante el servicio *FX as a Service*, que exige contrato con PayPal y no aplica a un emprendedor pequeño. Por eso la tienda cobra en USD.

**Solución implementada (decisión de negocio a confirmar):**

1. El tipo de cambio es el dólar observado, obtenido solo (API SIETE del Banco Central si hay credenciales `BCCH_USUARIO`/`BCCH_CLAVE`; si no, mindicador.cl, que replica el dato oficial) y refrescado cada `PAYPAL_FX_REFRESCO_HORAS` (6 h).
Si la fuente principal falla se usa la de respaldo y, si ambas fallan, el último dato mientras siga vigente.
2. Se suma un margen configurable `PAYPAL_FX_MARGEN_PCT` (2 % por defecto) que encarece el dólar: `tasa = observado × (1 + margen)` y `USD = CLP / tasa`. Cubre variación del dólar y comisión de conversión de PayPal.
3. Antes de pagar, el comprador ve en el checkout el monto estimado en USD, el tipo de cambio, el margen y la fecha del dato; tras pagar ve el monto en USD cobrado.

## Correcciones durante las pruebas


- Las páginas de resultado de Webpay, PayPal y Mercado Pago muestran **Reintentar pago** cuando el pago fue rechazado o cancelado. Se paga el mismo pedido, sin crear uno nuevo ni duplicar inventario.
- Webpay: al rechazarse o anularse un pago se descarta el token usado, de modo que el reintento crea una transacción nueva. Un intento en curso sigue reutilizando su token.
- PayPal: cada reintento crea una orden nueva y solo se puede capturar la última; la conversión a USD se recalcula y se guarda de nuevo.


- **Pagar ahora** en Seguimiento (con el número de pedido y el correo de la compra) y en Mis pedidos (con sesión iniciada), para pedidos pendientes pagados con Webpay, PayPal o Mercado Pago.

- Si el comprador llega a la pantalla de rechazo o cancelación de Webpay sin los datos de la compra en el navegador, se le ofrece "Ver mi pedido y pagar", que lo lleva a Seguimiento.


**Limitaciones:** TUU y Linkify no tienen "Pagar ahora" porque dependen de un enlace de pago generado al crear el pedido. Transferencia bancaria se confirma manualmente.

## 5. Expiración de pedidos pendientes

### 5.1 Reglas


| Medio de pago | Plazo (configurable por tienda en Pagos) | Cómo se decide cancelar |
| --- | --- | --- |
| Webpay | Pago en línea: 2 h por defecto (1 a 720 h) | Se cancela si el plazo venció y su token de Webpay ya no puede cobrar (vigencia `WEBPAY_TOKEN_VIGENCIA_MINUTOS`, 30 min). Con un token vigente espera. |
| PayPal y Mercado Pago | El mismo plazo de pago en línea, más un margen de 10 min (`PAGOS_EXTERNOS_MARGEN_MINUTOS`) | Antes de cancelar se consulta a la pasarela (ver 5.2). |
| Transferencia y Linkify | Pago manual: 48 h por defecto; **0 = nunca expira** | Solo por plazo. |

- La tienda ve en el listado de transferencias pendientes la columna "Vence" y la etiqueta **Vencido**. Abrir el listado **no cancela nada**: hasta que corra el proceso programado, la tienda aún puede aprobar una transferencia que llegó a última hora.
- Consultar un pedido (Seguimiento, Mis pedidos) o crear uno libera lo vencido de Webpay y de pagos manuales, pero **nunca llama a PayPal ni a Mercado Pago**: eso solo lo hace el proceso programado.
- "Pagar ahora" ya no se ofrece pasado el plazo. Si al intentarlo se descubre que el pedido sí estaba pagado, se informa que ya no está pendiente.

### 5.2 Conciliación con PayPal y Mercado Pago

| La pasarela dice | Qué hace el sistema |
| --- | --- |
| Pago aprobado, con la misma referencia y el mismo monto | Marca el pedido como **Pagado** y avisa por correo; nunca lo cancela. |
| Pago en curso (Mercado Pago pendiente o en proceso; orden de PayPal aprobada sin capturar) | Espera y vuelve a mirar en la siguiente pasada. |
| Sin pagos, o todos rechazados, cancelados o devueltos; orden de PayPal sin aprobar | Cancela y libera el stock apartado (lo devuelve solo si ya se había descontado). |
| No responde, credenciales retiradas de Mercado Pago, o monto que no coincide | **No cancela**; deja un aviso en el log y reintenta. |

- La preferencia de pago de Mercado Pago vence junto con el pedido, de modo que no se puede pagar uno ya cancelado. PayPal solo cobra al capturar, y el servidor no captura pedidos cancelados.


