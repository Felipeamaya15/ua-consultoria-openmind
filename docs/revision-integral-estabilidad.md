# Revisión integral de estabilidad — cierre de auditoría

Fecha: 7 de octubre de 2026, America/Santiago. Repositorio: `C:\Users\maria\Ecommerce\ua-consultoria-openmind`.
Rama: `chore/revision-integral-estabilidad`. Base revisada: `ddeaff5`, también punta local de `develop` al realizar la comparación.

## 1. Resumen ejecutivo

Se revisó el diff archivo por archivo y se conservaron correcciones funcionales, de contrato, seguridad, pruebas y TypeScript. Resultado final: **376 pruebas backend aprobadas, 0 failures, 0 errors, 0 skipped; 11/11 suites frontend aprobadas; TypeScript 0 diagnósticos; build aprobado; `git diff --check` limpio**.

El conjunto final contiene **48 archivos: 44 archivos previamente versionados modificados y 4 nuevos**. Los nuevos son `backend/apps/__init__.py`, `backend/apps/core/payments.py`, `backend/apps/core/test_stability.py` y este informe. El cálculo incluye documentación y tests; no corresponde a 48 módulos funcionales nuevos. Al retomar había 46 archivos, no aproximadamente 21.

Para hacer explícito el criterio de conteo se agrupan **35 observaciones corregidas**: 10 funcionales/de contrato (R01–R10), 8 de seguridad (R11–R18), 2 de infraestructura/actualización de pruebas (R19–R20) y los 15 diagnósticos TypeScript. Son unidades de revisión, no conteos de líneas o de vulnerabilidades independientes certificadas. Los riesgos pendientes de la sección 18 se informan separadamente.

Se preservaron los cambios recientes de checkout, autenticación, Linkify, PayPal, Webpay, entregas y transferencias. Se revisó su contexto en Git, en particular `153729d` (entregas), `ee2db79` (tipo CreatedOrder), `ddeaff5` (transferencias pendientes), `f1338a9` (notificaciones Linkify), `68daa5e` (catálogo Mongo) y el retorno de Webpay integrado en `495be54`. No se cambió de rama, no se hizo stage/commit/push/merge, ni se modificó la BD de uso local o su historial.

**Recomendación:** los cambios son aptos para un commit de auditoría tras la revisión manual solicitada. Eso no equivale a autorizar un despliegue ni a declarar operativos los cobros reales o la BD local: hay bloqueos documentados que deben resolverse por separado.

## 2. Bugs y contratos incorrectos encontrados

| ID | Clasificación principal | Problema comprobado |
| --- | --- | --- |
| R01 | A | `checkout.py` devolvía éxito dentro del bucle de stock; solo procesaba la primera línea, ignoraba el resultado falso de Mongo y no compensaba reservas confirmadas ante un fallo posterior. |
| R02 | A | Un segundo `setItems` en `refreshCart` sobrescribía la mezcla correcta del carrito persistido y la sesión Mongo, sustituyendo precio/stock cero por valores demo. |
| R03 | A | El alta de Producto desde Django Admin llamaba `repo.create(payload)` sin la tienda que exige el repositorio vigente. |
| R04 | A | PayPal sin configuración intentaba construir `error_response` sin el argumento obligatorio `codigo`. |
| R05 | A | La creación/edición de producto admitía variantes con esquemas de atributos diferentes, contradiciendo las reglas del servicio de variantes y las pruebas vigentes. |
| R06 | A | Consumidores de sesión solo consultaban `localStorage` aunque el login actual también guarda el token en `sessionStorage`. Afectaba productos, landing, checkout/pedidos y enlaces de confirmación. |
| R07 | A | Configuración de pagos aceptaba métodos no objeto, `enabled` no booleano y valores `None` convertidos a la cadena no vacía `None`. |
| R08 | B | El modelo generaba `Pedido.identificador`, pero la respuesta de creación no lo incluía; el tipo no contemplaba su posible nulidad. |
| R09 | A/B | Pedidos del administrador usaba una URL fija a `127.0.0.1`, suponía arrays/fechas/importes válidos y solo registraba errores en consola. |
| R10 | B | `orderService` entregaba `body.data` como pedido sin comprobar los campos que consume checkout. |
| R19 | D | `python manage.py test` descubría 0 pruebas al no existir `apps/__init__.py`; `test apps` sí encontraba la suite. |
| R20 | D | Tests conservaban imports, fixtures, rutas, argumentos y expectativas de contratos ya retirados por PR anteriores. |

Las observaciones de seguridad R11–R18 se detallan en las secciones 8, 10 y 11. Los errores preexistentes de migraciones, pagos externos y despliegue se separan en las secciones 14 y 18.

## 3. Correcciones conservadas y reducción del diff

Clasificación usada: **A** bug funcional; **B** contrato; **C** seguridad; **D** test obsoleto/infraestructura de pruebas; **E** TypeScript; **F** cambio innecesario. La tabla exhaustiva por archivo está en la sección 20.

Se redujo un cambio F: `storefront/services/productService.ts` había sido reemplazado por una reexportación del servicio administrativo. Para corregir sus dos diagnósticos bastaba apuntar el import de `Product` al archivo existente y usar `import.meta.env` tipado. Se restituyó selectivamente el resto de su comportamiento original, tras revisar `6f3d1ca`; no se eliminó el archivo ni su exportación. El servicio no tiene consumidores actuales en `frontend/src`; el editor usa el servicio de admin. No se incorporó una nueva dependencia entre estos módulos.

También se conservó el alta manual de pedidos en Django Admin; se añadió el control de tienda sin prohibir esa funcionalidad. No se reescribió la sincronización SQL/Mongo de SCRUM-294. Se corrigieron espacios finales y líneas vacías finales detectados por `git diff --check`.

## 4. Los 15 diagnósticos TypeScript

| Archivo | Cantidad | Corrección y motivo |
| --- | ---: | --- |
| `frontend/src/app/router/index.tsx` | 2 | Se retiraron imports sin uso de CheckoutSummaryPage y LinkifyConfigPage; sus módulos permanecen. |
| `frontend/src/features/admin/pages/Products.tsx` | 4 | Se retiró Select sin uso. Los otros 3 errores eran accesos a generalAttributes: `setField` ahora utiliza las claves/valores de `AdminProduct`, que es el estado real del editor. |
| `frontend/src/features/admin/pages/ThemeEditor.tsx` | 1 | Se retiró la desestructuración sin uso de updateTemplate. |
| `frontend/src/features/landing/components/LandingDetails.tsx` | 1 | Se retiró titleClass sin uso y la lectura que solo lo alimentaba. No se cambió el diseño. |
| `frontend/src/features/storefront/components/store/ProductCard.tsx` | 1 | Se retiró variantLabel sin uso. El selector y sus etiquetas actuales permanecen. |
| `frontend/src/features/storefront/pages/Checkout.tsx` | 4 | API_URL sin uso, paymentOptions local cuyo resultado no se consumía y dos bindings de un estado PayPal demo sin uso. La carga de medios desde backend y el inicio real de PayPal permanecen. |
| `frontend/src/features/storefront/services/productService.ts` | 2 | Import de Product desde `../../admin/data/mockAdminData`; desaparece también el any implícito de variant. Se retiró el `as any` preexistente de import.meta. |
| **Total** | **15** | **10 de símbolos sin uso y 5 de tipos/imports.** |

Se ejecutó el comando exacto `npx tsc --project tsconfig.app.json --noEmit --incremental false --pretty false`: salida vacía, código 0. El build también comprobó `tsconfig.node.json`.

La revisión de las líneas añadidas en `frontend/src` no encontró `any`, `@ts-ignore`, `@ts-expect-error` ni `eslint-disable` nuevos. Los casts a `Record<string, unknown>` siguen comprobaciones de objeto; `order as CreatedOrder` sigue una comprobación de todos los campos declarados, con rechazo de respuestas inválidas probado. No se resolvieron los 15 diagnósticos con casts. Quedan `any` preexistentes fuera de esos cambios; no se afirma haber eliminado todos los del proyecto.

Antes, `build` ejecutaba `tsc && vite build`. El `tsconfig.json` raíz tiene `files: []` y referencias: `tsc` sin `--build` no recorre esos proyectos, por lo que no comprobaba la aplicación. Ahora `typecheck` comprueba explícitamente app y node con `--noEmit --incremental false`; `build` lo invoca una vez y luego Vite. Son comandos npm/tsc y `&&`, compatibles con el shell de npm en Windows/Linux; la ejecución comprobada fue Windows. No hay nuevas dependencias ni cambios en package-lock. Ejecutar además el comando app aislado en esta auditoría satisface la validación explícita del usuario, no añade un paso duplicado al script habitual.

## 5. Contratos frontend/backend y endpoints

`Pedido` sigue siendo quien genera `identificador`. `CheckoutOrderAPIView.result` lo expone tanto al crear como al recuperar por clave. `CreatedOrder` admite string/null/ausencia por compatibilidad con respuestas antiguas. `orderService` valida identificadores numéricos, estado, importes decimales como strings y los campos opcionales. Checkout muestra `order.identificador || order.id_pedido`, ambos provenientes del backend, y lo transmite a confirmación y Webpay. OrderConfirmation lo recibe por estado/query; no genera otro identificador. La clave UUID de checkout identifica el intento, no sustituye el identificador del pedido.

