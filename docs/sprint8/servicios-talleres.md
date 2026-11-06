# Servicios, talleres y solicitudes — contrato y decisiones

Base: `5f97b7f`, rama `feature/sprint8-marketing-secciones`, árbol limpio al comenzar.

## Auditoría

Las seis clases de sección y sus bloques viven en `ConfiguracionLanding.contenido.bloques`, identificados por UUID. Los presets de servicios/talleres ya existen, pero solo agregan texto. El orden unificado referencia esos mismos UUID. Biblioteca utiliza recursos compartidos por ID, con acceso público derivado de secciones visibles. Se reutilizan ese editor, almacenamiento, renderizado y protección por tienda.

PostgreSQL contiene tienda, usuarios Django, pedidos y configuración. El catálogo activo y sus variantes se consultan en MongoDB. `resolver_tienda` exige una única tienda por instalación y comprueba su propietario activo; una instalación ambigua devuelve 503. La autenticación usa Token/Session; los invitados pueden enviar formularios públicos sin crear cuentas. No se reutiliza automáticamente un perfil ni se asocia un usuario anónimo por coincidencia de correo.

Los formularios administrativos, estados de carga/error, paginación, botones y modales ya existen. El módulo Contactos se ocupa de compradores y consentimiento publicitario: una consulta o inscripción no se incorpora a campañas ni concede ese consentimiento. El envío transaccional existe en `email_service.enviar_correo`, con resultados explícitos y errores que no deben invalidar la operación.

## Contrato de esta etapa

Se amplía cada sección configurable con `actividad` opcional: `tipo` servicio/taller, `estado` activa/cancelada, clasificación, zona horaria IANA, plataforma, enlace privado de reunión, inscripción gratuita habilitada, gratuidad explícita, cupos opcionales y confirmación automática/manual. El contenido visual sigue en los bloques existentes; los botones de consulta e inscripción son nuevos tipos de bloque. Las fechas admiten término opcional y se validan junto con horario y zona. Una actividad publicada requiere título; un taller requiere fecha y hora. El enlace privado nunca forma parte de las respuestas públicas ni se entrega automáticamente a participantes.

Se agrega un registro operacional PostgreSQL, `SolicitudActividad`, con tienda, UUID de sección, nombre/tipo de actividad conservados como referencia histórica, tipo consulta/inscripción, datos proporcionados, usuario autenticado opcional, fecha, evidencia/versionado del consentimiento, estado y claves de deduplicación. No copia contenido multimedia ni crea productos.

Endpoints bajo `/api/landing/`:

- `POST actividades/<uuid>/consultas/`: público, consentimiento de respuesta obligatorio, mensaje obligatorio, 202 genérico sin datos personales.
- `POST actividades/<uuid>/inscripciones/`: público, solo taller publicado/activo y explícitamente gratuito; consentimiento de gestión obligatorio, 202 genérico. No indica pago ni concede acceso a reuniones.
- `GET solicitudes-actividades/`: solo propietario, paginado, filtros tipo/estado/sección. No hay listado público.
- `PATCH solicitudes-actividades/<uuid>/`: solo propietario, únicamente estado; no modifica el contenido original, correo ni tipo de solicitud.

Campos públicos de entrada: `solicitud_id` UUID para reintentos, `nombre`, `apellido` opcional, `email`, `telefono` opcional, `mensaje` y `consentimiento: true`. La URL determina sección y la instalación determina tienda. Se rechazan campos desconocidos y selecciones de tiendas ajenas. Las respuestas operacionales son `no-store`.

La deduplicación combina clave de reintento y huella diaria de consulta; una inscripción solo existe una vez por taller/correo. Pendientes y confirmadas consumen cupo. La creación y las transiciones de inscripción bloquean la configuración PostgreSQL para serializar cambios de cupo/publicación y evitar sobreinscripciones. Los límites por IP y destinatario utilizan claves HMAC, sin correos ni direcciones IP en claro en la caché. Son protección básica; para varias réplicas se necesita caché compartida y límites en el proxy.

## Venta de servicios: etapa posterior

El checkout actual reserva stock/SKU, calcula despacho y crea ítems vinculados a productos físicos. Una implementación segura requiere un discriminador de ítem físico/servicio, precios verificados en servidor, reglas de envío mixto, reserva de cupos con vencimiento, relación entre línea de pedido y actividad, confirmación idempotente del proveedor de pago, liberación por rechazo/cancelación y una política de devolución definida por el negocio. No se modifica carrito, inventario, checkout, pagos ni políticas comerciales en esta etapa.
