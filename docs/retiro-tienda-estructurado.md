# Retiro en tienda: dirección estructurada y horario semanal

> Actualización del 15 de octubre de 2026: sin proveedor configurado se permite activar retiro con dirección manual estructuralmente válida. La dirección se identifica como manual y no verificada externamente. Ver [corrección de entrada manual](retiro-tienda-manual.md), que reemplaza las restricciones de Google indicadas en este informe histórico.


Implementación local en `feature/sprint5-dashboard-operativo`, sin commits ni publicación.

## Resultado

El panel conserva su tarjeta e interruptor y ahora permite seleccionar región y comuna del catálogo chileno existente, calle/número y referencia opcional. La búsqueda se inicia con el botón **Buscar dirección** y muestra ubicaciones candidatas reconocidas por el proveedor. Editar región/comuna/calle/número invalida la constancia de verificación; editar una referencia interna no cambia la ubicación verificada.

Cada día de lunes a domingo tiene checkbox e inicio/término con `type=time`. Días deshabilitados son cerrados y no requieren horas. Se admite un intervalo por día y se agrupan automáticamente horarios idénticos, incluso para días no consecutivos. El resumen se muestra en el panel y en el checkout.

Al activar retiro, frontend y backend validan región/comuna coherentes, calle, dirección reconocida, numeración (o excepción de establecimiento reconocida por el proveedor), al menos un día y horas completas con cierre posterior a apertura. Los errores están asociados a los campos. No se admiten horarios nocturnos que crucen medianoche en esta primera versión. Desactivado permite guardar un borrador incompleto y las otras entregas.

Checkout mantiene la separación de entrega y pago. Recibe textos legibles de dirección/horarios y muestra **Gratis ($0)**. La consulta pública y la creación de pedidos no ofrecen retiro v2 inválido. Los pedidos conservan un snapshot de dirección y horario, y no cambian al editar el local. Chilexpress/Starken mantienen su configuración, cotizaciones y validaciones existentes.

## Persistencia y contrato

No se cambian modelos ni tablas: se usa el JSONField `ConfiguracionEntrega.datos`, relacionado uno a uno con Tienda. **No se requieren migraciones**. `makemigrations --check --dry-run` informó `No changes detected`.

Se extiende `pickup` de forma aditiva:
```json
{
  "enabled": true,
  "version": 2,
  "address": "Avenida Providencia 1234, Local 2, Providencia, Metropolitana de Santiago",
  "schedule": "Lunes, Martes, Viernes: 09:00 a 18:00; Miércoles, Jueves, Sábado, Domingo: cerrado",
  "location": {
    "region": "Metropolitana de Santiago",
    "comuna": "Providencia",
    "street": "Avenida Providencia",
    "number": "1234",
    "reference": "Local 2",
    "verification": "constancia firmada obtenida del servidor"
  },
  "hours": {
    "mon": {"enabled": true, "start": "09:00", "end": "18:00"},
    "tue": {"enabled": true, "start": "09:00", "end": "18:00"},
    "wed": {"enabled": false, "start": "", "end": ""},
    "thu": {"enabled": false, "start": "", "end": ""},
    "fri": {"enabled": true, "start": "09:00", "end": "18:00"},
    "sat": {"enabled": false, "start": "", "end": ""},
    "sun": {"enabled": false, "start": "", "end": ""}
  }
}
```

`address` y `schedule` siguen existiendo como strings para consumidores actuales, pero para v2 el servidor los calcula desde `location` y `hours`. La dirección derivada admite hasta 1500 caracteres; la dirección antigua mantiene el límite de 500. Las constancias están firmadas y vinculadas a la tienda y a región/comuna/calle/número. No se acepta un flag `verified` inventado por el cliente. El endpoint público y el snapshot del pedido omiten `verification`.

GET/PUT/PATCH de `/api/entregas/configuracion/` se reutilizan. PATCH mezcla objetos anidados y valida el resultado completo bajo el bloqueo de tienda; no crea una fila ni persiste cambios si falla la validación. Los errores retornan `ERROR_VALIDACION` y `error.detalles.pickup` con rutas como `hours.mon.end` o `location.verification`.

La consulta `/api/entregas/alternativas/` se mantiene. El pedido añade a `entrega.retiro` los campos `version`, `location` y `hours`, conservando `address` y `schedule` y el envío de cero pesos.

## Compatibilidad

