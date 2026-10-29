"""Buyer-controlled double opt-in. No order, cookie or login is email verification."""
import hashlib
import secrets
from datetime import timedelta
from urllib.parse import urlencode, urlsplit

from django.conf import settings
from django.core import signing
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import constant_time_compare

from apps.core.models import ConsentimientoComercial, EventoConsentimiento, SolicitudConsentimiento

VERSION = 'correo-promocional-v1'
TEXT = 'Quiero recibir promociones, ofertas y novedades de esta tienda por correo electrónico. Puedo retirar mi autorización cuando quiera.'
GENERIC = 'Si corresponde, recibirás un enlace por correo. La autorización solo estará vigente después de confirmarla. Revisa también spam.'
MAX_AGE = {'confirmar': 86400, 'gestionar': 7 * 86400}


class InvalidLink(ValueError):
    pass


class DeliveryUnavailable(Exception):
    pass


def event(record, kind, challenge):
    EventoConsentimiento.objects.create(consentimiento=record, tipo=kind, revision=record.revision,
        version_texto=record.version_texto if kind == 'retirado' else challenge.version_texto,
        texto='Retirar autorización comercial' if kind == 'retirado' else TEXT, solicitud_id=challenge.pk)


@transaction.atomic
def request_link(store, email, purpose, template):
    origin = settings.COMMERCIAL_CONSENT_FRONTEND_ORIGIN.rstrip('/')
    parsed = urlsplit(origin)
    if (parsed.scheme not in ('http', 'https') or not parsed.netloc or parsed.path or parsed.query or parsed.fragment
            or parsed.username or parsed.password
            or (parsed.scheme == 'http' and parsed.hostname not in ('localhost', '127.0.0.1', '::1'))):
        raise DeliveryUnavailable()
    # Console/file transports would leak bearer links into application logs/files.
    if settings.EMAIL_BACKEND in ('django.core.mail.backends.console.EmailBackend',
                                  'django.core.mail.backends.filebased.EmailBackend',
                                  'django.core.mail.backends.dummy.EmailBackend'):
        raise DeliveryUnavailable()
    if purpose == 'gestionar' and not ConsentimientoComercial.objects.filter(tienda=store, email=email).exists():
        return
    record, _ = ConsentimientoComercial.objects.get_or_create(tienda=store, email=email, defaults={'estado': 'pendiente'})
    record = ConsentimientoComercial.objects.select_for_update().get(pk=record.pk)
    if purpose == 'confirmar' and record.estado == 'autorizado' and record.verificado:
        return
    now = timezone.now()
    active = SolicitudConsentimiento.objects.filter(consentimiento=record, proposito=purpose,
            revision=record.revision, fecha_consumida__isnull=True, fecha_vencimiento__gt=now)
    if active.filter(fecha_creacion__gt=now - timedelta(minutes=5)).exists():
        return
    active.update(fecha_vencimiento=now)
    if purpose == 'confirmar' and record.estado != 'pendiente':
        record.estado = 'pendiente'
        record.verificado = False
        record.save(update_fields=['estado', 'verificado'])
    challenge = SolicitudConsentimiento(consentimiento=record, proposito=purpose, revision=record.revision,
        version_texto=VERSION, fecha_vencimiento=now + timedelta(seconds=MAX_AGE[purpose]))
    token = signing.dumps({'id': str(challenge.pk), 'nonce': secrets.token_urlsafe(32)},
                          salt='commercial-consent:' + purpose, compress=False)
    challenge.token_hash = hashlib.sha256(token.encode()).hexdigest()
    challenge.save()
    if purpose == 'confirmar':
        event(record, 'solicitado', challenge)
    link = f'{origin}/plantilla/{template}/preferencias-comerciales#' + urlencode({'accion': purpose, 'token': token})
    management = ''
    if purpose == 'confirmar':
        # The same confirmation message includes a future-revision withdrawal
        # link, usable immediately after confirmation without another purchase.
        manage = SolicitudConsentimiento(consentimiento=record, proposito='gestionar',
            revision=record.revision + 1, version_texto=VERSION,
            confirmacion=challenge,
            fecha_vencimiento=now + timedelta(seconds=MAX_AGE['gestionar']))
        manage_token = signing.dumps({'id': str(manage.pk), 'nonce': secrets.token_urlsafe(32)},
                                    salt='commercial-consent:gestionar')
        manage.token_hash = hashlib.sha256(manage_token.encode()).hexdigest()
        manage.save()
        management = '\n\nDespués de confirmar, consulta o retira tu autorización aquí:\n' + f'{origin}/plantilla/{template}/preferencias-comerciales#' + urlencode({'accion': 'gestionar', 'token': manage_token})
    body = (f'Tienda: {store.nombre}\n\n' +
            (TEXT + '\n\nConfirma solo si tú solicitaste recibir publicidad. El enlace vence en 24 horas.'
             if purpose == 'confirmar' else 'Consulta o retira tu autorización comercial. El enlace vence en 7 días.') +
            f'\n\n{link}' + management + '\n\nSi no solicitaste este mensaje, ignóralo. No autoriza publicidad por sí solo.')
    try:
        sent = send_mail('Confirma tus preferencias comerciales', body, settings.DEFAULT_FROM_EMAIL, [email], fail_silently=False)
        if sent != 1:
            raise DeliveryUnavailable()
    except Exception:
        # Never include transport exceptions, recipient or token in responses/logs.
        raise DeliveryUnavailable() from None


