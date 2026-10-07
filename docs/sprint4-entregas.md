# Sprint 4: alternativas de entrega

Tareas: SCRUM-329, SCRUM-330, SCRUM-333, SCRUM-325 y SCRUM-324.

## Contrato HTTP

Las rutas usan el sobre existente `{ "exito": true, "mensaje": "...", "data": { ... } }`.

| Ruta | Método | Acceso | Comportamiento |
| --- | --- | --- | --- |
| `/api/entregas/configuracion/` | GET | Propietario autenticado | Configuración completa; defaults si aún no hay fila, sin crearla. |
| `/api/entregas/configuracion/` | PUT | Propietario autenticado | Reemplaza la configuración con las tres secciones completas. |
| `/api/entregas/configuracion/` | PATCH | Propietario autenticado | Actualiza solo los campos enviados; conserva los demás. |
| `/api/entregas/alternativas/` | GET | Público | Misma forma de datos, sin credenciales, para checkout. |

La tienda se obtiene con `resolver_tienda`; el cliente nunca puede elegirla. Las operaciones privadas exigen propietario activo. Los identificadores ajenos en query, headers o cuerpo se rechazan. Una instalación con varias tiendas devuelve 503, como el resto del proyecto.

Defaults y ejemplo válido de PUT:

```json
{
  "chilexpress": { "enabled": false, "accountId": "", "apiKey": "", "status": "not_configured" },
  "starken": { "enabled": false, "accountId": "", "apiKey": "", "status": "not_configured" },
  "pickup": { "enabled": false, "address": "", "schedule": "" }
}
```

Guardar retiro mediante PATCH:

```json
{ "pickup": { "enabled": true, "address": "Av. Providencia 1234", "schedule": "Lun–Sáb 9–18" } }
```

Desactivarlo conservando dirección y horario:

```json
{ "pickup": { "enabled": false } }
```

`enabled` exige un boolean JSON. Dirección y horario exigen strings, admiten vacío y tienen máximo 500 caracteres. Se rechazan campos desconocidos, nulls y estructuras inválidas con 400. PUT requiere `enabled` para cada transportista y los tres campos de pickup; PATCH admite cambios anidados parciales.

## Persistencia y transportistas

Se reutilizan el modelo `ConfiguracionEntrega` y la migración `0018_configuracionentrega.py` que ya estaban en el árbol de trabajo. La migración depende de `0017_merge_20261004_0731` y solo crea ese modelo. No se agregó otra migración ni se cambió el modelo previo.

Los cambios se serializan bloqueando la tienda dentro de una transacción, incluso cuando aún no existe la configuración. Esto conserva campos de PATCH concurrentes y comparte el bloqueo usado por checkout.

Chilexpress y Starken pueden activarse como alternativas gestionadas manualmente, manteniendo el cálculo de envío existente. No hay conexiones, cotizaciones ni validación de contratos externos. `accountId`, `apiKey` y `status` se conservan como placeholders por compatibilidad del frontend. Credenciales no vacías y estados distintos de `not_configured` se rechazan. La lectura siempre elimina cualquier credencial de transportista de la respuesta.

Se revisó `EncryptedTextField`: cifra columnas de texto, no claves de JSONField. La integración de credenciales queda fuera de este bloque; antes de implementarla debe usar almacenamiento cifrado apropiado.

## Panel y checkout

`Shipping.tsx` conserva las tarjetas, componentes, campos y toggles existentes. Carga desde backend, permite reintentar, guarda en backend y muestra resultado. El formulario permanece bloqueado durante carga/guardado o si falla la consulta. El contexto local se actualiza solo después de guardar; si falla esa copia se informa que el servidor sí persistió.

Checkout consulta alternativas del backend, muestra dirección/horario reales y no ofrece alternativas locales cuando falla la consulta. Permite reintentar y explica cuando no hay métodos habilitados. La configuración existente de autenticación y las llamadas de PayPal, Webpay y Linkify se conservan.

Para pedidos nuevos el backend comprueba el método habilitado después de resolver la tienda, bajo su bloqueo y antes de crear pedidos o descontar stock. Un pedido ya registrado conserva su reintento idempotente aunque se desactive luego la alternativa. El alias de compra invitada comparte esta validación: su contrato legado usa Retiro, que debe estar habilitado.

No se importan automáticamente datos demo de localStorage a PostgreSQL. Al desplegar, el propietario debe activar las alternativas en el panel; mientras no haya configuración todas están desactivadas.

