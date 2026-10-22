# Correo transaccional de la tienda

Esta guía explica cómo enviar correos desde el backend (SCRUM-423) y cómo configurarlos. Más abajo se
documenta el correo de despacho (SCRUM-427, 431 y 434).

## Servicio de envío (SCRUM-423)

El módulo `backend/apps/core/infrastructure/email_service.py` es el único punto que envía correos.
Valida los datos, arma el mensaje en texto y en HTML, lo envía con la configuración de Django y devuelve
un resultado. **Nunca lanza una excepción**: un correo que falla no debe romper la operación que lo originó.

~~~python
from apps.core.infrastructure.email_service import enviar_correo

resultado = enviar_correo(
    'cliente@ejemplo.cl', 'Asunto del correo', 'Texto del correo.\n\nOtro párrafo.',
    preheader='Resumen que ve el comprador en la bandeja', nombre_remitente='Nombre de la tienda',
    referencia='order_received ORD-20261008-ABCD',   # solo para el log; sin datos personales
)
if not resultado.enviado:
    print(resultado.codigo)   # destinatario_invalido, contenido_invalido o error_de_envio
~~~

Lo que garantiza:

- El asunto queda en una sola línea y el nombre de la tienda no puede alterar el remitente (no se pueden inyectar cabeceras).
- El destinatario debe ser un solo correo válido; se rechazan listas, nombres con `<>` y saltos de línea.
- El contenido del correo se escapa en el HTML; solo las direcciones `http` y `https` se convierten en enlaces.
- El registro (log) nunca lleva el correo completo del comprador, solo una versión enmascarada (`m***@gmail.com`).
- La conexión usa un tiempo de espera (`EMAIL_TIMEOUT`, 10 segundos por defecto) para no dejar colgada la operación.

## Configuración

Se configura con variables de entorno (archivo `.env`, plantilla en `.env.example`). `docker-compose.yml` ya las
entrega al contenedor del backend.

| Variable | Qué es | Valor por defecto |
|---|---|---|
| `EMAIL_BACKEND` | Cómo se envía | `console` (imprime el correo en el log del backend) |
| `EMAIL_HOST`, `EMAIL_PORT` | Servidor SMTP | `localhost`, `587` |
| `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | Credenciales del servidor SMTP | vacío |
| `EMAIL_USE_TLS`, `EMAIL_USE_SSL` | Cifrado (`1` o `0`; no se usan juntos) | TLS `1`, SSL `0` |
| `EMAIL_TIMEOUT` | Segundos máximos de espera | `10` |
| `DEFAULT_FROM_EMAIL` | Dirección de salida, por ejemplo `Mi Tienda <no-reply@mitienda.cl>` | `Tienda <no-reply@tienda.local>` |

Después de cambiar el `.env`, recrea el backend: `docker compose up -d backend`.

### Opción 1: ver los correos en el log (sin configurar nada)

Con la configuración por defecto, el correo completo aparece en el log del backend:

~~~
docker compose logs -f backend
~~~

### Opción 2: ver los correos en el navegador con Mailpit (recomendado para probar)

Mailpit es un buzón de prueba: recibe los correos y los muestra en una página, sin enviarlos a nadie.

1. En el `.env` agrega:
   ~~~
   EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
   EMAIL_HOST=mailpit
   EMAIL_PORT=1025
   EMAIL_USE_TLS=0
   ~~~
2. Levanta el buzón y recrea el backend:
   ~~~
   docker compose --profile correo up -d mailpit
   docker compose up -d backend
   ~~~
3. Abre `http://localhost:8025`: ahí aparecen los correos con su versión HTML y de texto.

### Opción 3: enviar de verdad

Usa el servidor SMTP de tu proveedor. Ejemplo con una cuenta de Gmail (requiere verificación en dos pasos y una
"contraseña de aplicación"; no sirve la contraseña normal):

~~~
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=1
EMAIL_HOST_USER=tu-cuenta@gmail.com
EMAIL_HOST_PASSWORD=la-contraseña-de-aplicación
DEFAULT_FROM_EMAIL=Mi Tienda <tu-cuenta@gmail.com>
~~~

Las credenciales van solo en el `.env`, que no se sube al repositorio.

## Límites conocidos

- Los correos se envían en el mismo momento de la operación (no hay cola de envíos); el tiempo de espera es `EMAIL_TIMEOUT`.

