# SCRUM-319 y SCRUM-320: transferencias pendientes

## Fuente de verdad y registro (SCRUM-319)

Se reutiliza `Pedido`; no se agregan modelos, tablas, migraciones ni estados duplicados. Una transferencia pendiente se identifica por `medio_pago='Transferencia'` y `estado='pendiente'`, junto a su tienda.

El checkout existente ya registra esos valores, contacto/comprador, importe e identificador. Se completó esta tarea cubriendo ese comportamiento con pruebas específicas y conectándolo a la consulta del propietario. No fue necesario modificar `checkout.py`, el modelo ni sus flujos de stock o idempotencia.

Los tests comprueban que reintentar la misma clave devuelve el mismo pedido sin duplicar ítems ni descuentos de stock Mongo/SQL. El stock SQL aislado pasa de 7 a 5 una sola vez. Cambiar el contacto reutilizando la clave se rechaza. Se cubren comprador autenticado e invitado.

## Consulta (SCRUM-320)

`GET /api/pagos/transferencias/pendientes/`

Autenticación y propietario activo obligatorios. Reutiliza `resolver_tienda(request, exigir_propietario=True)`. Los identificadores enviados por query, cabeceras o cuerpo nunca seleccionan tienda; los ajenos se rechazan con 400. La instalación sin tienda o con varias tiendas devuelve 503 conforme al helper actual. Anónimo: 401. Usuario autenticado no propietario: 403.

El filtro SQL exige simultáneamente tienda resuelta, `medio_pago='Transferencia'` y `estado='pendiente'`. Ordena por `-fecha_creacion`, con `-id_pedido` para desempatar. Excluye pedidos sin tienda, de otras tiendas, pagados/enviados/cancelados y cualquier otro medio de pago, incluido Linkify. `metodo_pago` legado no sustituye al campo canónico `medio_pago`.

Respuesta usando el sobre estándar del proyecto:

```json
{
  "exito": true,
  "mensaje": "Transferencias pendientes obtenidas correctamente.",
  "data": [
    {
      "id_pedido": 123,
      "identificador": "ORD-20261007-ABCD",
      "fecha_creacion": "2026-10-07T18:00:00Z",
      "nombre_contacto": "Comprador",
      "correo_contacto": "buyer@example.com",
      "monto_total": "20000.00",
      "medio_pago": "Transferencia",
      "estado": "pendiente"
    }
  ]
}
```

Si no hay transferencias, `data` es `[]` con 200. El identificador admite null para pedidos históricos, igual que el modelo. No se devuelven credenciales, cuentas bancarias, teléfono, dirección, claves de checkout ni huellas. La ruta no admite POST/PUT/PATCH/DELETE: esas operaciones devuelven 405. Consultar no verifica ni cambia el estado del pago.

## Panel

Se añadió `PendingTransfers` dentro de la tarjeta existente de transferencia bancaria en `Payments.tsx`, mediante un import y un punto de montaje. Muestra carga, error/reintento, vacío y tabla con identificador, nombre/correo, monto y fecha. Permite actualizar la lista y cancela las consultas al desmontarse.

Usa el URL base, token y componentes del proyecto, sin IDs de tienda hardcodeados ni dependencias nuevas. El botón de actualización es `type="button"` para no enviar el formulario de métodos de pago. La lista sigue disponible aunque se desactive la configuración bancaria: los pedidos pendientes anteriores continúan existiendo.

La configuración de pagos, Linkify, Webpay, PayPal, MercadoPago, entregas y autenticación no se reemplazó ni refactorizó. No hay acciones nuevas de conciliación, comprobantes o aprobación manual: quedan fuera de 319/320.

## Validación con Docker

Los comandos se ejecutaron en los contenedores activos del proyecto. Se confirmó que backend monta este repositorio. Los tests crearon y destruyeron exclusivamente la base temporal de Django `test_ecommerce_db`; no se aplicaron cambios a las migraciones históricas ni a la base de desarrollo, y no se borraron volúmenes.

- `docker compose exec -T backend python manage.py check`: sin problemas.
- `docker compose exec -T backend python manage.py test apps.core.test_pending_transfers --noinput --verbosity 2`: **18/18 aprobados**. Incluyen los diez casos solicitados, stock SQL, contacto de invitado, manipulación de tenant, campos expuestos, consulta sin efectos y desempate de fecha.
- Antes de editar: `docker compose exec -T backend python manage.py test apps.core.test_checkout apps.core.test_linkify_errores apps.core.test_linkify_notificacion apps.core.test_linkify_configuracion --noinput --verbosity 1`: **54/56 aprobados**, con dos fallos preexistentes.
- Tras implementar: `docker compose exec -T backend python manage.py test apps.core.test_pending_transfers apps.core.test_checkout apps.core.test_linkify_errores apps.core.test_linkify_notificacion apps.core.test_linkify_configuracion apps.core.test_delivery --noinput --verbosity 1`: **96/98 aprobados**. Persisten exactamente los mismos dos fallos; no se cambiaron ni debilitaron sus tests.
- `npm run build` (desde frontend): correcto; advertencia existente de tamaño del bundle.
- `npx tsc --project tsconfig.app.json --noEmit --incremental false --pretty false` (desde frontend): **15 diagnósticos preexistentes**, iguales antes y después; ninguno en la implementación nueva. No se corrigieron tareas ajenas. El script build usa el tsconfig raíz sin archivos y su éxito no sustituye esta comprobación estricta.
- `git diff --check`: correcto.

Fallos preexistentes preservados:

1. `CheckoutOrderTests.test_authenticated_order_persists_items_totals_and_appears_in_history`: espera stock 7, pero recibe 5 después de la compra (`test_checkout.py:77`).
2. `LinkifyConfiguracionTests.test_el_checkout_no_lista_linkify_desactivado_o_sin_credenciales`: la API existente lista Linkify habilitado sin clave (`test_linkify_configuracion.py:49`).

La inconsistencia histórica de migraciones de authentication en desarrollo permanece fuera de alcance. Las migraciones de la base temporal se aplicaron correctamente. No se ejecutaron `--fake`, reparaciones históricas ni cambios de credenciales.

## Archivos

Modificados:

- `backend/apps/core/presentation/serializers.py`: serializer pequeño de consulta.
- `backend/apps/core/presentation/views.py`: vista de lectura con permisos y filtro.
- `backend/apps/core/urls.py`: ruta privada.
- `frontend/src/features/admin/pages/Payments.tsx`: montaje de la lista sin alterar formularios existentes.

Creados:

- `backend/apps/core/test_pending_transfers.py`: 18 tests específicos; reutiliza el repositorio falso de las pruebas Linkify.
- `frontend/src/features/admin/services/pendingTransfersService.ts`: consulta tipada y validación de respuesta.
- `frontend/src/features/admin/components/PendingTransfers.tsx`: estados de carga/error/vacío y tabla.
- `docs/scrum-319-320-transferencias.md`: este contrato y resultados.

Durante el trabajo apareció `backend/landing/images/imagen_principal.png` como archivo no rastreado ajeno a esta implementación. No se creó desde este código ni los tests añadidos, y se conservó sin modificar ni eliminar.

Se mantuvo `feature/SCRUM-319-320-transferencias`. No se ejecutaron commit, push, merge, reset, rebase ni cambios de rama.