`cart-checkout.cjs` usa un identificador diferente del ID numérico y comprueba que el servicio, la navegación y el inicio de Webpay lo conservan. También rechaza estado/ID/importe/identificador inválidos. Los tests backend comprueban igualdad con el modelo y estabilidad en reintentos.

| Endpoint actual | Método / consumidor | Contrato y control |
| --- | --- | --- |
| `/api/checkout/pedidos/` | POST / orderService | `exito/data`; contacto, items Mongo+SKU, clave UUID; precios calculados por servidor. |
| `/api/pedidos/registrar/` | POST / compatibilidad SCRUM-289 | Reutiliza checkout; transforma el contrato legado a items Mongo. |
| `/api/tienda/pedidos/` | GET / Orders admin | Conserva el **array sin envoltorio** de PedidoTiendaSerializer; solo propietario de la tienda resuelta. |
| `/api/mi-cuenta/pedidos/` y `/<id>/` | GET / authService | `exito/data`; comprador autenticado y sus pedidos. |
| `/api/pagos/configuracion/` | GET/PUT/PATCH / panel de pagos | JSON privado; propietario; formas y campos obligatorios validados. |
| `/api/pagos/activos/` | GET / checkout | Solo métodos utilizables; flags y datos bancarios manuales permitidos, sin credenciales gateway. |
| `/api/pagos/transferencias/pendientes/` | GET / PendingTransfers | `exito/data`; pedido Transferencia y pendiente, tienda del propietario. |
| `/api/entregas/configuracion/` | GET/PUT/PATCH / Shipping | Configuración privada por tienda. |
| `/api/entregas/alternativas/` | GET / shippingService | Alternativas públicas de la instalación, no selección libre de tienda. |
| `/api/pagos/linkify/notificacion/` | GET/POST / Linkify | Firma HMAC; id_pago/action; comportamiento reciente conservado. |
| `/api/pagos/linkify/webhook/` | POST / compatibilidad Linkify | Firma obligatoria; conserva referencia/status y admite delegación al formato moderno. |
| `/api/pagos/linkify/verificar/` | POST / propietario | Solo pedidos Linkify propios, estados permitidos. |
| `/api/pagos/paypal/iniciar/`, `/capturar/` | POST / servicio PayPal | Tienda resuelta por backend; lifecycle externo con pendientes de sección 18. |
| `/api/catalog/pagos/transbank/iniciar/`, `/confirmar/` | POST / servicio Webpay | Tienda validada antes de casos de uso; retorno SCRUM-307 conservado. |
| `/api/productos/<producto>/variantes/` y `/<sku>/` | GET/POST/PATCH/DELETE | Producto Mongo y SKU; lecturas públicas, escrituras del propietario, repositorio acotado a tienda. |

Se conservaron los nombres, las barras finales y las rutas recientes. No se activó un handler global de excepciones: algunos rechazos DRF existentes siguen usando `detail` en vez de `error.codigo`; se actualizaron tests que suponían un handler que no está configurado.

## 6. Checkout, stock e idempotencia

El `return success_response` antiguo estaba dentro del `for line in lines.values()`. Con dos variantes de stock inicial `[7, 8]` y cantidades `[2, 1]`, el resultado correcto es `[5, 7]`; el test antiguo esperaba 7 para la primera aun vendiendo dos. Se corrigió esa expectativa y se comprueban ambas variantes.

La respuesta se construye después de crear los snapshots y antes de reservar, para que un error de URL Linkify no ocurra después del descuento. Se procesan **todas** las líneas, se comprueba cada resultado de `decrease_stock`, se conserva el decremento SQL opcional de SCRUM-294 y se bloquea ese producto SQL al actualizarlo. Una respuesta de éxito se entrega tras finalizar el bucle.

`clave_checkout`, comprador, tienda y huella del payload conservan el control de idempotencia. La búsqueda del pedido previo ocurre antes de validar disponibilidad actual de pago/entrega: un reintento válido devuelve el mismo pedido aunque luego se deshabilite el método. No vuelve a crear items ni a descontar stock, y una clave con otros datos/comprador/tienda se rechaza. El bloqueo de Tienda existente se mantiene. Las líneas repetidas de un mismo producto/SKU se agregan antes de calcular/reservar.

Ante una excepción dentro del bucle se restituyen, en orden inverso, las reservas Mongo **confirmadas**. `restore_stock` exige tienda, producto, SKU y cantidad positiva; PostgreSQL revierte pedido/items/stock mediante la transacción existente. Se registran los fallos de compensación sin convertirlos en un éxito.

Pruebas: `test_repeated_confirmation_returns_same_order_even_after_stock_changes`, `test_retry_survives_payment_disable_but_new_order_is_rejected`, `test_later_stock_failure_restores_prior_reservation_and_rolls_back_order`, `test_sql_stock_failure_restores_mongo_stock_and_rolls_back_order` y los casos de clave incompatible, cantidades inválidas, snapshots y pedido invitado en `test_checkout.py`. Los tests de inventario comprueban descuento concurrente y límites por SKU; el frontend comprueba doble clic y reintento con la misma clave.

**Límite real:** Mongo y PostgreSQL no comparten una transacción distribuida. La compensación cubre los errores capturados durante el bucle, no una muerte del proceso, un decremento Mongo aplicado cuya respuesta se pierda, un fallo al restituir ni un fallo del commit SQL al salir del bloque. No se promete rollback absoluto entre ambas bases. Tampoco se garantiza idempotencia de cobros externos solo por la idempotencia del pedido; véase sección 18. No se añadió outbox, coordinador ni arquitectura nueva.

## 7. Regresión de refreshCart

El primer bloque ya convertía la respuesta persistida usando `??`, y mezclaba las variantes Mongo de sesión que todavía no tenían item SQL. El segundo bloque volvía a ejecutar `setItems(itemsList.map(...))` o `setItems([])` y anulaba esa mezcla.

Además, usaba `precio || 14990`, `stock || 25`, una foto demo y otros defaults: el cero se interpretaba como dato ausente. Se retiró exclusivamente ese bloque duplicado. Se mantuvieron la sincronización y las operaciones vigentes del carrito.

`frontend/tests/cart-checkout.cjs` demuestra que quedan **3 items** (1 persistido y 2 variantes de sesión), que el item persistido conserva **precio 0, stock 0 e imagen vacía**, y que actualizar/eliminar variantes mantiene totales independientes. La expectativa antigua de no enviar ObjectId al backend era obsoleta: el contrato de carrito actual acepta identificadores Mongo completos. Ahora se comprueba que se transmiten completos, sin `parseInt`; no se convirtió ningún ObjectId en ID SQL.

## 8. Linkify y motivo de seguridad

**R11 — webhook viejo:** `/api/pagos/linkify/webhook/` era AllowAny y aceptaba `reference`/`buy_order` con estado `PAID`, `VERIFIED` o `COMPLETED`. Buscaba el identificador del pedido y asignaba `pagado` sin verificar firma, método o estado previo. Conocer un identificador permitía intentar pagar un pedido ajeno, manual o cancelado mediante un POST sin credenciales.

Ese endpoint ahora reutiliza la firma y las transiciones de `LinkifyNotificacionView`, integrado recientemente para `/notificacion/`. Conserva el payload antiguo firmado y delega el formato id_pago/action al handler moderno. Se verifica `X-Linkify-Confirmation` con HMAC-SHA256 del **cuerpo original**, utilizando las credenciales de la tienda del pedido. Sin firma válida devuelve 401; sin configuración devuelve 409; no cambia el estado. No se inventó ningún secreto ni se tocó `.env`.

**Compatibilidad:** el formato referencia/status firmado sigue funcionando y es idempotente. Los emisores que dependían del webhook viejo **sin firma dejan de ser aceptados intencionalmente**; deben configurar su firma. No se certificó el formato remoto con el proveedor: el TODO existente sobre campos exactos y firma GET permanece. Para cerrar pagos en curso no se exige enabled=true en la recepción, pero sí credenciales y firma válidas. Esa decisión del PR reciente se conservó.

**R12 — handler moderno:** antes se comparaba `int(Decimal(monto))` con `int(total)`, admitiendo diferencias fraccionales por truncamiento. Ahora compara Decimal finito/no negativo exacto; NaN/Infinity se rechazan. La cancelación también comprueba método Linkify. Los cuerpos no objeto y JSON inválido reciben 400 controlado. Si el proveedor omite monto en notification se conserva la aceptación firmada actual; no se inventó un campo obligatorio sin confirmar su protocolo. GET sigue exponiendo monto entero según el contrato preexistente, pendiente de confirmar precisión CLP con el proveedor.

**R13 — verificación manual Linkify:** se exige propietario y pedido de su tienda, método Linkify y estado permitido; se revalida/bloquea el pedido antes de cambiar pendiente→pagado. No sirve para confirmar transferencia bancaria manual. Se corrigieron respuestas sin código obligatorio y no se filtra el detalle de excepciones en ese error.