## Correo de pedido despachado (SCRUM-427, 431 y 434)

El tipo de correo `order_shipped` ("Pedido despachado") se suma a los de recepción, pago exitoso y pago rechazado.
Su plantilla está en `backend/apps/core/domain/plantillas_correo/pedido_despachado.py` y el propietario puede
editarla desde el panel (Correos automáticos), igual que las otras.

Texto por defecto:

~~~
Asunto:   Tu pedido ya fue despachado · {{orderNumber}}
Resumen:  Tu compra va en camino.

Hola {{customerName}},

Tu pedido {{orderNumber}} ya fue despachado y va en camino.

Transportista: {{carrier}}
Código de seguimiento: {{trackingCode}}

Revisa el estado de tu pedido aquí (te pediremos el correo con el que compraste): {{trackingLink}}

Gracias por comprar en {{storeName}}.
~~~

Reglas de la plantilla:

- Solo se genera para pedidos que ya fueron enviados (`enviado`, `en_reparto` o `entregado`). Un pedido sin despachar,
  cancelado o con retiro en tienda no tiene correo de despacho.
- Las líneas cuyos datos no existen se omiten: si el pedido no tiene código de seguimiento, la línea
  "Código de seguimiento" no aparece (no queda una línea vacía). Lo mismo pasa con la línea del enlace si no hay
  dirección pública configurada.
- El texto por defecto está también en `frontend/src/features/admin/data/emailTemplates.ts`; si se cambia uno, hay que cambiar el otro.

## Envío del correo de despacho (SCRUM-431)

Cuando el propietario cambia un pedido a "Enviado" (En tránsito) desde el panel de Pedidos, el sistema envía el correo
`order_shipped` al comprador. Lo hace `backend/apps/core/infrastructure/notificaciones_pedido.py`, que usa la plantilla
de la tienda y el servicio de envío descrito arriba.

- Solo se envía al **entrar** en "Enviado": repetir el mismo estado no envía nada, y los otros estados no generan correo.
- Se envía **una sola vez por pedido**: en el pedido queda una marca en `entrega.notificaciones.order_shipped`
  (`enviado`, `codigo`, `fecha` e `intentos`). Si el pedido sale de "Enviado" y vuelve a entrar, no se duplica.
- Si el envío **falla**, el pedido igual cambia de estado, el fallo queda en el log y la marca guarda `enviado: false`;
  la próxima vez que el pedido entre en "Enviado" se reintenta.
- No se envía si el propietario desactivó la plantilla, si el pedido es con retiro en tienda o si el pedido no tiene
  un correo válido del comprador.
- La respuesta del cambio de estado trae `data.correo` con `enviado` y `codigo`, y la pantalla de Pedidos se lo muestra
  al propietario.

Códigos de `data.correo.codigo`: `enviado`, `ya_enviado`, `envio_en_curso`, `plantilla_desactivada`, `no_corresponde`,
`destinatario_invalido`, `error_de_envio` y `error_inesperado`.

Para probarlo a mano, con el buzón de prueba (Mailpit) levantado: en el panel de Pedidos abre un pedido con envío a
domicilio (no retiro), cámbialo a "Enviado" y mira el correo en `http://localhost:8025`.

## Enlace de seguimiento en el correo (SCRUM-434)

La variable `{{trackingLink}}` es el enlace al portal de seguimiento de la tienda con el número de orden ya escrito:

~~~
<STOREFRONT_PUBLIC_URL>/seguimiento?orden=ORD-20261022-ABCD
~~~

- **El correo del comprador nunca va en el enlace.** Quien lo abre ve el número de orden escrito y debe ingresar el correo
  de su compra para consultar el pedido (el acceso seguro del SCRUM-365 sigue igual: máximo 5 intentos fallidos por orden).
- El número de orden se codifica para que ningún carácter altere la dirección.
- La dirección base se configura con la variable `STOREFRONT_PUBLIC_URL` (`.env`; por defecto
  `http://localhost:5173/plantilla/1`, sin barra al final). **En producción hay que poner la dirección real de la tienda**,
  por ejemplo `https://mitienda.cl/plantilla/1`. Si no es una dirección `http` o `https` válida, el enlace no se agrega.
- La variable está disponible en todas las plantillas de correo y aparece en la lista de variables del panel.
- Está en el texto por defecto del correo de despacho; el propietario puede quitarla o moverla al editar su plantilla.
