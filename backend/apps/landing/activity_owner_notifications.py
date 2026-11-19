
"""Avisos al emprendedor sobre consultas nuevas."""
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