Pruebas: suite existente `test_linkify_notificacion.py`, `test_linkify_errores.py`, `test_linkify_configuracion.py` y regresiones de `test_stability.py`: firma ausente, referencia antigua firmada dos veces, método distinto/cancelado, importes fraccionales/no finitos, cuerpo inválido y bloqueo de verificación sobre transferencia manual.

## 9. Pruebas obsoletas: actualización y cobertura retenida

| Test anterior | Supuesto retirado | Contrato actual / cambio justificado |
| --- | --- | --- |
| MongoStockAlternateRepositoryTests / MongoTenantAlternateRepositoryTests | Alias `apps.catalog.application.infrastructure.repositories` existente. | El alias fue retirado por el port a Mongo. Se eliminan solo las clases duplicadas; permanecen los mismos **9 casos de stock y 10 de tenant** en el repositorio canónico. |
| `core/test_stock.py`: altas/ediciones HTTP de variantes | IDs de VarianteProducto SQL en las rutas. | Se trasladan ambos casos a `test_tenant_sql.py` con colección Mongo aislada, producto Mongo y SKU. Se conservan cero/positivo, rechazo negativo y ausencia de modificación parcial; se añaden bool/float/string inválidos. |
| `core/test_stock.py`: compra fallida | Ruta `/api/compras/` e id_variante SQL. | Ruta retirada por `68daa5e`. Rollback/ausencia de pedido quedan cubiertos con la ruta real de checkout en `test_checkout.py`, incluyendo fallo posterior de Mongo y fallo SQL. Se conservan los **4 tests de restricciones de modelos SQL** de ese archivo. |
| `core/test_tenant_sql.py` | Catálogo HTTP SQL y comprador Usuario legado. | Se conservan los casos de lectura pública, propietario, sesión Django, cliente/visitante/inactivo, manipulación de tienda, instalación ambigua y lectura/escritura ajena. Se usa auth.User y Mongo real con enlace SQL opcional. Compra verifica ambos stocks y snapshots. El antiguo mock de validación de compra SQL se sustituye por rechazo de compra directa de SKU ajeno y las pruebas reales de rollback citadas arriba. |
| `core/test_tenant.py` | VarianteProductoAdmin/alias retirados; handler global de errores supuesto; firma antigua de listado. | Se prueba PedidoAdmin vigente y el repositorio canónico; `detail.code` refleja el handler realmente configurado; `atributos={}` refleja el filtro vigente. Se conserva rechazo/aislamiento; no se reinstalan APIs antiguas. |
| `core/tests.py`: TiendaPropietarioMigrationTests | Nodo inexistente core.0003 y restauración parcial del grafo. | Punto inicial core.0001, objetivo core.0004 y restauración de todas las hojas. Permanecen los **5 tests** de conciliación/reversión de propietarios. Excepción de rollback histórico explicada debajo. |
| `visual_config/tests.py` | FK propietario al Usuario legado. | Fixture auth.User según core.0004; siguen los **9 tests** de modelo. |
| `visual_config/test_plantilla_seleccionada.py` | Visitante respondía 403. | TokenAuthentication es el primer autenticador: respuesta vigente 401; permisos siguen bloqueando. |
| Tests checkout/entrega/Linkify/transferencias | Una transferencia habilitada sin sus datos obligatorios bastaba. | Fixtures explícitamente completas; otros gateways tienen sus configuraciones dedicadas válidas. No se debilita el rechazo del backend para que pasen los tests. |
| Tests frontend | React/auth/storage y hooks anteriores a PR recientes; etiqueta exacta XL sin Agotado. | Mocks adaptados a APIs/hook order actuales, sessionStorage disponible y etiqueta vigente. Se mantienen assertions de no acceso, errores visibles, SKU agotado deshabilitado, selección, stock, doble envío y contratos. |

**Excepción acotada de migraciones en tests:** authentication.0002 crea configuracion_autenticacion solo si no existe; su reverse borra la tabla si existe, aunque la creó 0001. Al revertir ambas puede producir doble DROP. En la base temporal del test de propietarios se sustituye **en memoria**, mediante patch del reverse_code de esa operación, por RunPython.noop para que 0001 sea quien retire la tabla y se pueda aislar core.0004. No se editó ninguna migración guardada ni se aplicó ese patch a la BD local. Estos tests validan conciliación de propietarios, **no prueban que todo el historial tenga reversión segura**. El riesgo histórico queda abierto.

Las regresiones nuevas de `test_stability.py` tienen objetivos distintos de las suites modernas Linkify: el endpoint legado, bordes de importe/cuerpo, permisos HTTP privados, disponibilidad sin secretos y firma del alta admin. El repositorio admin se mockea porque lo que se comprueba allí es su contrato de llamada; los tests de checkout/tenant/inventario sí usan Mongo aislado real. No hay skips nuevos ni llamadas de pago reales.

## 10. Tenant y aislamiento

Se conserva el modelo de **una tienda por instalación**. `resolver_tienda` rechaza una instalación vacía/ambigua y no acepta que query/body/header seleccione libremente otra tienda. Las operaciones privadas exigen el propietario activo; no se añadió un bypass para superusuarios en productos/pedidos.

| ID / superficie | Control revisado |
| --- | --- |
| R14 — variantes HTTP | VariantTenantMixin resuelve la tienda tras permisos, enlaza VariantService a ella y valida stock/cantidad antes de conversiones int. Las consultas/altas/cambios/bajas/descuentos HTTP usan esa tienda; el fallback legado sin tenant no se usa en ese flujo. Se preservan firmas de servicio para callers no HTTP existentes. |
| R15 — PayPal y Transbank | Se valida/resuelve la instalación antes de iniciar/capturar/confirmar, bloqueando tienda manipulada antes del adaptador. No se sustituyeron los casos de uso de pago. |
| R16 — Django Admin Pedido/Producto | Querysets/FK de Pedido se filtran por tienda administrada. save_model comprueba pertenencia de pedido/producto. Se conserva alta admin y sincronización SCRUM-294. |
| R17 — pedidos del propietario | `/api/tienda/pedidos/` resuelve tienda y exige propietario, conservando array. No devuelve vacío silencioso a cualquier autenticado ni ignora una instalación ambigua. |
| Pagos/entregas privadas | Resolución de tienda/propietario antes de leer/escribir; se mantienen los controles de configuraciones dedicadas Transbank/PayPal/MercadoPago. |
| Transferencias pendientes | Consulta de pedidos de la tienda del propietario, filtrando método y estado. Visitante/cliente rechazados; no se agrega una tabla paralela. |
| Catálogo público | Solo instalación resuelta y documentos con tienda canónica. Las lecturas públicas actuales permanecen públicas; no se ampliaron permisos. |

Respaldo: `test_tenant.py`, `test_tenant_sql.py`, `catalog/test_tenant.py`, `test_delivery.py`, `test_pending_transfers.py` y `StabilityHTTPTests`. La matriz nueva consulta nueve endpoints privados como visitante/cliente; gateways rechazan tienda ajena; pedidos/admin/variantes comprueban pertenencia. Es evidencia de estos contratos, no una certificación general de seguridad.

## 11. Pagos: disponibilidad y estado real

**R18:** la API pública tenía una primera rama que anunciaba Linkify por enabled y una segunda rama con comprobación de credenciales que no podía deshacer lo ya anunciado. El checkout solo comprobaba disponibilidad de Linkify. `payment_methods_for_store` concentra la disponibilidad pública y el control de nuevas órdenes para que no diverjan.

| Método | Fuente / mínimo necesario | Exposición pública / estado |
| --- | --- | --- |
| Transbank | ConfiguracionTransbank activo, api_key y codigo_comercio no vacíos. | Solo enabled. Inicio/retorno existente conservado; no validación real de credenciales contra proveedor. |
| PayPal | ConfiguracionPayPal activo, client_id/client_secret no vacíos. | Solo enabled. Falta config devuelve 400 PAYPAL_NO_CONFIGURADO. Riesgos lifecycle/moneda en sección 18. |
| MercadoPago | ConfiguracionMercadoPago activo, public_key/access_token no vacíos. | Solo enabled. Existe configuración/puerto; no se implementó aquí un checkout/captura completo. |
| Linkify | JSON linkify, enabled booleano true, fields objeto, idCuenta/clavePrivada strings no vacíos. | Solo enabled; URL de pago del pedido y avisos firmados existentes. |
| Transferencia manual | JSON transfer, enabled true y seis campos bancarios requeridos. | Solo bank_name, account_type, account_number, holder_rut, holder_name, confirmation_email. Se excluye cualquier otro campo del JSON. |

Las configuraciones JSON no reemplazan las tablas dedicadas de gateways. “Disponible” significa configuración mínima local, no credenciales verificadas ni integración remota certificada. Los métodos incompletos/deshabilitados no se ofrecen y no pueden crear nuevas órdenes mediante checkout. Un reintento del pedido ya creado sigue siendo válido. Linkify y Transferencia manual conservan claves, estados y flujos separados.

Las pruebas comprueban los cinco métodos deshabilitados, rechazo sin stock/pedido, continuidad de reintento, omisión de Linkify/Transbank/PayPal/MercadoPago incompletos y allowlist de la transferencia sin secretos.

## 12. Entregas