def decode(token, purpose):
    try:
        value = signing.loads(token, salt='commercial-consent:' + purpose, max_age=MAX_AGE[purpose])
        from uuid import UUID
        return UUID(value['id'])
    except (signing.BadSignature, ValueError, TypeError, KeyError):
        raise InvalidLink() from None


@transaction.atomic
def use_link(store, token, purpose, action):
    pk = decode(token, purpose)
    # Lock in the same order as request_link to avoid deadlocks.
    candidate = SolicitudConsentimiento.objects.filter(pk=pk, consentimiento__tienda=store).values('consentimiento_id').first()
    if candidate is None:
        raise InvalidLink()
    record = ConsentimientoComercial.objects.select_for_update().get(pk=candidate['consentimiento_id'])
    challenge = SolicitudConsentimiento.objects.select_for_update().get(pk=pk)
    if (challenge.proposito != purpose or challenge.fecha_vencimiento <= timezone.now()
            or not constant_time_compare(challenge.token_hash, hashlib.sha256(token.encode()).hexdigest())):
        raise InvalidLink()
    if challenge.fecha_consumida:
        # A repeated successful operation is harmless, but cannot re-grant after withdrawal.
        if action == 'confirmar' and record.estado == 'autorizado' and record.verificado and record.revision == challenge.revision + 1:
            return {'estado': 'autorizado', 'verificado': True}
        if action == 'retirar' and record.estado == 'retirado' and record.revision == challenge.revision + 1:
            return {'estado': 'retirado', 'verificado': False}
        raise InvalidLink()
    if record.revision != challenge.revision:
        raise InvalidLink()
    if challenge.confirmacion_id and (not challenge.confirmacion.fecha_consumida
            or record.referencia_evidencia != 'email-link:' + str(challenge.confirmacion_id)):
        raise InvalidLink()
    if action == 'consultar' and purpose == 'gestionar':
        return {'estado': 'pendiente' if record.estado == 'autorizado' and not record.verificado else record.estado, 'verificado': record.verificado,
                'fecha_autorizacion': record.fecha_autorizacion, 'fecha_retirada': record.fecha_retirada,
                'fecha_actualizacion': record.fecha_actualizacion, 'version_texto': record.version_texto}
    now = timezone.now()
    if action == 'confirmar' and purpose == 'confirmar' and challenge.version_texto == VERSION:
        record.estado = 'autorizado'
        record.verificado = True
        record.fecha_autorizacion = record.fecha_verificacion = now
        record.fecha_actualizacion = now
        record.version_texto = VERSION
        record.referencia_evidencia = 'email-link:' + str(challenge.pk)
        record.revision += 1
    elif action == 'retirar' and purpose == 'gestionar':
        if record.estado == 'retirado':
            return {'estado': 'retirado', 'verificado': False}
        record.estado = 'retirado'
        # Model save updates withdrawal time, revision and verification atomically.
    else:
        raise InvalidLink()
    record.save()
    challenge.fecha_consumida = now
    challenge.save(update_fields=['fecha_consumida'])
    event(record, record.estado, challenge)
    return {'estado': record.estado, 'verificado': record.verificado}
