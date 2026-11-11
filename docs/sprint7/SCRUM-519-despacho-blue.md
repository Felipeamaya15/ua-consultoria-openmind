# SCRUM-519 — Emisión, etiquetas y seguimiento Blue Express

Este paquete se aplica sobre `repomix-blue-completo.xml`, después del cambio que permite cotizar varias unidades. Incluye únicamente archivos nuevos o modificados. No contiene credenciales ni modifica `.env`.

## Qué agrega

- Panel en Administración → Pedidos → detalle de un pedido Blue Express. El propietario declara cada bulto real en kg/cm y confirma el embalaje; solo puede emitir si el pedido está pagado.
- Registro persistente de emisión con referencia única, número de seguimiento y etiquetas PDF. Repetir una solicitud confirmada devuelve el despacho existente.
- Una respuesta incierta o timeout bloquea nuevas emisiones. El operador busca la referencia mostrada en Blue y asocia el tracking existente; el servidor verifica la referencia mediante Tracking Pull. No hay reintentos automáticos de emisión.
- Recuperación privada de etiquetas y consulta de seguimiento desde el panel. El comprador consulta tracking y eventos con número de pedido y correo, mediante el endpoint ya existente.
- Interruptor Blue Express en Administración → Entregas. La activación requiere credenciales/URLs de geo y pricing válidas y confirmación explícita del importe comercial en el servidor.
- Origen de despacho y fichas logísticas del catálogo registrados en Django Admin, restringidos al propietario activo de la tienda con los permisos administrativos correspondientes.
- Comando `sync_blue_tracking` para actualizar hasta 100 despachos pendientes, sin emitir órdenes.

## Aplicación

1. Conserva tus cambios actuales en Git antes de copiar. El ZIP incluye `BASE-SHA256.json` con los hashes de los archivos de origen (normalizados a LF) para detectar cambios posteriores al repomix.
2. Copia las carpetas `backend`, `frontend` y `docs` del ZIP sobre la raíz del proyecto. No copies los archivos auxiliares de la raíz a las carpetas de código.
3. Ejecuta desde PowerShell, en la raíz del repositorio:

```powershell
docker compose exec backend python manage.py test apps.shipping.test_blue_dispatch apps.shipping.test_blue_express_cart apps.core.test_blue_cart_api apps.core.test_blue_checkout apps.core.test_blue_checkout_order apps.core.test_blue_checkout_serializer apps.core.test_blue_public_shipping_api apps.core.test_blue_shipping_api apps.core.test_blue_territory_api apps.core.test_order_tracking
docker compose exec frontend node tests/blue-dispatch-panel.cjs
docker compose exec frontend node tests/blue-checkout-flow.cjs
docker compose exec frontend node tests/blue-cart-service.cjs
docker compose exec frontend npm run typecheck
docker compose exec backend python manage.py makemigrations shipping --check --dry-run
docker compose exec backend python manage.py migrate shipping
docker compose exec backend python manage.py check
git diff --check
```

La migración `shipping.0001_blue_shipment` depende de `core.0037_ficha_logistica_catalogo`. Ejecútala antes de probar el seguimiento de pedidos o el panel: ambos consultan la nueva tabla. No necesitas generar otra migración.

## Configuración y prueba QA

Las variables nuevas tienen valor seguro por defecto. Agrega a tu `.env` y a `.env.example`:

```dotenv
BLUE_EXPRESS_CHECKOUT_TOTAL_CONFIRMED=0
BLUE_EXPRESS_EMISSION_ENABLED=0
```

`BLUE_EXPRESS_CHECKOUT_TOTAL_CONFIRMED=1` significa que verificaste qué importe de Pricing se cobra al cliente (incluidos los impuestos/recargos aplicables al contrato). No equivale a tener una API key ni demuestra por sí mismo una cotización real correcta.

Para QA usa credenciales proporcionadas por Blue para ese ambiente, `BLUE_EXPRESS_ENABLED=1` y `BLUE_EXPRESS_ENVIRONMENT=qa`. Conserva las URLs geo/pricing que hayas verificado. Configura estas bases para las nuevas operaciones, sin anexar tracking:

```dotenv
BLUE_EXPRESS_EMISSION_URL=https://qa-bx-tracking.bluex.cl/bx-emission/v1
BLUE_EXPRESS_LABEL_URL=https://qa-bx-tracking.bluex.cl/bx-label/v1
BLUE_EXPRESS_TRACKING_URL=https://qaapigw.bluex.cl/bx-tracking/v1/tracking-pull
```

