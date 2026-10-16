# Retiro en tienda: entrada manual sin dependencia de Google

Corrección local terminada el 15 de octubre de 2026 en `feature/sprint5-dashboard-operativo`.
Este informe actualiza las condiciones de activación descritas en `retiro-tienda-estructurado.md`.

## Comportamiento

- **Sin Google configurado:** se permite activar y guardar retiro con región, comuna, calle y número completos, comuna coherente con región y al menos un día con horas válidas. Espacios en blanco no cuentan como información. Se muestra «Dirección ingresada manualmente; no verificada externamente». El botón de búsqueda se oculta para no ofrecer una operación que no está disponible.
- **Con Google configurado:** se conserva búsqueda real, selección de resultados y verificación firmada existente. Una dirección nueva o modificada requiere selección; modificar calle, número, región o comuna invalida la constancia anterior. La referencia interna sigue siendo editable sin cambiar la ubicación del establecimiento.
- Una dirección manual ya guardada sigue operando si posteriormente se configura Google. Cambiar su ubicación invalida la constancia; la edición deberá cumplir las reglas del proveedor que esté configurado en ese momento.
- El horario mantiene las validaciones existentes: un día como mínimo, inicio/término completos y término posterior al inicio. Días deshabilitados no requieren horas.
- Retiro desactivado no exige datos completos y permite guardar los otros métodos de entrega. Las configuraciones antiguas conservan la compatibilidad existente.

## Backend y persistencia

La decisión de permitir entrada manual se obtiene de la configuración **del servidor**, no de campos enviados por el navegador. Continúan la autenticación y autorización por tienda, validación territorial y validación del horario.

Se agrega `pickup.validation_method`, calculado por el servidor y de solo lectura en el serializer:
- `manual`: información introducida manualmente; no implica comprobación externa de existencia.
- `google`: selección respaldada por la constancia existente del proveedor.
- `unverified`: borrador sin constancia válida.

El backend registra una constancia firmada para la entrada manual aceptada usando el campo interno `location.verification` existente. Su contenido identifica explícitamente `provider=manual` y se vincula a la tienda y a los campos de ubicación. **La firma solo protege integridad/procedencia; no geocodifica ni certifica que la dirección exista.** No se genera una constancia Google ficticia.

Un cliente no puede declarar su dirección como Google mediante `validation_method`, usar una constancia con otra dirección/tienda ni omitir los campos estructurales y horarios obligatorios mediante HTTP. Con proveedor configurado tampoco puede habilitar una dirección nueva sin selección alegando modo manual.

No se modificaron modelos, tablas, variables de entorno ni claves. Se usa el JSONField existente; no se requieren migraciones.

## Checkout

La lectura pública conserva el indicador de procedencia y excluye la constancia privada. El retiro manual válido se ofrece como entrega a **$0**, con la dirección legible y el resumen de horarios existentes.

El pedido conserva una copia de esos datos y de `validation_method`; las modificaciones posteriores al establecimiento no alteran el pedido anterior. El único ajuste en creación de pedidos añade esa procedencia al snapshot, conservando el resto del flujo. No se cambiaron tarifas, transportistas ni medios de pago.

## Archivos de esta corrección

Modificados:
- `backend/apps/core/pickup.py`: validación manual y registro de procedencia.
- `backend/apps/core/presentation/views.py`: preparación de la configuración validada antes del guardado.
- `backend/apps/core/presentation/serializers.py`: procedencia de solo lectura.
- `backend/apps/core/presentation/checkout.py`: copia de la procedencia al pedido.
- `backend/apps/core/test_pickup.py`: cinco pruebas adicionales para modo manual, HTTP y checkout.
- `frontend/src/features/admin/services/pickupConfiguration.ts`: validación según disponibilidad del proveedor y tipo de procedencia.
- `frontend/src/features/admin/pages/Shipping.tsx`: disponibilidad comunicada al validador del formulario; el servidor conserva la autoridad final si no se pudo consultar el estado.
- `frontend/src/features/admin/components/shipping/PickupEditor.tsx`: avisos claros de entrada manual y búsqueda solo cuando está configurada.
- `frontend/tests/shipping-pickup.cjs`: doce pruebas del formulario y servicios, incluidas cuatro nuevas.
- `frontend/tests/pickup-visual.cjs`: escenarios manual/Google a tres resoluciones.
- `docs/retiro-tienda-estructurado.md`: aviso de actualización del comportamiento anterior.

Creado: `docs/retiro-tienda-manual.md` (este informe).

## Pruebas y resultados

- **158 pruebas de backend OK**: retiro, configuración de entregas, cotizaciones/errores, transferencias, dashboard, últimas órdenes y estados. Incluyen solicitud HTTP manual válida/incompleta, valores de solo espacios, comuna incoherente, horarios inválidos, persistencia, procedencia no falsificable, cambio de proveedor, snapshot de pedido y envío cero. Se conservaron las pruebas existentes de Google.
- **12 pruebas de formulario/servicio OK**, incluidas activación manual sin proveedor, recarga, errores y selección Google.
- **31 archivos funcionales de pruebas frontend** terminaron con código 0, incluidos dashboard, Pedidos, checkout y transportistas.
- **6 escenarios de navegador OK**: manual sin proveedor y Google con fixture, cada uno a 375/768/1280 px. Se usó el componente real y CSS compilado; no hubo llamadas externas ni claves reales.
- **TypeScript y compilación de producción OK**. Persiste la advertencia de Vite por chunk mayor de 500 kB.
- `git diff --check`: sin errores; solo avisos LF/CRLF de archivos del trabajo previo.

Las pruebas backend usan SQLite aislado en memoria y un catálogo de prueba; falta el recorrido con PostgreSQL/MongoDB del despliegue y una clave real de Google. No se afirma haber consultado Google. Al retomar, el Python predeterminado cambió a `C:\Python314\python.exe` (sin Django); las pruebas se completaron con `C:\Users\maria\anaconda3\python.exe`, que ya tenía Django, sin instalar dependencias ni alterar el entorno del proyecto.

Comandos (desde la raíz):
```powershell
& 'C:\Users\maria\anaconda3\python.exe' backend/scripts/test_dashboard.py apps.core.test_pickup apps.core.test_delivery apps.core.test_shipping apps.core.test_shipping_errores apps.core.test_pending_transfers apps.core.test_transfer_configuration apps.core.test_dashboard apps.core.test_ultimas_ordenes apps.core.test_estados_pedido
node frontend/tests/shipping-pickup.cjs
npm run build --prefix frontend
```

## Comprobación manual

1. Sin proveedor configurado, abrir `/emprendedor/entregas` como propietario.
2. Activar retiro. Completar región/comuna, calle/número y un día con horario válido. Comprobar el aviso de dirección manual no verificada, guardar y recargar.
3. Probar campos vacíos, espacios, horario sin cierre y cierre anterior al inicio: deben impedir guardado con mensajes específicos.
4. Abrir checkout nuevo: retiro debe aparecer con dirección, horario y Gratis ($0). Crear un pedido y comprobar su copia de retiro.
5. Editar dirección/horario del local y comprobar que el pedido anterior conserva su información.
6. Con Google configurado, comprobar que aparece Buscar dirección, seleccionar un resultado y guardar. Cambiar calle/número: debe perderse la selección y requerirse otra.
7. Verificar que Chilexpress, Starken y medios de pago mantienen su funcionamiento.

Todos los cambios quedan locales, sin staging ni commits, en la rama autorizada. No se ejecutaron operaciones de publicación o integración ni cambios de rama.