- Configuraciones antiguas permanecen como texto, sin inventar región/comuna ni convertir horarios mediante heurísticas.
- Una configuración antigua ya activada con dirección y horario no vacíos puede seguir operando y guardarse sin cambios, incluso al editar otros transportistas. Es una excepción explícita de compatibilidad; **no se etiqueta como dirección geocodificada**.
- Para activarla de nuevo o cambiar dirección/horario se requiere completar el formulario v2. Una nueva activación por API con el contrato de texto se rechaza.
- La edición estructurada conserva los textos originales en `legacy_address` y `legacy_schedule`. El panel los muestra como referencia; no se sobrescriben pedidos históricos.
- Retiro antiguo incompleto o retiro v2 inválido se excluyen de nuevas compras. El panel privado mantiene los datos para poder corregirlos.
- Los reintentos idempotentes de un pedido previamente creado mantienen el comportamiento existente aunque después se desactive retiro.

## Proveedor real de direcciones

No había una integración geocodificadora previa. Se agregó un adaptador modular de **Google Geocoding API v3**, ejecutado solamente en backend. No se añadió un SDK ni una dependencia: utiliza `requests`, ya instalado.

La búsqueda tiene filtro Chile, lenguaje español, timeout de 8 segundos y compara los componentes geográficos con región/comuna seleccionadas. Descarta `partial_match`, resultados sin ubicación `ROOFTOP`, componentes territoriales incompatibles y ubicaciones sin calle/número. La excepción sin número se admite solo para un `premise` identificado por el proveedor, con constancia firmada específica.

Esto es evidencia de reconocimiento por un proveedor cartográfico, no una certificación física/legal ni prueba de que el negocio atiende en ese punto. La constancia guardada se verifica localmente sin volver a consultar Google en cada checkout, para no depender de su disponibilidad durante compras. Conservar `SECRET_KEY` estable es necesario para validar constancias persistidas; al rotarla, direcciones v2 previamente firmadas deben seleccionarse de nuevo.

API nueva (solo propietario activo, tienda resuelta por el mecanismo existente):
- `GET /api/entregas/retiro/direcciones/`: `{configured, provider}`.
- `POST /api/entregas/retiro/direcciones/`: `{region, comuna, query}`; devuelve sugerencias estructuradas y firmadas.
- Límite de 20 solicitudes por minuto por usuario; resultado de búsqueda sin caché HTTP.
- Sin proveedor/clave devuelve aviso claro (POST 503). No hay validación simulada de respaldo.

Configuración para desarrolladores:
1. Habilitar Google Geocoding API en un proyecto con facturación, obtener una clave restringida a ese servicio y al backend.
2. Establecer en el entorno del backend `PICKUP_GEOCODING_PROVIDER=google` y `PICKUP_GOOGLE_GEOCODING_KEY=<clave real>`. Nunca usar una variable `VITE_*` para esta clave.
3. `.env.example` contiene placeholders vacíos y Compose pasa estas dos variables al backend. No se modificó `.env` ni se introdujeron credenciales. Para ejecución local sin Docker, definirlas en el proceso que inicia Django.
4. Reiniciar/recrear el backend para que reciba las variables y usar **Revisar disponibilidad** en el panel.

Sin clave configurada, es posible guardar las otras entregas y borradores de retiro desactivados. No es posible verificar una nueva dirección ni activar un retiro nuevo. No se realizaron llamadas reales a Google durante esta implementación.