Se revisaron ConfiguracionEntrega, delivery.py, Shipping.tsx, shippingService.ts y checkout. Se mantienen defaults, GET privado/público, PUT/PATCH, dirección/horario de retiro, actualización parcial y rechazo backend del método deshabilitado. No se rehízo el módulo de `153729d`.

Las pruebas de entrega se mantienen; solo se completó la configuración de transferencia usada en sus fixtures porque ahora checkout verifica el pago. El costo existente de checkout sigue siendo 0 para retiro o subtotal mayor a 50000 y 3490 en el resto; no es una tarifa cotizada de transportista. La habilitación comercial y la futura cotización/tracking son responsabilidades diferentes.

## 13. Transferencias pendientes

Se preserva `ddeaff5`: **Pedido es la fuente de verdad**. El listado toma medio_pago Transferencia y estado pendiente, por tienda y propietario. No incluye Linkify, PayPal, MercadoPago ni Transbank. No se añadieron tabla, flujo de confirmación, permisos públicos ni estados alternativos.

Los tests existentes conservan listado, filtros, permisos, persistencia, idempotencia y stock. Las únicas adaptaciones de fixtures completan datos bancarios y habilitan las configuraciones dedicadas para demostrar que otros métodos nunca aparecen como transferencia pendiente. PendingTransfers.tsx y pendingTransfersService.ts permanecen sin cambios.

## 14. PostgreSQL y migraciones: diagnóstico, sin reparación

Evidencia recogida en la inspección previa, sin repetir consultas de information_schema ni intentar reparar durante el cierre:

- `manage.py check`: sin problemas.
- `makemigrations --check --dry-run`: **No changes detected**. Esto compara modelos/historial, no garantiza que la tabla local coincida físicamente.
- MigrationLoader: historial consistente según dependencias y `detect_conflicts() == {}`. Una hoja core.0018 y otra authentication.0003; sin conflicto de hojas, no equivale a esquema local correcto.
- `authentication.0003_configuracion_pagos` pendiente. La tabla física **configuracion_pagos existe** con id bigint, transbank/paypal/mercadopago/linkify/transfer booleanos, fecha_actualizacion timestamptz y tienda_id bigint, campos observados como NOT NULL. La migración espera `metodos` JSON, fecha y relación a tienda. No se leyeron ni exportaron sus datos/credenciales.

Pendientes core observados:

```text
0006_configuracionpago_varianteproducto_and_more
0012_merge_20261003_1621
0013_remove_pedido_chk_pedido_tiene_comprador_and_more
0014_itempedido_atributos
0015_itemcarrito_sku
0016_pedido_identificador
0016_cifrar_credenciales_pago
0017_merge_20261004_0731
0018_configuracionentrega
```

Ya figuraban aplicados core.0001/.0004/.0005, las ramas de configuraciones Transbank/PayPal/MercadoPago y comprador, core.0009_merge_payments_customer_orders, core.0010_configuracionpago_varianteproducto y core.0011_checkout_order_snapshots. Authentication.0001/.0002 estaban aplicadas; landing.0001–0003 y visual_config.0001–0002 también.

Los prefijos repetidos 0006 y 0016 son nombres de ramas distintas, no el mismo nodo duplicado. Core.0010 usó SeparateDatabaseAndState para añadir estado de modelos; la rama larga 0006 contiene operaciones físicas relacionadas. 0012 es una convergencia histórica; 0017 reúne identificador/cifrado y 0018 añade entregas. La secuencia de merges se debe revisar por su contenido, no renumerar por estética. Además existe el reverse inseguro de authentication.0002 descrito en sección 9.

**Consecuencia:** un migrate directo sobre la BD local puede fallar al crear una tabla ya existente o en otras divergencias físicas. Los 376 tests usan PostgreSQL temporal limpio; no demuestran que las rutas funcionen sobre la BD local pendiente. `check` tampoco consulta todas las tablas.

Estrategia posterior, no ejecutada: respaldar PostgreSQL y claves, verificar restauración en una copia, inventariar tablas/constraints/relaciones frente al estado de migraciones, diseñar conversión explícita de booleanos a metodos JSON conservando PK/FK/fechas/filas, y ensayar una reconciliación revisada del estado y la base antes de cualquier operación real. No decidir un fake o CreateModel contra tabla existente sin esa comprobación. Las otras migraciones pendientes deben verificarse en esa copia. No se creó una migración que esconda el problema.

Una consulta adicional de metadatos en la sesión anterior no se ejecutó: falló la revisión automática por límite de uso, no por una determinación de que fuera insegura. No se intentó eludirla ni repetirla; la evidencia disponible era suficiente.

## 15. Comparación de SCRUM-EnviosLogistica

Solo se inspeccionó `origin/feature/SCRUM-EnviosLogistica`; no hubo fetch/merge/cherry-pick ni cambios en referencias. Comparación contra `develop` local en la instantánea disponible, base común `be292d27f4e48d47814d2a9b615f449e72c8f78e`.

Commits exclusivos:

```text
ede5736 Implementa servicio y endpoint de seguimiento logístico
89ec371 Implementa cotización de envíos con reglas comerciales
8a0035c Define puerto de integración logística y endpoint de cotización
```

`git diff --stat develop..origin/feature/SCRUM-EnviosLogistica`: **58 archivos, +944/-2441**. Esa resta entre puntas incluye funcionalidad que develop recibió después de divergir; **no significa que un merge deba borrar** Linkify, entregas, transferencias, checkout ni las imágenes intencionales.

`git diff --name-only develop...origin/feature/SCRUM-EnviosLogistica` muestra **24 archivos realmente aportados por la rama**: README, 20 archivos en backend/apps/shipping, backend/config/settings.py, backend/config/urls.py y frontend/package-lock.json. La intersección entre los archivos cambiados por develop y por la rama desde la base común es **vacía** en esta instantánea: no se identificó un conflicto textual por mismo archivo. No se hizo un ensayo de merge, por lo que no se promete ausencia absoluta de conflictos futuros.

Puntos de integración semántica posteriores: separar habilitación de entregas de cotización/tracking, conectar el costo del pedido con una cotización validada, evitar rutas duplicadas, revisar registro de apps/settings/URLs y mantener tenant/errores/idempotencia. El lockfile remoto solo añade siete marcas peer; no cambia versiones/dependencias en ese diff. No se copió ese ruido al lockfile actual. El archivo shipping/tests.py contiene el scaffold, no una suite suficiente de cotización/tracking; habrá que probar esa integración antes de usarla.

## 16. Pruebas ejecutadas y reproducción

Desde la raíz del repositorio:

```powershell
docker compose exec -T backend python manage.py check
docker compose exec -T backend python manage.py test
git diff --check
git status
git diff --stat
git diff
```

Desde `frontend`:

```powershell
npx tsc --project tsconfig.app.json --noEmit --incremental false --pretty false
$failedChecks = @()
$testFiles = @(Get-ChildItem tests -Filter '*.cjs')
foreach ($testFile in $testFiles) {
    node $testFile.FullName
    if ($LASTEXITCODE -ne 0) { $failedChecks += $testFile.Name }
}
if ($failedChecks.Count -gt 0) { exit 1 }
npm run build
```

El `exit` de este ejemplo pertenece al runner de validación, no a los scripts de producto. No existe un script npm test central en este package.json. Las suites son account-navigation, cart-checkout, customer-orders, entrepreneur-profile, landing-content, landing-editor, product-creation, product-editing, profile, stock-feedback y storefront-variants (archivos .cjs).

Las pruebas backend usan base PostgreSQL temporal del runner y colecciones Mongo aisladas con nombres únicos/limpieza. Se hicieron pruebas focalizadas primero; los cobros externos no se ejecutaron. La suite final incluye auth, catálogo, core, landing y visual_config.

## 17. Resultados exactos y control de archivos

| Validación | Resultado |
| --- | --- |
| Backend inicial `test apps --noinput --verbosity 1` | 366 pruebas; failures=16, errors=38; 36.006 s. Es diagnóstico inicial, no estado final. |
| Suites recientes focalizadas | 126/126; 3.890 s. |
| Tenant/conciliación de propietarios focalizados | 48/48; 19.225 s. |
| Suite completa intermedia `test apps` | 371/371; 46.709 s. |
| Primer comando exacto `test` al retomar | 0 descubiertas por ausencia de apps/__init__.py; no se informó como validación válida. |
| `test` después de corregir descubrimiento | 374/374; 49.375 s. |
| **Suite backend final `python manage.py test`** | **376/376; failures=0, errors=0, skipped=0; 49.714 s; exit 0; base temporal destruida al terminar.** |
| Django check final | 0 issues, 0 silenced; exit 0. |
| Frontend inicial | 5 suites aprobadas, 6 fallidas. |
| **Frontend final** | **11/11 suites, 0 fallidas, exit 0**. Son scripts con asserts; el runner no informa un conteo de casos individuales. |
| **TypeScript app estricto** | **0 diagnósticos, exit 0**. |
| **Build final** | **Aprobado**, typecheck app+node y Vite; 145 módulos. Advertencia no bloqueante de bundle >500 kB. |
| `git diff --check` final | Sin salida, exit 0. |
| Git final | Rama conservada; 44 archivos modificados, 4 nuevos, nada staged. |

