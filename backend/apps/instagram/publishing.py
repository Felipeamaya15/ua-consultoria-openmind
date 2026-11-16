"""Durable reservations before remote writes. Unknown outcomes are never resent."""
import hashlib
from io import BytesIO
from datetime import timedelta
from urllib.parse import urlencode
from PIL import Image, ImageOps
from django.conf import settings
from django.core import signing
from django.core.files.base import ContentFile
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from apps.core.models import Tienda
from .models import ConexionInstagram, PublicacionInstagram
from . import provider


def connection_state(store):
    row = ConexionInstagram.objects.filter(tienda=store).first()
    connected = bool(row and row.token_cifrado and row.estado == 'conectada'
        and row.token_tipo == 'SYSTEM_USER' and row.config_id == settings.INSTAGRAM_CONFIG_ID
        and (row.vence_en is None or row.vence_en > timezone.now()))
    state = row.estado if row else 'desconectada'
    if row and row.token_cifrado and row.vence_en and row.vence_en <= timezone.now():
        state = 'vencida'
    if connected:
        try:
            provider.decrypt(row.token_cifrado)
        except provider.InstagramError:
            connected, state = False, 'reconectar'
    configured = provider.configured()
    public = provider.https_origin(settings.INSTAGRAM_MEDIA_PUBLIC_ORIGIN, public=True)
    return {'conectado': connected, 'estado': state, 'usuario': row.nombre_usuario if row else '',
        'vence_en': row.vence_en if row else None, 'oauth_configurado': configured,
        'publicacion_habilitada': bool(connected and configured and public and settings.INSTAGRAM_PUBLISHING_ENABLED),
        'publicacion_externa_permitida': settings.INSTAGRAM_PUBLISHING_ENABLED,
        'media_https_configurada': public, 'callback_url': settings.INSTAGRAM_REDIRECT_URI,
        'tipo_token': 'SYSTEM_USER', 'renovacion': 'reautorizar',
        'sin_vencimiento_programado': bool(connected and row.vence_en is None)}


def active_connection(store, lock=False):
    qs = ConexionInstagram.objects.select_for_update() if lock else ConexionInstagram.objects
    connection = qs.filter(tienda=store).first()
    if (not connection or not connection.token_cifrado or connection.estado != 'conectada'
            or connection.token_tipo != 'SYSTEM_USER' or connection.config_id != settings.INSTAGRAM_CONFIG_ID
            or connection.vence_en is not None and connection.vence_en <= timezone.now()):
        raise ValidationError('Conecta de nuevo una cuenta profesional de Instagram antes de continuar.')
    if not set(provider.SCOPES).issubset(connection.permisos):
        raise ValidationError('Faltan los permisos de Instagram para publicar.')
    return connection


def publication_data(row):
    return {'id': str(row.pk), 'descripcion': row.descripcion, 'estado': row.estado,
        'usuario_instagram': row.usuario_instagram, 'contenedor_id': row.contenedor_id,
        'media_id': row.media_id, 'codigo': row.codigo, 'creada_en': row.creada_en,
        'actualizado_en': row.actualizado_en, 'confirmada_en': row.confirmada_en}


def jpeg_upload(upload):
    if not upload or upload.size > 8 * 1024 * 1024:
        raise ValidationError('Selecciona el JPG cuadrado del editor, de hasta 8 MB.')
    try:
        raw = upload.read(8 * 1024 * 1024 + 1)
        with Image.open(BytesIO(raw)) as image:
            if image.format != 'JPEG' or image.size != (1080, 1080) or getattr(image, 'n_frames', 1) != 1:
                raise ValueError()
            image.load()
            result = BytesIO()
            ImageOps.exif_transpose(image).convert('RGB').save(result, 'JPEG', quality=92, optimize=True)
        return result.getvalue()
    except (ValueError, OSError, Image.DecompressionBombError):
        raise ValidationError('Solo se admite un JPG individual de 1080 × 1080 generado por el editor.') from None