Documentación primaria consultada: [solicitudes y respuestas de Geocoding](https://developers.google.com/maps/documentation/geocoding/guides-v3/requests-geocoding). Antes de habilitar el servicio en un despliegue, el equipo debe comprobar sus condiciones aplicables de uso, visualización y almacenamiento. La selección del adaptador permite sustituir el proveedor sin cambiar el contrato del formulario.

## Archivos de esta ampliación

Creados:
- `backend/apps/core/pickup.py`: validación, firma y resúmenes.
- `backend/apps/core/infrastructure/pickup_address.py`: adaptador Google configurable.
- `backend/apps/core/presentation/pickup_address.py`: endpoint de disponibilidad/búsqueda protegido.
- `backend/apps/core/test_pickup.py`: pruebas de horarios, dirección, compatibilidad, API y pedidos.
- `frontend/src/features/admin/services/pickupConfiguration.ts`: contrato, validaciones y agrupación.
- `frontend/src/features/admin/components/shipping/PickupEditor.tsx`: editor estructurado.
- `frontend/tests/pickup-visual.cjs`: prueba del editor real en navegador.
- `docs/retiro-tienda-estructurado.md`: este informe.

Modificados:
- `backend/apps/core/delivery.py`, `presentation/serializers.py`, `presentation/views.py`: preservación/validación de v2 y lecturas privadas/públicas.
- `backend/apps/core/presentation/checkout.py`: snapshot estructurado del retiro.
- `backend/apps/core/urls.py`: ruta nueva, conservando la ruta y el import del dashboard.
- `backend/apps/core/test_delivery.py`: compatibilidad y flujo integrado actualizado.
- `backend/apps/core/test_checkout.py`, `test_linkify_errores.py`, `test_pending_transfers.py`, `test_tenant_sql.py`: solo fixtures antiguas de retiro, completando dirección y horario; se mantienen escenarios de negocio.
- `frontend/src/features/admin/pages/Shipping.tsx`: integración del editor y errores.
- `frontend/src/features/admin/types/index.ts`: tipo compartido de pickup.
- `frontend/src/features/storefront/services/shippingService.ts`: búsquedas y errores por campo.
- `frontend/src/features/storefront/pages/Checkout.tsx`: texto de gratuidad explícito `$0`.
- `frontend/tests/shipping-pickup.cjs`: ocho pruebas de la configuración nueva.
- `frontend/tests/checkout-shipping.cjs`: expectativa de texto `Gratis ($0)`.
- `.env.example`, `docker-compose.yml`: variables opcionales del proveedor.

No se modificaron componentes, servicios ni pruebas propios del dashboard durante esta ampliación. Los cambios de su ruta permanecen dentro de `urls.py`, que ahora incorpora además el endpoint de direcciones.

## Pruebas y límites

- 153 pruebas de backend OK: retiro v2, entregas, cotizaciones/errores, transferencias/configuración, dashboard, últimas órdenes y estados de pedido. SQLite aislado en memoria; catálogo de checkout sustituido por fixture, sin tocar BD local.
- Ocho pruebas del formulario/servicio OK: agrupación, dirección, errores, sugerencias, invalidación de constancia, edición/recarga, borrador sin proveedor y desactivación.
- 61 pruebas existentes de checkout OK: cuatro plantillas, retiro gratis, Chilexpress/Starken y cotizaciones.
- 30 archivos de pruebas funcionales de frontend terminaron con código 0 (se excluyeron los scripts de navegador).
- Prueba en navegador con Edge OK a 375, 768 y 1280 px: editor real, selección de dirección y horarios, mensajes, agrupación y ausencia de desbordamiento. API externa sustituida por fixture explícita. Capturas fuera del repositorio, en la carpeta de visualizaciones del chat.
- TypeScript y compilación de producción OK. Advertencia existente por bundle mayor de 500 kB.
- `makemigrations --check --dry-run`: sin cambios.
- `git diff --check`: sin errores (aviso LF/CRLF de Dashboard previo).
- La suite adicional que incluye integración real Mongo (`test_tenant_sql` y `test_linkify_errores`) se interrumpió tras errores repetidos por falta de `mongodb:27017`. No se afirma que pase la suite completa. Falta repetir en PostgreSQL/MongoDB y con una clave real del proveedor.
- No hay configuración de lint en el proyecto; no se añadieron dependencias de lint.

Comandos reproducibles desde la raíz:
```powershell
python backend/scripts/test_dashboard.py apps.core.test_pickup apps.core.test_delivery apps.core.test_shipping apps.core.test_shipping_errores apps.core.test_pending_transfers apps.core.test_transfer_configuration apps.core.test_dashboard apps.core.test_ultimas_ordenes apps.core.test_estados_pedido
node frontend/tests/shipping-pickup.cjs
node frontend/tests/checkout-shipping.cjs
npm run build --prefix frontend
```
Prueba visual: desde frontend, `node tests/pickup-visual.cjs`, con Playwright disponible en el entorno (o `PICKUP_PLAYWRIGHT_MODULE` apuntando al módulo instalado). No se agregó Playwright como dependencia del producto.

## Comprobación manual

1. Abrir `/emprendedor/entregas` como propietario. Sin proveedor, comprobar aviso y guardar Chilexpress/Starken con retiro desactivado.
2. Con proveedor real configurado: elegir región/comuna, escribir calle/número, buscar y seleccionar una sugerencia. Verificar que cambiar número o comuna obligue a seleccionar nuevamente.
3. Habilitar lunes/martes/viernes con 09:00–18:00, miércoles/jueves con 10:00–15:00 y sábado con 10:00–14:00. Dejar domingo cerrado. Revisar resumen agrupado.
4. Activar retiro, guardar y recargar. Comprobar que región, comuna, referencia y todos los días se conservan. Probar horas vacías/invertidas y dirección no seleccionada: deben impedir guardado con errores específicos.
5. En checkout, verificar dirección completa, resumen agrupado y Gratis ($0). Crear pedido y revisar `costo_envio=0`, `entrega.metodo=Retiro` y `entrega.retiro`.
6. Modificar dirección/horarios del local, revisar que el pedido anterior no cambie.
7. Desactivar retiro y guardar; abrir checkout nuevo y confirmar que no se ofrece. Verificar envíos de Chilexpress/Starken y medios de pago.
8. Abrir configuración antigua: los textos se conservan. Para editarla/reactivarla, completar v2; no se asumen horarios desde texto libre.

Todos los cambios permanecen locales y sin staging ni commits, en la rama autorizada. No se realizaron operaciones de publicación, integración ni cambios de rama.