Los tres tests posteriores a 371 cubren permisos de endpoints privados, omisión pública de métodos incompletos/secretos y JSON malformado; las dos pruebas HTTP de stock conservadas llevan el total a 376. Los subtests no se cuentan como métodos adicionales.

Build: index.html 0.40 kB; CSS 91.35 kB (gzip 16.31); JS 659.17 kB (gzip 179.35). Los logs de comprobación permanecen en TEMP, fuera del repositorio: ecommerce-audit-close-backend.log y ecommerce-audit-close-build.log. No se añadieron logs ni resultados generados al diff.

Se revisaron tanto el diff versionado como el contenido de archivos nuevos, porque `git diff`/`--stat` por sí solos no muestran los untracked. No aparecen `.env`, node_modules, dist, build, cache, bases locales, archivos temporales o credenciales reales entre los archivos cambiados. Vite generó dist local ignorado, como es normal al construir. Los valores añadidos a fixtures son ejemplos QA, no credenciales del usuario. La portada `backend/landing/images/imagen_principal.png` se preservó sin cambios.

## 18. Riesgos restantes y límites de la validación

1. **BD local divergente/pending migrations:** bloqueo de ejecución confiable sobre datos locales y de despliegue hasta reconciliar en una copia con respaldo. No corregido por decisión explícita.
2. **Atomicidad entre bases:** compensación de stock acotada a excepciones capturadas, sin garantía distribuida ante caída/commit/ack perdido. El alta/edición admin SQL/Mongo también mantiene su consistencia best effort preexistente.
3. **PayPal:** el inicio confía en monto/referencia recibidos del cliente y usa USD con importes de una tienda que muestra CLP. La captura devuelve resultado remoto, sin vinculación persistida/cierre completo de Pedido; la confirmación frontend actual no completa ese ciclo. Hay que definir moneda y conciliar orden, monto y captura antes de considerarlo listo para cobros reales. No se cambió ese flujo aquí.
4. **Transbank y reintentos de gateway:** se conserva validación del retorno aprobado contra pedido/importe de SCRUM-307, pero el inicio sigue aceptando datos del cliente y no persiste una transacción idempotente de inicio. Reintentar un pedido no garantiza reutilizar la misma sesión externa. No se probó sandbox ni producción.
5. **MercadoPago:** configuración/puerto no equivalen a checkout/captura completos. Se conserva el comportamiento existente; no usar su mera disponibilidad local como prueba de cobro operativo.
6. **Linkify remoto:** falta confirmar con proveedor nombres/cuerpo firmado GET, precisión y notificación sin monto. Avisos viejos sin firma deben migrar a firma. Las pruebas usan el contrato local, no un proveedor real.
7. **Claves/configuración:** Docker informa PAYMENT_CREDENTIALS_KEY ausente; los campos cifrados existentes recurren a la derivación desde SECRET_KEY. Cambiar/perder claves puede impedir descifrar datos; se necesita una clave estable respaldada y estrategia de rotación. Credenciales Linkify del JSON siguen sin cifrado de campo; la API privada las entrega al propietario por contrato actual. No se añadieron secretos ni se alteró su almacenamiento.
8. **Historial y endpoints legados:** reverse de authentication.0002 inseguro; tests de propietarios lo aíslan, no lo corrigen. La compra directa de variantes pública preexistente puede descontar inventario sin Pedido/clave idempotente: se acotó a tienda/producto, pero debe decidirse su restricción/retiro antes de producción. El servicio storefront de alta de producto sin consumidores conserva su implementación antigua tras reducir el diff.
9. **Entorno/QA pendiente:** defaults de desarrollo (DEBUG/hosts/secretos de ejemplo) requieren configuración de despliegue propia; warning de bundle permanece. No se certificó navegador E2E contra la BD local divergente ni servicios de pago/logística reales. No se modificó seguridad de despliegue ni se optimizó el bundle por estar fuera del cierre.

Estos riesgos impiden afirmar “todo correcto” o autorizar producción. Ningún resultado verde de tests sustituye la reconciliación de la BD ni la validación de integración financiera.

## 19. Cambios deliberadamente no realizados

No se implementaron funcionalidades nuevas, rediseño, refactorización masiva, nuevos modelos de pagos/transferencias, monedas/conversión, arquitectura distribuida, cotización/tracking ni integración EnviosLogistica. No se alteraron adapters externos correctos, rutas públicas para ampliarlas, estados del pedido, snapshots de entregas ni sincronización administrativa reciente.

No se ejecutó migrate contra la BD local, DROP, fake, borrado de volúmenes, reparación de tablas, edición de migraciones históricas ni creación de migraciones para ocultar divergencias. Las migraciones que ejecuta el runner pertenecen exclusivamente a su base temporal.

No se modificaron `.env`, claves, imágenes intencionales, package-lock ni dependencias. No hubo git add, commit, push, reset, restore de archivos completos, rebase, cambio de rama, merge ni cherry-pick. El diff queda disponible para revisión manual. Se recomienda commit tras esa revisión; merge/despliegue requieren distinguir los cambios validados de los riesgos anteriores y coordinar la reconciliación por separado.

## 20. Inventario exacto y tabla de justificación por archivo

Cada fila corresponde a un archivo cambiado/nuevo respecto al estado inicial. Las rutas son relativas a la raíz indicada al inicio. A/B/C/D/E corresponden a sección 3; no se conserva ningún cambio F identificado. “TSC” es el chequeo real de la sección 16, no un test funcional inventado.

