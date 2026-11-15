"""Correo autorizado para consultas y marketing; no altera los eventos transaccionales."""
import base64
import hashlib
import json
import re
import smtplib
import socket
from datetime import timedelta
from email.message import EmailMessage
from email.utils import formataddr
from email.mime.image import MIMEImage

import requests
from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.db import transaction, ProgrammingError, OperationalError, connection as db_connection
from django.utils import timezone
from rest_framework.exceptions import Throttled

from apps.core.infrastructure.email_service import correo_valido, es_entorno_local, _html, _remitente
from apps.core.infrastructure.gmail_token_crypto import descifrar_token
from apps.core.models import ConexionGmailTienda, Tienda
from apps.core.mail_authorization import valid_grant


def local_transport():
    return settings.STORE_MAIL_TRANSPORT in ('auto', 'mailpit') and (settings.EMAIL_BACKEND == 'django.core.mail.backends.locmem.EmailBackend' or (
        settings.EMAIL_BACKEND == 'django.core.mail.backends.smtp.EmailBackend' and es_entorno_local())
    )


def connection_state(store):
    connection = ConexionGmailTienda.objects.filter(tienda=store).first()
    connected = bool(connection and connection.correo_autorizado and connection.refresh_token_cifrado)
    local = local_transport()
    configured = all(getattr(settings, key, '') for key in (
        'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'))
    try:
        from apps.core.infrastructure.gmail_token_crypto import _obtener_cifrador
        _obtener_cifrador()
        if connected:
            descifrar_token(connection.refresh_token_cifrado)
        crypto_ok = True
    except (ValueError, RuntimeError, UnicodeError):
        crypto_ok = False
    try:
        with transaction.atomic():
            last = store.enviocorreotienda_set.filter(proveedor='gmail').exclude(codigo='').order_by('-creado').first()
        schema_ready = True
    except (ProgrammingError, OperationalError):
        last, schema_ready = None, False
    authorized = valid_grant(connection, store)
    problem = connected and (not authorized or not crypto_ok or bool(last and last.codigo == 'reconectar'
        and last.creado > (connection.autorizacion_fecha or connection.actualizado_en)))
    enabled = schema_ready and (local or bool(connected and authorized and not problem and crypto_ok and configured and settings.STORE_MAIL_EXTERNAL_ENABLED
        and settings.STORE_MAIL_TRANSPORT in ('auto', 'gmail')))
    return {'conectado': connected, 'correo': connection.correo_autorizado if connected else '',
        'oauth_configurado': configured and crypto_ok, 'modo': 'mailpit' if local else 'gmail',
        'estado': 'reconectar' if problem else 'conectado' if connected else 'desconectado',
        'envio_habilitado': enabled,
        'autorizacion_vigente': authorized, 'correo_negocio': store.correo_negocio,
        'autorizacion_fecha': connection.autorizacion_fecha if authorized else None,
        'autorizacion_version': connection.autorizacion_version if authorized else '',
        'aviso': 'La actualización de correos está pendiente de aplicar por el administrador.' if not schema_ready else
            'Los mensajes se capturan en el buzón de pruebas Mailpit.' if local else
            'Vuelve a conectar la cuenta de Gmail.' if problem else
            'El envío externo requiere habilitación del administrador.' if not settings.STORE_MAIL_EXTERNAL_ENABLED else
            'Se utilizará exclusivamente la cuenta de Gmail autorizada.' if enabled else 'Conecta una cuenta de Gmail autorizada.'}


