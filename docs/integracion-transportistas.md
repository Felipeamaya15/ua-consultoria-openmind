# Integración de transportistas (Chilexpress y Starken)

## Chilexpress: configuración por tienda (recomendada)

Desde el panel **Entregas → Chilexpress** cada tienda guarda su propia configuración, igual que las pasarelas de pago:

- **Ambiente `SANDBOX` / `PRODUCCION`**: elige el host oficial (`testservices.wschilexpress.com` o `services.wschilexpress.com`).
- **Una clave por producto** del portal developers.wschilexpress.com: *Cotizador*, *Coberturas* y *Envíos* (header `Ocp-Apim-Subscription-Key`). Se guardan **cifradas** y la API solo las devuelve enmascaradas.
- El formulario del panel tiene dos secciones:
  - **Cotización en el checkout** (lo mínimo para activar Chilexpress): claves *Cotizador* y *Coberturas* y código de comuna de origen.
  - **Guías automáticas (opcional)**: clave *Envíos*, **TCC**, **RUT de la empresa** (sin puntos ni dígito verificador), calle y número de origen y **teléfono del remitente**. Sin estos datos la cotización sigue funcionando y las guías se emiten por fuera del sistema.
- Cotización: `rating/api/v1.0/rates/courier` (API Cotizador). Cobertura: `georeference/api/v1.0/coverage-areas`.
- Sin credenciales en la tienda, se usa la tarifa manual del panel.

Datos de prueba del portal: TCC `18578680`, RUT `96756430` (en SANDBOX se usan por defecto si la tienda no los define). Para pasar a producción Chilexpress pide simular 10 OT (6 en RM y 4 a regiones) y enviarlas a soporteintegraciones@chilexpress.cl.

## Precio firmado al pagar

El checkout cotiza una vez y entrega un token firmado válido 15 minutos. Al confirmar el pedido **no se vuelve a llamar a la API**: se valida la firma, la vigencia, la tienda, el transportista y el destino, y se cobra el monto firmado. Ya no existe el error `COTIZACION_CAMBIO`; si el token venció, el comprador recibe `COTIZACION_VENCIDA` y vuelve a cotizar. Las tarifas de la API no incluyen descuentos ni tarifas pactadas, por lo que pueden diferir de lo que facture Chilexpress.

## Guía automática (API Envíos v1.0)

`POST /api/tienda/pedidos/<id>/guia-chilexpress/` (solo propietario) emite la orden de transporte en
`POST transport-orders/api/v1.0/transport-orders` con `labelType: 2` y la clave del producto **Envíos**:

- Requiere pedido **pagado**, método **Chilexpress** y credenciales de Envíos, TCC, RUT y dirección de origen.
- Direcciones `DEST` (la del pedido, comuna resuelta con la API Coberturas) y `DEV` (origen configurado); contactos `R` (tienda) y `D` (comprador).
- `serviceDeliveryCode` sale de la cotización firmada (`serviceTypeCode` del Cotizador); si no existe se usa `3`. Peso y dimensiones por defecto, como en la cotización.
- Éxito solo con `statusCode == 0`. Se guarda `entrega.codigo_seguimiento` (número de OT, usado por los correos) y `entrega.guia` (certificado, código de barras, etiqueta en Base64). **No cambia el estado del pedido**: el dueño sigue marcándolo «enviado».
- **Idempotente**: si el pedido ya tiene guía devuelve la existente; nunca emite dos.
- `GET /api/tienda/pedidos/<id>/guia-chilexpress/etiqueta/` descarga la etiqueta. El comprador nunca la recibe (se quita de sus respuestas).

## Seguimiento real (API Envíos v1.0)

`POST transport-orders/api/v1.0/tracking` con `{reference, transportOrderNumber, rut, showTrackingEvents: 1}`. Es la ruta por defecto
(`CHILEXPRESS_TRACKING_PATH` solo si necesitas otra). Se expone en `/api/logistica/seguimiento/chilexpress/<OT>/` (público, con las
credenciales de la tienda) y en `GET /api/tienda/pedidos/<id>/seguimiento/` (propietario). Devuelve estado actual, ubicación, datos de entrega
(receptor, fecha) y eventos con el certificado de entrega cuando existe. Con la API real el número de seguimiento es el **número de OT (solo dígitos)**.

## Pendiente / no verificado

- Los formatos de Envíos siguen la especificación entregada del portal; **no se probaron contra el sandbox real** (sin red en el entorno de desarrollo). Prueba una guía en SANDBOX antes de producción.
- **Starken** no tiene integración en vivo (no hay documentación pública): sus tarifas se manejan a mano en el panel Entregas por zona/peso.

## Qué hace

| Función | Chilexpress con credenciales en el panel de la tienda | Sin credenciales (y Starken) |
|---|---|---|
| Cotización (checkout) | Llama a la API del transportista | Usa la tarifa manual del panel Entregas |
| Seguimiento | Consulta la API y muestra los eventos reales | Datos simulados solo si `SHIPPING_ALLOW_SIMULATED=1`; si es `0`, responde error |
| Guía de despacho | Chilexpress: automática con la clave de Envíos (ver arriba) | Simulada solo si `SHIPPING_ALLOW_SIMULATED=1`; si es `0`, responde error |

Si la API falla (timeout, 5xx, credencial rechazada) o no cubre la comuna, el checkout cae a la tarifa manual de la tienda. Si tampoco hay tarifa manual responde `ERROR_COTIZACION` (reintentable).