| Archivo | Clase / problema | Corrección | Justificación | Prueba / verificación |
| --- | --- | --- | --- | --- |
| `backend/apps/__init__.py` (nuevo) | D: test sin labels encontraba 0 | Marca paquete apps | Evitar éxito vacío del comando solicitado | manage.py test descubre 376 |
| `backend/apps/catalog/application/services.py` | C: firmas antiguas sin tenant en HTTP | Tenant ligado a VariantService y operaciones Mongo | Aislar variantes sin retirar compatibilidad no HTTP | test_tenant_sql; catalog/test_tenant |
| `backend/apps/catalog/infrastructure/repositories.py` | A: faltaba restitución de reserva Mongo | restore_stock por tienda/producto/SKU | Compensar fallos capturados del checkout | test_later_stock_failure; test_sql_stock_failure |
| `backend/apps/catalog/presentation/serializers.py` | A: atributos heterogéneos | Valida mismas claves por variante | Coherencia ya exigida por VariantService | test_creation; test_editing |
| `backend/apps/catalog/presentation/views.py` | C: variantes/gateways sin resolver instalación | Mixin tenant y validación previa de stock; resolver en Webpay | Reusar controles existentes | test_tenant_sql; test_gateway_http_rejects_foreign_store_before_external_call |
| `backend/apps/catalog/test_stock.py` | D: alias inexistente duplicado | Retira clase alternativa, conserva canónica | No reinstalar módulo retirado | 9 casos canónicos dentro de suite final |
| `backend/apps/catalog/test_tenant.py` | D: alias inexistente duplicado | Retira clase alternativa, conserva canónica | Mismo aislamiento comprobado una vez | 10 casos canónicos dentro de suite final |
| `backend/apps/core/admin.py` | A/C: alta rota y pedidos sin scope | Firma repo correcta; filtros/FK/save por tienda | Mantener SCRUM-294 y alta manual segura | test_tenant; test_django_admin_creation_preserves_sql_mongo_link_and_scoped_repository_signature |
| `backend/apps/core/payments.py` (nuevo) | C: disponibilidad divergente/incompleta | Helper compartido, credenciales mínimas y allowlist manual | Misma regla para API pública y checkout | test_public_payment_configuration_omits_secrets_and_incomplete_methods; test_all_disabled_payment_methods |
| `backend/apps/core/presentation/checkout.py` | A/B/C: primer ítem, reservas, identificador, método no disponible | Termina bucle, comprueba/compensa stock, expone identificador y valida método | Reintentos conservan pedido/snapshots | test_checkout; test_delivery; test_pending_transfers |
| `backend/apps/core/presentation/linkify_notificacion.py` | C: truncación, cancelación de otro método, cuerpo inválido | Decimal exacto, validación método/Mapping | Conservar handler firmado reciente | test_linkify_notificacion; test_stability |
| `backend/apps/core/presentation/serializers.py` | A: configuración malformed/null aceptada | Objeto/booleano/fields y strings obligatorios | Rechazo sin alterar configuración | test_payment_configuration_rejects_malformed_fields_and_null_credentials; test_linkify_configuracion |
| `backend/apps/core/presentation/views.py` | A/C: webhook viejo inseguro, tienda/gateways/listado y error PayPal | Reutiliza handler firmado; valida método/estado; resuelve tienda; error con código | No sustituir pagos/entregas recientes | test_stability; test_pending_transfers; test_delivery |
| `backend/apps/core/test_checkout.py` | A/B/D: expectativa incorrecta y cobertura faltante | Comprueba ambos stocks/identificador/rollback y fixtures reales | No dar verde con stock de segundo ítem ignorado | Suite checkout dentro de 376 |
| `backend/apps/core/test_delivery.py` | D: pago de fixture incompleto | Transferencia con datos requeridos | Mantener cobertura de entrega real | Suite delivery final |
| `backend/apps/core/test_linkify_errores.py` | D: transferencia de fixture incompleta | Configuración manual explícita | No confundir errores Linkify con pago inválido de fixture | Suite Linkify errores final |
| `backend/apps/core/test_pending_transfers.py` | D: métodos de fixture no habilitados | Transferencia completa; configuraciones gateway para otros métodos | Demostrar separación de métodos | Suite transferencias final |
| `backend/apps/core/test_stability.py` (nuevo) | C/A: faltaban regresiones de bordes auditados | 13 tests HTTP/admin | Cubre endpoint legado, permisos y configuración sin pagos reales | Suite final, sin skips |
| `backend/apps/core/test_stock.py` | D: HTTP de catálogo SQL retirado | Conserva restricciones SQL; mueve/regenera cobertura HTTP vigente | No mantener ruta inexistente | 4 tests SQL; casos movidos a test_tenant_sql y checkout |
| `backend/apps/core/test_tenant.py` | D/C: imports/admin/handler antiguos | PedidoAdmin vigente y contratos reales | Conservar aislamiento, no reinstalar aliases | Suite tenant final |
| `backend/apps/core/test_tenant_sql.py` | D/C: rutas y fixtures SQL obsoletos | Mongo aislado, auth.User, checkout actual; conserva tests HTTP stock | 13 casos HTTP con contratos vigentes | Suite final; stock SQL/Mongo y rechazo ajeno |
| `backend/apps/core/tests.py` | D: nodo inexistente y restauración incompleta | Punto real core.0001, restaura hojas; patch temporal reverse inseguro | Aislar conciliación sin editar historial | 5 tests TiendaPropietarioMigrationTests |
| `backend/apps/visual_config/test_plantilla_seleccionada.py` | D: 403 esperado con Token primero | Espera 401 de visitante | Contrato DRF vigente mantiene bloqueo | Suite plantilla seleccionada |
| `backend/apps/visual_config/tests.py` | D: propietario legado incompatible | Fixture auth.User | FK vigente, mismo modelo visual | 9 tests ConfiguracionVisualTests |
| `frontend/package.json` | E/D: build no comprobaba proyectos | typecheck app+node y build lo invoca | Comprobación real sin deps nuevas | npm run build; TSC |
| `frontend/src/app/router/index.tsx` | E: dos imports sin uso | Retira imports | Módulos/rutas vigentes conservados | TSC; account-navigation |
| `frontend/src/features/admin/pages/Orders.tsx` | A/B: URL fija y datos no comprobados | API_BASE_URL, token, tipo/guard y error visible | Array vigente y respuestas inválidas controladas | customer-orders.cjs incluye propietario, base, token y errores |
| `frontend/src/features/admin/pages/Products.tsx` | E/B: tipo de setter incorrecto | keyof AdminProduct; retira Select sin uso | generalAttributes pertenece al estado real | TSC; product-creation/product-editing |
| `frontend/src/features/admin/pages/ThemeEditor.tsx` | E: binding sin uso | Retira updateTemplate del destructuring | No cambia guardado de tema | TSC; build |
| `frontend/src/features/admin/services/productService.ts` | A: sesión no persistente ignorada | Fallback sessionStorage en 3 lecturas | Login vigente, mismas operaciones/payloads | product-creation prueba token solo sesión; product-editing |
| `frontend/src/features/landing/components/LandingDetails.tsx` | E: cálculo muerto | Retira titleClass/isVisual sin uso | Presentación vigente conservada | TSC; landing-content |
| `frontend/src/features/landing/services/landingService.ts` | A: sesión no persistente ignorada al guardar | Fallback sessionStorage | Consistencia con login vigente | TSC; landing-editor (sin caso aislado de sesión) |
| `frontend/src/features/storefront/components/store/ProductCard.tsx` | E: helper sin uso | Retira variantLabel muerto | Selector real permanece | TSC; storefront-variants |
| `frontend/src/features/storefront/context/CartContext.tsx` | A: sobrescritura duplicada | Retira segundo setItems | Conserva ceros y variantes sesión | cart-checkout: 3 items, precio/stock 0, totales |
| `frontend/src/features/storefront/pages/Checkout.tsx` | E: bindings/cálculo sin uso | Retira 4 diagnósticos de código muerto | Carga backend, PayPal, Linkify, Webpay y entregas intactos | TSC; cart-checkout |
| `frontend/src/features/storefront/pages/OrderConfirmation.tsx` | A: sesión no persistente ignorada | Reconoce ambos storages | Enlace de cuenta coherente con login | TSC/build; lectura de flujo, sin E2E nuevo |
| `frontend/src/features/storefront/pages/TransbankReturnResult.tsx` | A: sesión no persistente ignorada | Reconoce ambos storages | Conserva retorno SCRUM-307 | TSC/build; lectura de flujo, sin sandbox/E2E |
| `frontend/src/features/storefront/services/orderService.ts` | B/A: nulidad/forma del pedido/token | Tipo compatible, guard runtime y authService | No asumir objeto válido ni duplicar identificador | cart-checkout: contrato válido/varios inválidos |
| `frontend/src/features/storefront/services/productService.ts` | E: import roto/any implícito | Ruta real Product e import.meta tipado | Cambio mínimo; F reexportación retirado | TSC; sin consumidores funcionales actuales |
| `frontend/tests/cart-checkout.cjs` | D/B: mocks/hooks viejos y contrato Mongo/identificador | Adapta fixtures; assertions de ID backend, errores y carrito | Conserva doble clic, retry, stock y 4 plantillas | node tests/cart-checkout.cjs |
| `frontend/tests/customer-orders.cjs` | D/B: storage/missing regresiones admin | Mock storage; añade pedidos propietario/base/invalid data | Mantiene casos cliente y prueba cambio de Orders | node tests/customer-orders.cjs |
| `frontend/tests/entrepreneur-profile.cjs` | D: mocks/texto previos a login/perfil recientes | APIs/hooks/storage/texto actual | No tocar comportamiento del PR para adaptar al test | node tests/entrepreneur-profile.cjs |
| `frontend/tests/product-creation.cjs` | D/A: storage ausente en harness | Mock y caso real token solo sesión | Prueba fallback sin debilitar rechazo de visitante | node tests/product-creation.cjs |
| `frontend/tests/product-editing.cjs` | D: storage ausente en harness | sessionStorage mock | Mantiene revisión/conflictos/errores | node tests/product-editing.cjs |
| `frontend/tests/profile.cjs` | D: storage ausente en harness | sessionStorage mock | Mantiene contrato Token y guardado remoto | node tests/profile.cjs |
| `frontend/tests/stock-feedback.cjs` | D: hooks/storage previos | Mocks de useCallback/storages | Mantiene límites por SKU y avisos | node tests/stock-feedback.cjs |
| `frontend/tests/storefront-variants.cjs` | D: etiqueta vieja de agotado | Busca XL con etiqueta actual | Conserva assertion disabled y selección L | node tests/storefront-variants.cjs |
| `docs/revision-integral-estabilidad.md` (nuevo) | Documentación requerida | Diagnóstico, resultados, límites e inventario | Revisión manual informada antes de commit | Cotejo con Git, logs y diff completo |

## Auditoría final posterior a integración con develop

Fecha: 8 de octubre de 2026. Rama: `chore/revision-integral-estabilidad`. HEAD conservado: `fe412b1`; anterior: `551c19a`. Esta sección actualiza el diagnóstico y los recuentos históricos anteriores. No se realizó commit, push, cambio de rama, merge, rebase ni reset durante esta auditoría.

### Alcance y evidencia

Se revisaron landing, catálogo público, detalle/atributos/SKU Mongo, carrito, checkout multiítem, stock SQL/Mongo, contacto/destino, entregas/cotizaciones, pagos, confirmación, historial del comprador, seguimiento público, normalizadores logísticos, administración, autenticación, tenant y migraciones. Se cruzaron llamadas `fetch`/`fetchInitialLoad`, payloads, Token, métodos y rutas con los `urls.py` realmente incluidos en `config.urls`; se ejecutaron las suites completas existentes y regresiones nuevas.

Commits integrados revisados: `6aa9b0a`/PR93 (activación de entregas), `05af2b1`/PR89 (normalizadores de tarifas), `6e80cf4`/PR90 (seguimiento logístico), `0ce0666` (configuración de despacho), `febe967`/SCRUM-362 (estados logísticos), `e3c6122`/SCRUM-361 (respuesta logística), `511eef5` (Chilexpress), `f037fe2` (Starken), `5029682`/PR88 (regiones/cotización), `1ede2a2` (tarifas), `ddeaff5` (transferencias), `9868967` (regiones/comunas), `ee2db79` (identificador) y `153729d` (configuración de entrega). Se contrastaron con los arreglos integrados en `551c19a` y `fe412b1`.

Hubo navegación de lectura en el navegador local por landing y catálogo real. No se creó un pedido real ni se ejecutaron cobros, llamadas comerciales de transportistas o modificaciones manuales de la BD operativa. Las comprobaciones de checkout/pagos utilizan fixtures aisladas y adaptadores simulados donde corresponde: no equivalen a una compra sandbox del proveedor.

### Bugs demostrados y correcciones