def _gmail(message, connection):
    """No retries HTTP: messages.send no ofrece una clave de idempotencia del proveedor."""
    from apps.core.infrastructure.google_gmail import _configuracion
    try:
        client_id, client_secret, _ = _configuracion()
        token = descifrar_token(connection.refresh_token_cifrado)
    except (ValueError, RuntimeError, AttributeError):
        return 'fallida', 'reconectar'
    # Un fallo al renovar ocurre antes de enviar el MIME y es reintentable.
    try:
        refreshed = requests.post('https://oauth2.googleapis.com/token', data={
            'client_id': client_id, 'client_secret': client_secret,
            'refresh_token': token, 'grant_type': 'refresh_token'}, timeout=8)
        if refreshed.status_code in (400, 401, 403):
            return 'fallida', 'reconectar'
        if not refreshed.ok:
            return 'fallida', 'proveedor_no_disponible'
        access_token = refreshed.json().get('access_token')
        if not access_token:
            return 'fallida', 'reconectar'
    except (requests.RequestException, ValueError):
        return 'fallida', 'proveedor_no_disponible'
    try:
        response = requests.post('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
            headers={'Authorization': 'Bearer ' + access_token},
            json={'raw': base64.urlsafe_b64encode(message.as_bytes()).decode('ascii')}, timeout=8)
        if response.ok and response.json().get('id'):
            return 'aceptada', 'aceptado_gmail'
        if response.status_code == 403:
            reasons = [item.get('reason') for item in response.json().get('error', {}).get('errors', [])]
            if any(reason in ('rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded', 'quotaExceeded') for reason in reasons):
                return 'fallida', 'limite_proveedor'
        if response.status_code in (401, 403):
            return 'fallida', 'reconectar'
        if response.status_code == 429:
            return 'fallida', 'limite_proveedor'
        if 400 <= response.status_code < 500:
            return 'fallida', 'rechazado_proveedor'
    except (requests.RequestException, ValueError):
        pass
    return 'indeterminada', 'resultado_incierto'