Se usan las variables existentes `BLUE_EXPRESS_TOKEN`, `BLUE_EXPRESS_USERCODE`, `BLUE_EXPRESS_CLIENT_ACCOUNT` y `BLUE_EXPRESS_USERNAME`. No se exponen en el frontend. Confirma con Blue que tu cuenta dispone de estos servicios y endpoints.

En QA, habilita las dos variables nuevas solo para realizar la prueba controlada, una vez verificado el importe de la cotización de prueba. Cambiar `.env` puede requerir recrear el contenedor para que Compose recargue las variables:

```powershell
docker compose up -d --force-recreate backend
```

Si Compose enumera variables individualmente, añade también las dos nuevas al servicio backend. No basta con cambiar un archivo que el contenedor no carga.

En Django Admin configura el origen con códigos territoriales Blue, dirección, nombre y teléfono; configura peso y medidas de cada SKU del catálogo. Usa una cuenta que sea propietaria de la tienda y tenga acceso/permisos de Django Admin. En Administración → Entregas activa Blue y guarda.

Prueba un pedido QA de varias unidades, con teléfono y dirección válidos. El pedido debe estar pagado; la emisión se solicita explícitamente al tener el embalaje listo. Verifica:

1. La cotización y el total del carrito coinciden con el caso de prueba acordado con Blue.
2. En el detalle del pedido, declara los bultos físicos y emite una sola vez.
3. Comprueba la referencia y la OS en Blue. Descarga y abre la etiqueta PDF; verifica remitente, destino y cantidad de bultos.
4. Actualiza seguimiento y consulta el pedido como comprador con número y correo.
5. Reabrir el pedido ofrece el despacho existente; no habilita una segunda emisión.
6. Para un resultado incierto, busca primero la referencia en Blue. Espera al menos dos minutos y usa «Verificar y asociar despacho existente». Si Blue confirma que no existe, requiere revisión operativa: este paquete no permite borrar la evidencia y reemitir a ciegas.

No actives producción por el solo hecho de que pasen pruebas simuladas. No se realizaron llamadas reales de emisión al preparar este paquete.

## Alcance y límites

La emisión usa servicio EX, producto P/PAQU, PDF (`printFormatCode=4`), sin cobertura extendida ni cobro al destinatario. No incluye retiro programado, cancelación de OS, seguros adicionales, puntos pickup o webhooks.

El peso/volumen equivalente usado para cotizar el carrito no se reutiliza como embalaje físico de emisión. El propietario declara las medidas reales; debe validar con Blue el efecto del embalaje sobre el costo facturado. La emisión no cambia automáticamente el importe ya cobrado al comprador.

El estado Blue se muestra separado del estado comercial del pedido. No se marca un pedido como entregado usando códigos cuya equivalencia no se haya verificado. Los cambios comerciales existentes continúan bajo control del administrador.

El seguimiento no se consulta a Blue en cada visita del comprador. Se actualiza desde el panel o ejecutando:

```powershell
docker compose exec backend python manage.py sync_blue_tracking
```

Para actualizaciones automáticas, programa ese comando en el servidor. Este paquete no instala un planificador.

La documentación suministrada usa `BX-CLIENT_ACCOUNT` para emisión/etiquetas y `BX-CLIENT-ACCOUNT` para Tracking Pull; se respeta esa diferencia. También contiene una URL de Pricing repetida en una tabla de emisión. Las rutas implementadas deben confirmarse en QA antes del uso comercial.

## Validación realizada

- 95 pruebas backend con proveedor simulado y SQLite aislado, incluidas las regresiones de carrito, checkout y consulta del comprador.
- 17 pruebas frontend: 9 de checkout, 4 de servicio de carrito y 4 del nuevo panel.
- Comprobación TypeScript del código `src` con configuración local estricta y dependencias de validación. Debes ejecutar el `npm run typecheck` del proyecto en Docker.
- `makemigrations shipping --check --dry-run`: sin cambios pendientes.

El historial completo de migraciones exige PostgreSQL (`core.0023` lo comprueba explícitamente), por lo que no pudo ejecutarse sobre SQLite. Las pruebas locales crearon el esquema directamente; la aplicación real de la migración y el comportamiento de bloqueos concurrentes deben validarse con PostgreSQL en tu entorno. No se ha hecho prueba visual en tu navegador ni prueba de contrato con una cuenta Blue real.

## Commit

Después de validar en Docker y revisar `git diff --stat`, agrega solo los archivos de este paquete y las dos variables nuevas de `.env.example`. No agregues `.env`, exports repomix ni carpetas de preview generadas.

Título propuesto:

`feat(SCRUM-519): integra emision etiquetas y seguimiento Blue Express`
