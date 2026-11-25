"""Procesamiento conservador de recordatorios comerciales."""
import logging
import os
from datetime import timedelta
from urllib.parse import urlsplit, urlencode
from uuid import uuid5, NAMESPACE_URL

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.core.models import Tienda, Pedido
from apps.core.infrastructure.contacts import eligible_consents
from apps.core.infrastructure.store_mail import (
    connection_state, send_store_mail
)
from apps.landing.campaign_delivery import SALT
from apps.landing.models import RegistroCarritoAbandonado, EnvioCorreoTienda

logger = logging.getLogger(__name__)


def origin(value):
    value = str(value or "").strip()
    p = urlsplit(value)

    if (
        not p.hostname
        or p.username
        or p.password
        or p.query
        or p.fragment
        or p.path not in ("", "/")
    ):
        return ""

    if p.scheme == "https":
        return value.rstrip("/")

    if p.scheme == "http" and p.hostname in (
        "localhost", "127.0.0.1", "testserver"
    ):
        return value.rstrip("/")

    return ""


def completed_checkout(row):
    # También bloquea recordatorios si el pedido sigue pendiente:
    # un cliente que ya inició el pago no debe recibir publicidad.
    return Pedido.objects.filter(
        tienda_id=row.tienda_id,
        fecha_creacion__gte=row.ultima_actividad,
    ).filter(
        Q(comprador_id=row.usuario_id)
        | Q(correo_contacto__iexact=row.email)
    ).exists()


def consent_for(store, row):
    return eligible_consents(store).filter(
        email=row.email
    ).first()


def recovery_links(store, row, consent):
    frontend = origin(
        os.environ.get("CART_REMINDER_PUBLIC_STORE_URL")
        or os.environ.get("STOREFRONT_PUBLIC_URL")
    )
    api = origin(
        getattr(settings, "STORE_MAIL_PUBLIC_API_URL", "")
    )

    if not frontend or not api:
        return None

    if (
        not row.ruta.startswith("/")
        or row.ruta.startswith("//")
        or ".." in row.ruta
    ):
        return None

    # Reutilizar la baja firmada del sistema de campañas:
    # retirar consentimiento bloquea ambos tipos de mensajes.
    reference = uuid5(
        NAMESPACE_URL,
        f"openmind:carrito:{store.pk}:{row.pk}"
    )

    token = signing.dumps({
        "tienda": store.pk,
        "contacto": consent.pk,
        "revision": consent.revision,
        "campana": str(reference),
    }, salt=SALT)

    return (
        frontend + row.ruta,
        api + "/api/tienda/campanas/baja/?" +
        urlencode({"token": token}),
    )



def reminder_frequency_blocked(store, row):
    """Limita intentos por tienda y correo, incluidos los inciertos."""
    try:
        hours = int(os.environ.get(
            "CART_REMINDER_MIN_GAP_HOURS", "168"
        ))
    except (ValueError, TypeError):
        hours = 168

    hours = max(24, min(hours, 720))

    return EnvioCorreoTienda.objects.filter(
        tienda=store,
        categoria="recordatorio_carrito",
        destinatario=row.email,
        creado__gte=timezone.now() - timedelta(hours=hours),
    ).exists()