def send_store_mail(store, key, recipient, subject, body, *, category, html='', headers=None, local_sender=None, reference=None):
    from apps.landing.models import EnvioCorreoTienda
    fingerprint = hashlib.sha256(json.dumps([recipient, subject, body, html, category, headers or {}, str(reference)], sort_keys=True).encode()).hexdigest()
    with transaction.atomic():
        Tienda.objects.select_for_update().get(pk=store.pk)
        previous = EnvioCorreoTienda.objects.filter(tienda=store, clave=key).first()
        if previous:
            if previous.huella != fingerprint:
                raise ValueError('La clave de envío ya corresponde a otro contenido. Actualiza el historial.')
            return previous
        state = connection_state(store)
        if not state['envio_habilitado']:
            raise ValueError('El correo autorizado no está disponible. Revisa la conexión.')
        local = local_transport()
        provider = 'mailpit' if local else 'gmail'
        account = state['correo'].lower() if not local else str(settings.DEFAULT_FROM_EMAIL)
        account_hash = hashlib.sha256((provider + ':' + account).encode()).hexdigest()
        if db_connection.vendor == 'postgresql':
            # Same authenticated provider account can be reused by multiple stores.
            # Lock its quota reservation even when their store row locks differ.
            advisory_key = int.from_bytes(bytes.fromhex(account_hash[:16]), 'big', signed=True)
            with db_connection.cursor() as cursor:
                cursor.execute('SELECT pg_advisory_xact_lock(%s)', [advisory_key])
        now = timezone.now()
        rows = EnvioCorreoTienda.objects.filter(tienda=store)
        for hours, limit in ((1, settings.STORE_MAIL_HOURLY_LIMIT), (24, settings.STORE_MAIL_DAILY_LIMIT)):
            if rows.filter(creado__gte=now-timedelta(hours=hours)).count() >= limit:
                raise Throttled(detail='Se alcanzó el límite de correos de la tienda. Conservamos los pendientes.')
        # Provider-account reservations are serialized across stores in this DB.
        if EnvioCorreoTienda.objects.filter(cuenta_hash=account_hash,
                creado__gte=now-timedelta(days=1)).count() >= settings.STORE_MAIL_PROVIDER_DAILY_LIMIT:
            raise Throttled(detail='Se alcanzó el límite diario del proveedor. Conservamos los pendientes.')
        entry = EnvioCorreoTienda.objects.create(tienda=store, clave=key, categoria=category,
            destinatario=recipient, proveedor=provider, cuenta_hash=account_hash,
            referencia=reference, huella=fingerprint)
    status, code = 'fallida', 'contenido_invalido'
    if correo_valido(recipient) and subject.strip() and body.strip() and len(subject) <= 200 and not any(c in subject for c in '\r\n\x00'):
        connection = ConexionGmailTienda.objects.filter(tienda=store).first() if not local else None
        sender = _remitente(store.nombre) if local else formataddr((store.nombre, connection.correo_autorizado))
        mime = EmailMessage()
        mime['From'], mime['To'], mime['Subject'] = sender, recipient, subject
        mime['Message-ID'] = f'<{key}.store-{store.pk}@openmind.invalid>'
        if correo_valido(store.correo_negocio):
            mime['Reply-To'] = store.correo_negocio if local else connection.correo_autorizado
        for name, value in (headers or {}).items():
            mime[name] = value
        inline = []
        def embed(match):
            subtype, encoded = match.groups()
            raw = base64.b64decode(encoded, validate=True)
            cid = f'image-{len(inline)}-{key}@openmind.invalid'
            inline.append((cid, raw, subtype))
            return 'src="cid:' + cid + '"'
        prepared_html = re.sub(r'src="data:image/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)"', embed, html or _html(body, ''))
        mime.set_content(body)
        mime.add_alternative(prepared_html, subtype='html')
        for cid, raw, subtype in inline:
            mime.get_payload()[-1].add_related(raw, maintype='image', subtype=subtype, cid='<' + cid + '>')
        try:
            if local:
                if local_sender:
                    result = local_sender()
                    definitive = result.codigo in ('destinatario_invalido', 'contenido_invalido') or result.detalle in (
                        'SMTPRecipientsRefused', 'SMTPSenderRefused', 'SMTPAuthenticationError', 'SMTPConnectError',
                        'SMTPDataError', 'ConnectionRefusedError', 'gaierror')
                    status = 'aceptada' if result.enviado else 'fallida' if definitive else 'indeterminada'
                    code = result.codigo
                else:
                    mail = EmailMultiAlternatives(subject, body, sender, [recipient],
                        reply_to=[mime['Reply-To']] if mime['Reply-To'] else None,
                        headers={**(headers or {}), 'Message-ID': mime['Message-ID']},
                        connection=get_connection(timeout=8))
                    mail.attach_alternative(prepared_html, 'text/html')
                    if inline:
                        mail.mixed_subtype = 'related'
                    for cid, raw, subtype in inline:
                        image = MIMEImage(raw, _subtype=subtype)
                        image.add_header('Content-ID', '<' + cid + '>')
                        image.add_header('Content-Disposition', 'inline')
                        mail.attach(image)
                    status, code = ('aceptada', 'enviado_local') if mail.send() == 1 else ('fallida', 'rechazado_proveedor')
            else:
                # La reserva ya está confirmada. Volver a bloquear la tienda
                # serializa el envío con baja, cambio de cuenta y reconexión.
                with transaction.atomic():
                    current_store = Tienda.objects.select_for_update().get(pk=store.pk)
                    current_connection = ConexionGmailTienda.objects.select_for_update().filter(tienda=store).first()
                    current_state = connection_state(current_store)
                    unchanged = bool(current_connection
                        and current_connection.correo_autorizado.lower() == state['correo'].lower()
                        and current_connection.autorizacion_fecha == state['autorizacion_fecha'])
                    if not unchanged or not current_state['envio_habilitado']:
                        status, code = 'fallida', 'autorizacion_cambiada'
                    else:
                        status, code = _gmail(mime, current_connection)
        except (smtplib.SMTPRecipientsRefused, smtplib.SMTPSenderRefused, smtplib.SMTPAuthenticationError,
                smtplib.SMTPConnectError, smtplib.SMTPDataError, ConnectionRefusedError, socket.gaierror):
            status, code = 'fallida', 'rechazado_proveedor'
        except Exception:
            # No tokens, provider bodies, addresses or exception strings in logs/responses.
            status, code = 'indeterminada', 'resultado_incierto'
    entry.estado, entry.codigo, entry.finalizado = status, code, timezone.now()
    entry.save(update_fields=['estado', 'codigo', 'finalizado'])
    return entry
