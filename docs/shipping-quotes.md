# Cotización y checkout

`POST /api/entregas/cotizacion/` completa la ruta que ya consumía `shippingService.ts`.
En develop solo existían los normalizadores de Chilexpress/Starken y el frontend;
no había cliente HTTP, puerto, servicio, serializer ni vista de cotización.

## Configuración vigente

El propietario usa `PUT/PATCH /api/entregas/configuracion/` (panel Entregas) para
guardar `chilexpress.tarifas` / `starken.tarifas` en `ConfiguracionEntrega.datos`:

```json
{"enabled":true,"tarifas":[{"region":"Metropolitana de Santiago","comuna":"Providencia","monto":4500,"plazo_dias":2}]}
```

Se aceptan pesos enteros no negativos y un plazo opcional de 1 a 365 días. Solo
puede existir una tarifa por destino y operador. Región/comuna se contrastan con
el mismo catálogo territorial del frontend, copiado en `backend/apps/core/data`
para que el despliegue del backend sea independiente. Se admiten los alias de
región ya usados en checkout. Los datos históricos sin tarifas no producen
precios por defecto. No se modifican configuraciones existentes automáticamente.

**Limitación deliberada:** son tarifas configuradas manualmente por la tienda,
independientes de peso/dimensiones. No son cotizaciones comerciales en vivo de
Chilexpress/Starken. No se guardan credenciales ni se contratan despachos. Los
normalizadores existentes convierten la tarifa configurada al contrato común;
`origen` identifica explícitamente esta fuente. Tracking conserva su contrato.

## Request y response

```json
{"operador":"Chilexpress","region":"Metropolitana","comuna":"Providencia"}
```

```json
{"exito":true,"mensaje":"","data":{"tarifas":[{
  "operador":"Chilexpress","monto":"4500","moneda":"CLP","plazo_dias":2,
  "region":"Metropolitana de Santiago","comuna":"Providencia",
  "origen":"configuracion_tienda","vence_en":1790000900,
  "cotizacion":"<referencia firmada por el servidor>"
}]}}
```

`tarifas` contiene una tarifa para el operador solicitado. `vence_en` es un timestamp
Unix generado al emitir la cotización (el valor del ejemplo es ilustrativo).
Se preservan `operador`, `monto`, `plazo_dias` de los adapters y la lista `tarifas`
del consumidor. A la consulta antigua de solo comuna se agregan operador/región.
No admite `tienda_id`, `store_id`, `merchant_id` ni campos adicionales. Usa
`resolver_tienda`: actualmente una tienda por instancia; cero/múltiples tiendas
producen 503, nunca una elección arbitraria. Los identificadores de contexto
se contrastan con esa tienda; no la seleccionan.

Un destino inválido, transportista inválido/deshabilitado, tarifa inexistente o
respuesta de adapter inválida produce 400 con un error de validación público.
Retiro no usa esta ruta. No se incluyen mensajes internos de los adapters.

## Autoridad del pedido

`POST /api/checkout/pedidos/` mantiene su payload, añadiendo `cotizacion` para
despacho. `direccion.region` y `direccion.city` contienen región y comuna;
calle/número/departamento mantienen sus campos actuales. Nunca recibe precios.

La referencia firmada vence a los 15 minutos y liga tienda, operador, destino,
monto, moneda, plazo y origen. Antes de reservar stock el checkout comprueba la
firma, vigencia y tarifa contra la configuración actual bajo el bloqueo existente
de tienda. Una tarifa modificada, eliminada, manipulada o deshabilitada se rechaza.
`costo_envio` enviado por cliente se rechaza como campo desconocido.

Se guardan `entrega.metodo`, `entrega.direccion` y el snapshot normalizado en
`entrega.cotizacion`; `costo_envio` proviene de la tarifa revalidada y
`monto_total = subtotal - descuento + costo_envio`. Retiro usa cero y guarda
`entrega.retiro.address/schedule` desde la configuración. No necesita destino.
Los reintentos idempotentes conservan el pedido ya creado aun si después cambia
la tarifa; la referencia temporal no forma parte de la huella comercial.

## Interfaz

Checkout cotiza solo el transportista seleccionado. Cambiar región/comuna/operador
invalida inmediatamente el precio; una respuesta abortada no puede restaurarlo.
La expiración también invalida la tarifa. Carga/error/falta de tarifa bloquean
confirmación y permiten reintentar. El resumen usa exactamente ese monto; mientras
no exista muestra «Por cotizar» y «Total sin envío». El carrito informa que el
envío se calcula en checkout. Se eliminan $3.490 y envío gratis sobre $50.000 del
flujo real. Un cero explícito configurado es válido; no se infiere de subtotal.

## Archivos de esta intervención

Backend (9):

- `backend/apps/core/data/chile_territory.json`
- `backend/apps/core/delivery.py`
- `backend/apps/core/shipping.py`
- `backend/apps/core/presentation/shipping.py`
- `backend/apps/core/presentation/checkout.py`
- `backend/apps/core/presentation/serializers.py`
- `backend/apps/core/urls.py`
- `backend/apps/core/test_shipping.py`
- `backend/apps/core/test_checkout.py`

Frontend (10):

- `frontend/src/features/admin/pages/Shipping.tsx`
- `frontend/src/features/admin/types/index.ts`
- `frontend/src/features/storefront/context/CartContext.tsx`
- `frontend/src/features/storefront/data/comunasChile.ts`
- `frontend/src/features/storefront/pages/Cart.tsx`
- `frontend/src/features/storefront/pages/Checkout.tsx`
- `frontend/src/features/storefront/services/orderService.ts`
- `frontend/src/features/storefront/services/shippingService.ts`
- `frontend/tests/cart-checkout.cjs`
- `frontend/tests/checkout-shipping.cjs`

Documentación (1): `docs/shipping-quotes.md`.

Se conservan además los seis archivos que ya estaban staged del merge y que esta
intervención no modifica: dominio/adapters de seguimiento y tarifas (cuatro) y
migraciones `0006_configuracionpago_varianteproducto.py` / `0019_merge_20261008_1504.py`.
