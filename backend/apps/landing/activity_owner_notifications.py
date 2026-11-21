
"""Avisos operacionales al emprendedor, con el transporte y libro existentes."""
import logging
from uuid import NAMESPACE_URL, uuid5

from django.db import transaction
from django.core.validators import validate_email
from django.core.exceptions import ValidationError

from apps.landing.models import SolicitudActividad
from apps.core.infrastructure.store_mail import send_store_mail

logger = logging.getLogger(__name__)


def enviar_aviso_consulta(pk):
    consulta = (
        SolicitudActividad.objects.select_related("tienda")
        .filter(pk=pk, tipo="consulta")
        .first()
    )

    if not consulta:
        return None

    tienda = consulta.tienda
    destinatario = (tienda.correo_negocio or "").strip().lower()

    if not destinatario:
        return None

    try:
        validate_email(destinatario)
    except ValidationError:
        return None

    clave = uuid5(
        NAMESPACE_URL,
        f"openmind:consulta:{consulta.pk}"
    )

    asunto = f"Nueva consulta - {consulta.titulo_actividad[:150]}"

    cuerpo = "\n".join([
        f"Recibiste una nueva consulta en {tienda.nombre}.",
        "",
        f"Actividad: {consulta.titulo_actividad}",
        f"Tipo: {consulta.tipo_actividad}",
        f"Cliente: {consulta.nombre} {consulta.apellido}",
        f"Correo: {consulta.email}",
        f"Teléfono: {consulta.telefono or 'No informado'}",
        "",
        "Mensaje:",
        consulta.mensaje,
        "",
        "Revisa y responde desde el panel de emprendedor.",
    ])

    return send_store_mail(
        tienda,
        clave,
        destinatario,
        asunto,
        cuerpo,
        category="aviso_consulta",
        reference=consulta.pk,
    )


def programar_aviso_consulta(pk):
    def notificar():
        try:
            enviar_aviso_consulta(pk)
        except Exception:
            logger.warning(
                "No se confirmó el aviso de consulta %s.",
                pk,
            )

    transaction.on_commit(notificar)


def enviar_aviso_inscripcion(order_id):
    from apps.core.models import Pedido
    from apps.landing.models import ReservaActividadPagada
    from apps.landing.transfer_activity_orders import REAL_MARKERS
    from apps.core.infrastructure.store_mail import local_transport

    order = Pedido.objects.select_related('tienda').filter(pk=order_id).first()
    if not order or order.estado not in Pedido.ESTADOS_PAGADOS:
        return None
    delivery = order.entrega or {}
    if delivery.get('origen') not in REAL_MARKERS or not order.clave_checkout:
        return None
    environment = ((delivery.get('webpay_actividad') or {}).get('ambiente')
                   or (delivery.get('pago_actividad_externo') or {}).get('ambiente'))
    if environment in ('INTEGRACION', 'SANDBOX') and not local_transport():
        return None
    recipient = (order.tienda.correo_negocio or '').strip().lower()
    try:
        validate_email(recipient)
    except ValidationError:
        return None
    rows = list(ReservaActividadPagada.objects.filter(tienda_id=order.tienda_id,
        clave_checkout=order.clave_checkout, estado='confirmada').order_by('pk'))
    if not rows:
        return None
    key = uuid5(NAMESPACE_URL, f'openmind:inscripcion-pagada:{order.pk}:{order.clave_checkout}')
    body = '\n'.join([
        f'Recibiste una inscripción pagada en {order.tienda.nombre}.',
        f'Pedido: {order.identificador}',
        f'Cliente: {order.nombre_contacto}',
        '',
        *[f"{row.condiciones.get('titulo', 'Actividad')}: {row.cantidad} participante(s)" for row in rows],
        '',
        f'Total del pedido: ${order.monto_total} CLP',
        'Revisa las inscripciones y los productos del pedido desde el panel de emprendedor.',
    ])
    return send_store_mail(order.tienda, key, recipient,
        f'Nueva inscripción pagada - {order.identificador}'[:200], body,
        category='aviso_inscripcion', reference=order.clave_checkout)


def programar_aviso_inscripcion(order_id):
    def notificar():
        try:
            enviar_aviso_inscripcion(order_id)
        except Exception:
            logger.warning('No se confirmó el aviso de inscripción del pedido %s.', order_id)
    transaction.on_commit(notificar)