## Configuración

Las credenciales de Chilexpress (claves de Cotizador, Coberturas y Envíos, código de origen, TCC y RUT) se ingresan **por tienda en el panel Entregas**
y se guardan cifradas con `PAYMENT_CREDENTIALS_KEY`. No existen variables de entorno para ellas ni para Starken.

Variables de entorno relacionadas (todas opcionales):

```
SHIPPING_ALLOW_SIMULATED=1   # desarrollo (.env.example). En producción el compose la fija en 0: nunca guías/seguimientos simulados
CHILEXPRESS_TRACKING_PATH=   # solo si Chilexpress cambia la ruta de seguimiento
SHIPPING_HTTP_TIMEOUT=  SHIPPING_DEFAULT_WEIGHT_KG=  SHIPPING_DEFAULT_DECLARED_VALUE=
```

> Las rutas y el formato de cada API están basados en un contrato supuesto y deben validarse contra la documentación vigente de cada transportista y con credenciales reales antes de activarse en producción.

## Seguimiento con API real

- Los códigos de prueba del modo simulado (`...0000`, `NOTFOUND`, `TIMEOUT`) solo funcionan sin credenciales; con la API real un número válido puede terminar en `0000`.
- No se inventa fecha estimada: con la API real `fecha_estimada_entrega` va vacío y el frontend no muestra "Entrega estimada".

## Pruebas

```
python manage.py test apps.shipping apps.core.test_shipping apps.core.test_shipping_errores apps.core.test_guia_chilexpress
```

- `apps/shipping/test_carrier_clients.py`: clientes HTTP (errores, credenciales no filtradas).
- `apps/shipping/test_live_integration.py`: adaptadores en vivo, modo simulado, seguimiento y respaldo manual del checkout.
- `apps/shipping/test_chilexpress_envios.py`: guía automática y seguimiento según la especificación de Envíos v1.0.
- `apps/core/test_guia_chilexpress.py`: endpoints del propietario (emitir guía, etiqueta, seguimiento).

## Limitaciones conocidas

- La guía automática es solo de Chilexpress; Starken sigue con guía manual.
- La cotización y la guía usan peso/dimensiones por defecto (`SHIPPING_DEFAULT_*`) cuando no hay datos del producto.
- El token de cotización firmado no se revalida contra la API al pagar; Chilexpress puede facturar una tarifa distinta (tarifas pactadas, descuentos).
- El seguimiento público por número de OT no exige datos del pedido: quien conozca un número de OT de tu cuenta puede consultarlo.

## Peso real, margen y envío a coordinar (patch 0005)

Con la API del transportista activa, la cotización se calcula con el **peso real del carrito**:

- **Peso por producto:** campo `peso_kg` (kg por unidad) en el editor de productos. Es opcional.
- **Peso por defecto:** Entregas → «Peso, paquete y margen del envío». Se usa en los productos sin peso. Si no se define, rige `SHIPPING_DEFAULT_WEIGHT_KG` (1 kg). Conviene poner el peso del producto más pesado.
- **Margen:** porcentaje que se suma a la tarifa de la API, para cubrir diferencias con lo que factura el transportista (10 % sobre $4.000 suma $400). Empieza en 0. No se aplica a las tarifas manuales por comuna ni se muestra al comprador.
- **Envío a coordinar:** si el carrito supera el peso máximo (15 kg) o las unidades máximas (10), la cotización responde `ENVIO_A_COORDINAR` y el comprador debe elegir retiro u otra alternativa. Vacío = sin límite. Solo aplica con la cotización automática: las tarifas manuales por comuna no tienen límite de peso ni de unidades.
- **Paquete:** alto/ancho/largo configurables (15×20×30 cm por defecto), iguales para todos los pedidos. El transportista puede cobrar por volumen.
- El peso queda firmado en la cotización; si el carrito cambia al pagar, se pide cotizar de nuevo.
- La guía usa el mismo peso con que se cobró el envío.
- `POST /api/entregas/cotizacion/` ahora recibe `items: [{producto_id, sku, cantidad}]` (obligatorio con la API activa).

Probar: `python manage.py test apps.core.test_peso_envio apps.core.test_delivery apps.core.test_shipping apps.core.test_guia_chilexpress`

## Medidas por producto (patch 0006)

El transportista puede cobrar por volumen, así que cada producto puede traer las medidas de su paquete ya embalado (bolsa, sobre o caja):

- **Producto:** campos `alto_cm`, `ancho_cm`, `largo_cm` (una unidad). Van las tres o ninguna.
- **Variantes:** una variante puede tener su propio peso y/o medidas (p. ej. shampoo de 250 ml y de 2 L); si los tiene reemplazan a los del producto, y si no, rigen los del producto. Las medidas de la variante también van las tres o ninguna.
- **Sin medidas:** todos los productos del pedido sin medidas se agrupan en **un solo paquete de la tienda** (Entregas → «Peso, paquete y margen»), sin importar cuántas unidades sean.
- **Pedido con varios productos:** se suma el volumen de cada producto por su cantidad y se cotiza un paquete equivalente: largo y ancho son los mayores de los productos y el alto se calcula para igualar el volumen (los productos se asumen apilados). Es una aproximación; el margen cubre la diferencia.
- El paquete y el volumen quedan firmados en la cotización: si cambian los productos al pagar, se pide cotizar de nuevo. La guía usa el mismo paquete.