| Hallazgo | Corrección y efecto |
| --- | --- |
| La suite completa descubría 414 tests pero abortaba creando `configuracion_pago` por segunda vez. También se duplicaba la creación de `variante_producto`. | Se convirtió únicamente la rama duplicada `0006_configuracionpago_varianteproducto` a operaciones de estado; la rama canónica conserva la creación física. Las pruebas completas ya construyen una BD desde cero. |
| CartContext enviaba ObjectId en `slug`, pero el backend solo buscaba slug; al refrescar devolvía slug/ID SQL y cambiaba la identidad. | La búsqueda acepta ID Mongo o slug dentro de la tienda actual. La respuesta conserva `producto_mongo_id` y `slug`; CartContext usa primero el ID Mongo y evita duplicar la misma variante al sincronizar. |
| Las operaciones de carrito con ID SQL y el historial de cliente no pasaban siempre por el resolver actual. | GET/POST/PATCH/DELETE de carrito resuelven tienda; los casos de uso filtran por producto/tienda además del comprador. Historial resuelve tienda y filtra pedidos actuales; los legados sin tienda conservan exclusivamente el vínculo explícito al comprador. |
| Webpay iniciaba el cobro usando el monto del navegador; la confirmación comparaba importes con `int()`. | El inicio exige pedido pendiente Transbank de la tienda actual e identificador + correo, toma `Pedido.monto_total` y exige CLP positivo entero. El checkout rechaza totales incompatibles antes de crear/reservar. La confirmación usa Decimal exacto, método/tienda/referencia/estado y bloqueo transaccional. |
| El inicio Webpay aceptaba un retorno arbitrario y ciertos errores devolvían detalles del transporte/proveedor. | El origen de retorno debe estar en `CORS_ALLOWED_ORIGINS`; los errores de inicio/conexión son públicos y genéricos. El correo se envía en el cuerpo, nunca en la URL. |
| Las rutas de compatibilidad `comprar/` y `compra/` podían descontar stock anónimamente sin Pedido. | Se conservan como operación privilegiada: requieren autenticación y propietario mediante `VariantTenantMixin`. Visitantes y clientes no pueden usarlas; la compra pública usa el checkout de pedidos. |
| PayPal enviaba el importe CLP como USD y capturaba IDs remotos sin vínculo/conciliación con Pedido. | Se bloqueó temporalmente el checkout PayPal y sus dos endpoints de cobro/captura, con respuesta controlada. Se conservaron configuración y adaptador. No se introdujo conversión monetaria. |
| MercadoPago llegaba al final genérico del checkout y mostraba confirmación sin iniciar cobro. | Se declara no disponible para compras. El frontend rechaza el método antes de crear el pedido y el backend exige `enabled is True` en vez de solo existencia de la clave. Se conservaron credenciales, administración y adaptador. |
| El login Google no exigía `email_verified`. | Solo acepta booleano `True` antes de buscar/crear una cuenta; añade timeout y errores de transporte/JSON controlados. |
| GET firmado de Linkify truncaba fracciones y aceptaba pedidos de otro método. | Mantiene entero para montos enteros y representa exactamente dos decimales cuando existen; verifica método Linkify y estado permitido después de la firma. La notificación POST y el webhook legado siguen conciliando firma/monto/estado. |
| Respuestas logísticas con eventos no objeto o estado no textual generaban errores de tipo. | Se rechazan con `ValueError` controlado; se conserva la separación entre estado logístico y comercial. |
| Seguimiento solo marcaba `no-store` en respuestas exitosas. | `finalize_response` aplica `no-store` también a errores y throttling. |
| Once serializers estaban declarados dos veces y las declaraciones finales sobrescribían las primeras. | Se retiraron únicamente las declaraciones eclipsadas y se conservaron las definiciones efectivas, incorporando los campos/validaciones anteriores. |

### Migración: explicación exacta

Archivo modificado: `backend/apps/core/migrations/0006_configuracionpago_varianteproducto.py`. No se modificó ninguna otra migración en esta auditoría.

Antes contenía dos `migrations.CreateModel(...)` como operaciones de base de datos: `ConfiguracionPago` y `VarianteProducto`. Ahora esos mismos `CreateModel` están dentro de `migrations.SeparateDatabaseAndState(state_operations=[...])`; `database_operations` queda vacío por defecto. Se mantienen campos, restricciones, nombre de migración y dependencia de `0005_producto_activo`.

La creación física ya pertenece a `0006_configuracionpago_varianteproducto_and_more`, dependiente de `0011_checkout_order_snapshots`. `0010_configuracionpago_varianteproducto` ya tenía conciliación solo de estado. La rama duplicada no debe repetir SQL ni eliminar tablas al revertirse.

El grafo conserva sus dos extremos y su unión existente:

```text
0005_producto_activo -> 0006_configuracionpago_varianteproducto (solo estado) ---+
                                                                           |
... -> 0010 (solo estado) -> 0011 -> 0006_*_and_more (SQL) -> ... -> 0018 ------+-> 0019_merge_20261008_1504
```

`0019` conserva exactamente sus dependencias de la nueva `0006` y de `0018_configuracionentrega`, y no tiene operaciones. Una instalación nueva que aplica el grafo completo crea las tablas una sola vez mediante la rama canónica: la construcción de las bases temporales y todos los tests finales comprueban este recorrido. No se certifica un despliegue que aplique exclusivamente una rama intermedia en lugar de la hoja final.

La corrección del código no necesita ejecutar SQL sobre la BD local. `showmigrations core` mostró `[X]` en la rama canónica hasta `0018`, pero `[ ]` en `0006_configuracionpago_varianteproducto` y `[ ]` en `0019_merge_20261008_1504`; ese estado se conserva. Por tanto, no se afirma que la BD operativa tenga aplicado `0019`. Su conciliación futura deberá hacerse como operación de despliegue autorizada, sin `--fake` ni borrado de datos. No se ejecutó `migrate` sobre la BD local.

Resultado final de `python manage.py makemigrations --check --dry-run`: **No changes detected**, exit 0.

### Estado de los flujos

- **Carrito autenticado:** conserva ObjectId + slug + SKU; precio efectivo y stock salen de la variante real; precio 0 y stock 0 conservan su valor; respuesta incluye atributos e imagen al consultar. El bridge SQL permanece para la FK del carrito, no sustituye al catálogo Mongo. Refresh usa la misma identidad y no duplica las variantes persistidas. El carrito invitado sigue siendo memoria de sesión React: no se añadió persistencia tras recarga completa.
- **Checkout/stock:** procesa todos los SKU, valida precios y stock de servidor, calcula total y envío, genera identificador backend, conserva clave/huella de idempotencia, bloquea tienda durante reserva y compensa Mongo ante fallos de reserva con rollback SQL. Los callbacks no descuentan nuevamente. Se verificó rechazo de Webpay con total cero/fraccionario antes de reservar.
- **Webpay:** monto del Pedido, pedido/método/tienda/correo/estado correctos, credenciales mínimas, retorno de origen permitido y conciliación Decimal. Una confirmación repetida no vuelve a cambiar estado ni crear pedidos. No se probó un cobro sandbox real.
- **PayPal/MercadoPago:** temporalmente indisponibles para comprar aun con credenciales completas. `/api/pagos/activos/` devuelve `enabled: false` y motivo cuando están configurados. Las configuraciones siguen guardándose y la pantalla administrativa explica la limitación. El checkout directo también los rechaza antes de tocar catálogo/stock. PayPal iniciar/capturar conserva rutas con 400 si no configurado y 409 si configurado pero indisponible.
- **Linkify:** firma HMAC, Decimal exacto, método y estado; webhook legado reutiliza handler seguro. No se hizo callback remoto desde el proveedor.
- **Transferencia:** `medio_pago == Transferencia`, `estado == pendiente`; Pedido es fuente de verdad. Panel de pendientes con auth/propietario y aislamiento de tienda.
- **Entregas/cotización:** Chilexpress/Starken/Retiro solo habilitados; región/comuna coherentes; referencia firmada con caducidad; revalidación de tarifa actual antes de reservar; cambio de destino/operador invalida cotización; respuestas tardías no sustituyen la actual. Retiro cuesta 0. Las tarifas son manuales configuradas y documentadas, sin API comercial ni tarifa demo de respaldo.
- **Seguimiento pedido:** confirmación -> Ver mi pedido -> consulta automática con identificador y correo disponibles, sin pedirlos de nuevo. Desde menú sigue la búsqueda manual. POST exige ambos, correo en cuerpo, tenant, 404 uniforme, 20/min y no-store; respuesta excluye dirección/teléfono/credenciales. Webpay conserva el comprobante de consulta en sessionStorage para el retorno.
- **Seguimiento logístico:** normalizadores SCRUM-361/362 preservados y reforzados. `En origen`, `En tránsito`, `En reparto` son estados del transportista; no se escriben en `Pedido.estado`. No existe aquí un flujo comercial de consulta periódica al transportista ni se inventó un número/evento logístico.
- **Productos/admin:** se conservan CRUD Mongo, revisión de edición, atributos/SKU, filtros, stock real y permisos. Orders, Products, Shipping, ThemeEditor y pagos mantienen sus contratos. Los localhost encontrados corresponden al fallback configurable `VITE_API_URL` de desarrollo. El antiguo PayPalConfigForm no tiene consumidores de ruta; no se presentó como pantalla funcional vigente.
- **Endpoints:** las llamadas conectadas de catálogo/atributos, carrito, checkout, historial cliente/admin, seguimiento, perfiles/auth, configuración visual/landing, entregas y pagos tienen rutas incluidas y métodos correspondientes. PayPal conserva sus rutas con bloqueo explícito; no se inventó un endpoint MercadoPago para aparentar integración.
- **Tenant/seguridad:** el cliente no elige tienda en los flujos revisados; el resolver contrasta identificadores admitidos y falla ante una instalación con múltiples tiendas. Carrito/historial incorporan ese resolver. Google exige correo verificado; callbacks validan credenciales/firma según pasarela. No se añadió `any`, `@ts-ignore`, `@ts-expect-error`, secreto o cambio a `.env`.