@transaction.atomic
def prepare(store, owner, key, description, upload):
    Tienda.objects.select_for_update().get(pk=store.pk)
    connection = active_connection(store, lock=True)
    image = jpeg_upload(upload)
    digest = hashlib.sha256(image).hexdigest()
    fingerprint = hashlib.sha256((digest + '\n' + description).encode()).hexdigest()
    row = PublicacionInstagram.objects.filter(tienda=store, clave=key).first()
    if row and (row.huella != fingerprint or row.usuario_instagram != connection.usuario_instagram):
        raise ValidationError('Esta clave ya identifica otro contenido. Prepara una publicación nueva.')
    row = row or PublicacionInstagram.objects.filter(tienda=store, usuario_instagram=connection.usuario_instagram, huella=fingerprint).first()
    if row:
        if row.estado == 'preparada' and (row.generacion != connection.generacion or row.imagen_vence_en <= timezone.now()):
            row.generacion = connection.generacion
            if row.imagen_vence_en <= timezone.now():
                row.imagen.delete(save=False)
                row.imagen.save(str(row.id)+'.jpg', ContentFile(image), save=False)
                row.imagen_vence_en = timezone.now()+timedelta(hours=1)
            row.save(update_fields=['generacion', 'imagen', 'imagen_vence_en', 'actualizado_en'])
        return row
    if PublicacionInstagram.objects.filter(tienda=store, creada_en__gte=timezone.now()-timedelta(days=1)).count() >= 100:
        raise ValidationError('Se alcanzó el límite diario de preparaciones. Revisa el historial.')
    row = PublicacionInstagram(tienda=store, autor=owner, clave=key, usuario_instagram=connection.usuario_instagram,
        generacion=connection.generacion, huella=fingerprint, imagen_sha256=digest,
        imagen_vence_en=timezone.now()+timedelta(hours=1), descripcion=description)
    row.imagen.save(str(row.id) + '.jpg', ContentFile(image), save=False)
    row.save()
    return row


def image_url(row):
    if not provider.https_origin(settings.INSTAGRAM_MEDIA_PUBLIC_ORIGIN, public=True):
        raise ValidationError('Configura un origen HTTPS público para la imagen temporal de Instagram.')
    token = signing.dumps({'id': str(row.pk), 'sha': row.imagen_sha256, 'exp': int(row.imagen_vence_en.timestamp())}, salt='instagram-temporal-v1', compress=True)
    return settings.INSTAGRAM_MEDIA_PUBLIC_ORIGIN + '/api/instagram/imagenes/' + str(row.pk) + '/?' + urlencode({'firma': token})


def allowed():
    if not settings.INSTAGRAM_PUBLISHING_ENABLED:
        raise ValidationError('La publicación externa en Instagram está deshabilitada por el administrador.')


def verify_grant(row, connection):
    if row.usuario_instagram != connection.usuario_instagram or row.generacion != connection.generacion:
        raise ValidationError('La autorización cambió. Prepara de nuevo esta publicación con la cuenta actual.')


def record_error(row, error, connection):
    row.estado = 'indeterminada' if error.uncertain else 'fallida'
    row.codigo = error.code
    row.save(update_fields=['estado', 'codigo', 'actualizado_en'])
    if error.code == 'reconectar_instagram':
        connection.estado = 'reconectar'
        connection.save(update_fields=['estado', 'actualizado_en'])