def process_one(pk):
    with transaction.atomic():
        original = RegistroCarritoAbandonado.objects.filter(
            pk=pk
        ).first()

        if original is None:
            return "omitido"

        store = Tienda.objects.select_for_update().get(
            pk=original.tienda_id
        )

        from apps.landing.commerce import commerce_options, reminders_allowed
        if not reminders_allowed() or not commerce_options(store)['recordatorios']:
            return 'deshabilitado'

        row = RegistroCarritoAbandonado.objects.select_for_update().get(
            pk=pk
        )

        if row.estado != "activo" or not row.items:
            return "omitido"

        if row.ultima_actividad > timezone.now() - timedelta(hours=2):
            return "esperando"

        consent = consent_for(store, row)

        if consent is None:
            row.estado = "excluido"
            row.save(update_fields=["estado"])
            return "excluido"

        if completed_checkout(row):
            row.estado = "comprado"
            row.save(update_fields=["estado"])
            return "comprado"

        if recovery_links(store, row, consent) is None:
            return "sin_enlaces"

        if not connection_state(store)["envio_habilitado"]:
            return "correo_no_disponible"

        # Reservar el intento de forma durable antes de SMTP.
        row.estado = "procesando"
        row.save(update_fields=["estado"])

    try:
        with transaction.atomic():
            store = Tienda.objects.select_for_update().get(
                pk=original.tienda_id
            )

            row = RegistroCarritoAbandonado.objects.select_for_update().get(
                pk=pk
            )

            if not commerce_options(store)['recordatorios'] or not reminders_allowed():
                row.estado = 'activo'
                row.save(update_fields=['estado'])
                return 'deshabilitado'

            if row.estado != "procesando":
                return "omitido"

            consent = eligible_consents(store).select_for_update().filter(email=row.email).first()

            if consent is None:
                row.estado = "excluido"
                row.save(update_fields=["estado"])
                return "excluido"

            if completed_checkout(row):
                row.estado = "comprado"
                row.save(update_fields=["estado"])
                return "comprado"

            if reminder_frequency_blocked(store, row):
                row.estado = "frecuencia_limitada"
                row.save(update_fields=["estado"])
                return "frecuencia_limitada"

            urls = recovery_links(store, row, consent)

            if urls is None:
                row.estado = "indeterminada"
                row.save(update_fields=["estado"])
                return "sin_enlaces"

            cart_url, unsubscribe_url = urls

            lines = [
                f"- {item['nombre']} (cantidad: {item['cantidad']})"
                for item in row.items
            ]

            body = "\n".join([
                f"Hola, tu carrito de {store.nombre} sigue disponible.",
                "",
                "Estos son los artículos que dejaste pendientes:",
                *lines,
                "",
                "Volver al carrito:",
                cart_url,
                "",
                "Inicia sesión con la misma cuenta para continuar.",
                "Los precios y la disponibilidad se comprobarán al pagar.",
                "",
                "Dejar de recibir promociones y recordatorios:",
                unsubscribe_url,
            ])

            key = uuid5(
                NAMESPACE_URL,
                f"openmind:recordatorio:{store.pk}:{row.pk}:"
                f"{row.ultima_actividad.isoformat()}"
            )

            result = send_store_mail(
                store,
                key,
                row.email,
                f"Tu carrito te espera en {store.nombre}"[:200],
                body,
                category="recordatorio_carrito",
                reference=key,
                headers={
                    "List-Unsubscribe": f"<{unsubscribe_url}>"
                },
            )

            row.estado = (
                result.estado
                if result.estado in (
                    "aceptada", "fallida", "indeterminada"
                )
                else "indeterminada"
            )
            row.save(update_fields=["estado"])
            return row.estado

    except Exception:
        # Si SMTP tuvo un resultado incierto, no reintentar
        # automáticamente: podría duplicar un mensaje.
        logger.warning(
            "Recordatorio de carrito %s requiere revisión.",
            pk,
        )
        return "revision"


def process_reminders(limit=25):
    if os.environ.get("CART_REMINDERS_ENABLED", "0") != "1":
        return {"deshabilitado": True}

    ids = list(
        RegistroCarritoAbandonado.objects.filter(
            estado="activo",
            ultima_actividad__lte=(
                timezone.now() - timedelta(hours=2)
            ),
        )
        .order_by("ultima_actividad")
        .values_list("pk", flat=True)[:limit]
    )

    results = {}

    for pk in ids:
        try:
            state = process_one(pk)
        except Exception:
            logger.warning(
                "No se pudo procesar el carrito %s.",
                pk,
            )
            state = "error"

        results[state] = results.get(state, 0) + 1

    return results