### Pruebas nuevas y recuentos

El total cambió de **414 a 435 tests Django: 21 regresiones nuevas**.

- `backend/apps/core/test_final_audit.py`: **17** tests nuevos. Incluyen monto Webpay manipulado; pedido/método/estado/correo y monto CLP inválidos; credenciales incompletas; retorno externo; confirmación con fracciones/NaN/Infinity/monto mal formado; método/tienda/referencia correctos; confirmación HTTP idempotente; PayPal/MP indisponibles y rechazo del checkout directo sin reserva; decremento de stock anónimo/cliente bloqueado; historial con selector de tienda ajena; GET Linkify firmado con fracción exacta/método; no-store también en errores; eventos/estado logístico mal formado; Google no verificado/timeout/usuario válido; errores Webpay sin datos sensibles.
- `backend/apps/catalog/test_cart.py`: **3** tests nuevos: ObjectId enviado como referencia y round trip de ID/slug/SKU/precio/stock/atributos/imagen; selector de tienda ajena rechazado en los cuatro verbos; ID SQL sin bypass del scope del caso de uso. El fake de repositorio ahora implementa lookup Mongo o SQL igual que el contrato real.
- `backend/apps/core/test_checkout.py`: **1** test nuevo: total CLP cero/fraccionario con Webpay rechazado antes de crear Pedido/ItemPedido o descontar stock.
- `backend/apps/core/test_pending_transfers.py`: se actualizó la expectativa vigente: Transbank crea pedido y no aparece como transferencia; PayPal/MP devuelven 400 sin nuevo pedido ni reserva. La prueba existente de exclusión del panel conserva los cinco métodos mediante fixtures directas.
- `backend/apps/core/test_tenant_sql.py`: el test existente del endpoint privilegiado se autentica como propietario para seguir verificando el rechazo de un SKU de otro producto; no se relajó el rechazo de visitantes/clientes.
- `frontend/tests/cart-checkout.cjs`: nuevas assertions para correo Webpay en cuerpo; rechazo de PayPal/MP antes de crear, vaciar carrito o navegar; refresh sin duplicados con ObjectId y preservación de ceros. Se mantiene la cobertura previa de reintentos, doble clic, cuatro plantillas y stock.

Resultados finales del cierre:

| Validación | Resultado |
| --- | --- |
| Suite backend completa, incluyendo regresiones | **435/435**, 0 fallos, 0 errores, 0 skips; ejecución final 54.640 s |
| Frontend completo, todos los `.cjs` | **13/13 archivos; 66/66 entradas del runner**, 0 fallos/skips |
| TypeScript app y node, strict/noEmit | **0 errores**, exit 0 |
| `npm run build` en contenedor frontend existente | **OK**, exit 0; 146 módulos |
| `python manage.py check` | **0 issues**, exit 0 |
| `python manage.py makemigrations --check --dry-run` | **No changes detected**, exit 0 |
| `git diff --check` | Sin errores |

Los 66 del runner frontend no representan 66 casos independientes homogéneos: `checkout-shipping.cjs` informa 54 entradas (incluye 4 grupos con subtests) y los otros 12 archivos son scripts de assertions que Node contabiliza como una entrada cada uno. No se infló el recuento por cada assertion.

La ejecución literal inicial de `docker compose exec -T backend python manage.py test` falló en setup por la tabla duplicada y no ejecutó los 414 tests. El cierre usa el mismo comando Django completo mediante `call_command('test')`, sin limitar etiquetas ni sustituir migraciones, con `TEST.NAME=test_audit_<uuid>` cambiado solo en memoria. Así evita reutilizar o borrar manualmente la BD de prueba parcial dejada por aquel setup. El runner crea y destruye exclusivamente sus BD temporales; las fixtures Mongo usan colecciones aisladas con cleanup. No se usó SQLite, `--fake`, desactivación de migraciones ni alteración del modelo para obtener verde.

Comando de cierre reproducible (equivalente a `manage.py test`, con nombre aislado):

```powershell
docker compose exec -T backend python -c "import os,uuid; os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings'); import django; django.setup(); from django.conf import settings; from django.db import connections; name='test_audit_'+uuid.uuid4().hex[:12]; settings.DATABASES['default'].setdefault('TEST',{})['NAME']=name; connections['default'].settings_dict['TEST']['NAME']=name; from django.core.management import call_command; call_command('test',verbosity=1)"
```

### Warnings, riesgos y recomendación

- Docker Compose advierte `PAYMENT_CREDENTIALS_KEY` ausente. El cifrado utiliza la derivación existente desde SECRET_KEY; no se alteraron claves ni credenciales. Antes de producción se requiere una clave gestionada y estable, con plan de rotación; cambiarla improvisadamente impediría descifrar datos existentes.
- Build: dos advertencias del optimizador CSS por selectores arbitrarios de color y bundle JS de **664.90 kB** (gzip **181.65 kB**), superior a 500 kB. No bloquean build; no se reescribió UI por preferencia.
- Los logs Linkify de firma/monto/estado rechazados son pruebas negativas esperadas. Git puede avisar conversión LF/CRLF en Windows; `diff --check` no detecta errores.
- PayPal y MercadoPago requieren completar y validar la integración antes de habilitarlos para compras. El bloqueo evita cobros en moneda equivocada y falsas confirmaciones; no los convierte en integraciones terminadas.
- Webpay/Linkify requieren validación sandbox con credenciales y retornos accesibles. El inicio remoto Webpay no tiene persistencia durable de intentos: una respuesta de red incierta exige reconciliar con el proveedor antes de reintentar. No se certifica ausencia de doble cobro remoto ante ese escenario.
- SQL/Mongo no comparten transacción distribuida. La compensación de excepciones está probada; una caída del proceso entre commits o un fallo de compensación necesita reconciliación operativa. Las reservas de pedidos pendientes/abandonados no tienen liberación automática certificada aquí.
- Carrito invitado permanece en memoria y se pierde en recarga completa. La persistencia reparada y comprobada corresponde al carrito autenticado.
- No se aplicaron las dos migraciones locales pendientes. Las opciones de desarrollo existentes (`DEBUG`, hosts abiertos, fallbacks de claves/credenciales) necesitan configuración de producción; no se cambiaron `.env` ni la política de despliegue.
- La cotización manual es una limitación aceptada y documentada. Los normalizadores logísticos no equivalen a tracking comercial conectado.

Recomendación: los arreglos quedan aptos para revisión e integración en develop **con PayPal y MercadoPago explícitamente indisponibles**. No declarar el sistema completo ni todas sus pasarelas listos para producción hasta resolver los riesgos anteriores, conciliar las migraciones pendientes en un despliegue autorizado y validar proveedores en sandbox. Esta auditoría no ejecuta merge ni commit.

### Archivos de esta auditoría

- `backend/apps/authentication/application/use_cases.py`
- `backend/apps/catalog/application/use_cases.py`
- `backend/apps/catalog/domain/seguimiento.py`
- `backend/apps/catalog/infrastructure/adapters/seguimiento_response.py`
- `backend/apps/catalog/infrastructure/adapters/transbank_adapter.py`
- `backend/apps/catalog/presentation/serializers.py`
- `backend/apps/catalog/presentation/views.py`
- `backend/apps/catalog/test_cart.py`
- `backend/apps/core/migrations/0006_configuracionpago_varianteproducto.py`
- `backend/apps/core/payments.py`
- `backend/apps/core/presentation/checkout.py`
- `backend/apps/core/presentation/customer_orders.py`
- `backend/apps/core/presentation/linkify_notificacion.py`
- `backend/apps/core/presentation/order_tracking.py`
- `backend/apps/core/presentation/views.py`
- `backend/apps/core/test_checkout.py`
- `backend/apps/core/test_final_audit.py`
- `backend/apps/core/test_pending_transfers.py`
- `backend/apps/core/test_tenant_sql.py`
- `docs/revision-integral-estabilidad.md`
- `frontend/src/features/admin/pages/Payments.tsx`
- `frontend/src/features/checkout/services/transbankPaymentService.ts`
- `frontend/src/features/storefront/context/CartContext.tsx`
- `frontend/src/features/storefront/pages/Checkout.tsx`
- `frontend/src/features/storefront/services/cartService.ts`
- `frontend/tests/cart-checkout.cjs`