## Validación local (7 de octubre de 2026)

Se instalaron en `backend/venv` las dependencias que faltaban y ya estaban declaradas en `requirements.txt`. No se modificaron settings, `.env`, credenciales ni configuración de base de datos.

- `venv/Scripts/python.exe manage.py check`: sin errores.
- `venv/Scripts/python.exe manage.py makemigrations --check --dry-run`: `No changes detected`. La comprobación de historial aplicado emitió advertencia porque PostgreSQL no está disponible.
- `venv/Scripts/python.exe manage.py test apps.core.test_delivery.DeliveryContractTests --verbosity 2`: pruebas sin BD de tipos estrictos, payloads inválidos, defaults, GET y exclusión de secretos.
- Verificación final: `venv/Scripts/python.exe manage.py test apps.core.test_delivery.DeliveryContractTests apps.core.test_credenciales_cifradas.CifradoTests apps.core.test_variante_atributos --verbosity 2`: 26 pruebas aprobadas, incluidas 11 nuevas del contrato de entregas y 15 existentes de cifrado/atributos, sin conexiones de BD.
- `venv/Scripts/python.exe manage.py test apps.core.test_delivery apps.core.test_linkify_errores apps.core.test_linkify_notificacion apps.core.test_linkify_configuracion apps.core.test_checkout --noinput --verbosity 1`: inicialmente descubrió 79 pruebas; no llegó a ejecutarlas porque no pudo crear la BD de pruebas. Error: `could not translate host name "db" to address: Name or service not known`.
- `npm run build`: correcto; advertencia de bundle grande. El primer intento estaba bloqueado por permisos del sandbox; el build fuera del sandbox pasó.
- `npx tsc --project tsconfig.app.json --noEmit --incremental false --pretty false`: mismos 16 diagnósticos ya encontrados antes de editar; ningún diagnóstico nuevo por entregas. Afectan router, Products, ThemeEditor, LandingDetails, ProductCard, Checkout y productService. Entre ellos está el tipo preexistente de `CreatedOrder.identificador`. El script build ejecuta `tsc` sobre un tsconfig raíz sin archivos, por lo que su éxito no equivale al chequeo estricto de `src`.

`test_delivery.py` incluye además pruebas de persistencia, aislamiento del propietario, manipulación de tienda, desactivación parcial, consulta pública, checkout deshabilitado/habilitado y reintento. Las fixtures de `test_checkout.py` y `test_linkify_errores.py` habilitan explícitamente entregas para conservar sus escenarios y assertions existentes.

Pendiente con PostgreSQL disponible: aplicar 0018 y ejecutar las pruebas de integración y regresión. La suite existente de checkout también necesita su colección aislada de MongoDB. No se afirmó que esas pruebas pasaron y no se sustituyó PostgreSQL para ocultar la limitación.

Se revisó el historial reciente antes de editar. No se ejecutaron commit, push, merge, reset, rebase ni cambios de rama; los stashes se conservaron.

## Archivos del cambio

Modificados en esta implementación:

- `backend/apps/core/presentation/checkout.py`: validación de entrega, conservando lógica de pagos, stock y reintentos.
- `backend/apps/core/presentation/serializers.py`: serializers y campos de entrega estrictos.
- `backend/apps/core/presentation/views.py`: API privada de configuración y consulta pública.
- `backend/apps/core/urls.py`: dos rutas de entrega.
- `backend/apps/core/test_checkout.py`: fixture de alternativas habilitadas.
- `backend/apps/core/test_linkify_errores.py`: fixture de retiro habilitado.
- `frontend/src/features/admin/pages/Shipping.tsx`: carga y guardado reales, manteniendo el diseño.
- `frontend/src/features/storefront/pages/Checkout.tsx`: consulta real y validación de selección de entrega.

Creados en esta implementación:

- `backend/apps/core/delivery.py`: defaults y contrato compartido de lectura.
- `backend/apps/core/test_delivery.py`: tests de contrato, API, permisos y checkout.
- `frontend/src/features/storefront/services/shippingService.ts`: servicio compartido tipado, con fetch, URL y autenticación existentes.
- `docs/sprint4-entregas.md`: contrato, decisiones y resultados de validación.

Cambios previos del usuario preservados sin editar: `backend/apps/core/models.py` y `backend/apps/core/migrations/0018_configuracionentrega.py`. Los dos archivos tsbuildinfo creados por la comprobación TypeScript inicial se eliminaron; no quedan archivos accidentales en el diff.