def confirm(store, pk):
    allowed()
    with transaction.atomic():
        Tienda.objects.select_for_update().get(pk=store.pk)
        connection = active_connection(store, lock=True)
        row = get_object_or_404(PublicacionInstagram.objects.select_for_update(), pk=pk, tienda=store)
        verify_grant(row, connection)
        if row.estado != 'preparada':
            return row
        if not row.imagen or row.imagen_vence_en <= timezone.now():
            raise ValidationError('La imagen temporal venció. Prepara otra publicación desde el editor.')
        if PublicacionInstagram.objects.filter(tienda=store, confirmada_en__gte=timezone.now()-timedelta(days=1)).count() >= settings.INSTAGRAM_DAILY_LIMIT:
            raise ValidationError('Se alcanzó el límite diario de publicaciones de esta tienda.')
        image_url(row)  # Validate the public origin before reserving a remote write.
        row.estado, row.confirmada_en = 'creando', timezone.now()
        row.save(update_fields=['estado', 'confirmada_en', 'actualizado_en'])
    # The reservation survives a worker crash. Concurrent confirmations cannot create a second container.
    with transaction.atomic():
        Tienda.objects.select_for_update().get(pk=store.pk)
        connection = active_connection(store, lock=True)
        row = PublicacionInstagram.objects.select_for_update().get(pk=pk, tienda=store)
        verify_grant(row, connection)
        allowed()
        try:
            body = provider.request('POST', provider.api(connection.usuario_instagram + '/media'),
                token=provider.decrypt(connection.token_cifrado), data={'image_url': image_url(row), 'caption': row.descripcion})
            try:
                row.contenedor_id = provider.identifier(body.get('id', ''))
            except provider.InstagramError:
                raise provider.InstagramError('respuesta_instagram_invalida', True) from None
            row.estado = 'procesando'
            row.save(update_fields=['contenedor_id', 'estado', 'actualizado_en'])
        except provider.InstagramError as error:
            record_error(row, error, connection)
            return row
    return progress(store, pk)


def progress(store, pk):
    with transaction.atomic():
        Tienda.objects.select_for_update().get(pk=store.pk)
        connection = active_connection(store, lock=True)
        row = get_object_or_404(PublicacionInstagram.objects.select_for_update(), pk=pk, tienda=store)
        verify_grant(row, connection)
        if row.estado in ('publicada', 'fallida', 'preparada'):
            return row
        if not row.contenedor_id:
            if row.actualizado_en < timezone.now()-timedelta(minutes=2):
                row.estado, row.codigo = 'indeterminada', 'resultado_no_confirmado'
                row.save(update_fields=['estado', 'codigo', 'actualizado_en'])
            return row
        try:
            body = provider.request('GET', provider.api(row.contenedor_id), token=provider.decrypt(connection.token_cifrado), params={'fields': 'status_code'})
            state = body.get('status_code')
            if state == 'PUBLISHED':
                row.estado, row.codigo = 'publicada', 'publicacion_confirmada_por_contenedor'
            elif state in ('ERROR', 'EXPIRED'):
                row.estado, row.codigo = 'fallida', 'contenedor_' + state.lower()
            elif row.publicacion_iniciada_en:
                row.estado, row.codigo = 'indeterminada', 'resultado_no_confirmado'
            elif state == 'FINISHED':
                allowed()
                row.estado, row.publicacion_iniciada_en = 'publicando', timezone.now()
            elif state != 'IN_PROGRESS':
                raise provider.InstagramError('estado_contenedor_desconocido')
            row.save(update_fields=['estado', 'codigo', 'publicacion_iniciada_en', 'actualizado_en'])
        except provider.InstagramError as error:
            # Reading status is safe to repeat. Never turn an uncertain publish into a fresh POST.
            row.codigo = error.code
            row.save(update_fields=['codigo', 'actualizado_en'])
            if error.code == 'reconectar_instagram':
                connection.estado = 'reconectar'
                connection.save(update_fields=['estado', 'actualizado_en'])
            return row
    if row.estado != 'publicando':
        return row
    # Durable marker committed before calling media_publish.
    with transaction.atomic():
        Tienda.objects.select_for_update().get(pk=store.pk)
        connection = active_connection(store, lock=True)
        row = PublicacionInstagram.objects.select_for_update().get(pk=pk, tienda=store)
        verify_grant(row, connection)
        allowed()
        try:
            body = provider.request('POST', provider.api(connection.usuario_instagram + '/media_publish'),
                token=provider.decrypt(connection.token_cifrado), data={'creation_id': row.contenedor_id})
            try:
                row.media_id = provider.identifier(body.get('id', ''))
            except provider.InstagramError:
                raise provider.InstagramError('respuesta_instagram_invalida', True) from None
            row.estado, row.codigo = 'publicada', 'publicada'
            row.save(update_fields=['media_id', 'estado', 'codigo', 'actualizado_en'])
        except provider.InstagramError as error:
            record_error(row, error, connection)
        return row
