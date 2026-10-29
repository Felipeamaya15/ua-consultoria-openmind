"""Bounded uploads for JSON content blocks. Original files are never deleted."""
import copy
import hashlib
from urllib.parse import urlparse

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage
from django.core.exceptions import ImproperlyConfigured
from pathlib import Path
from rest_framework import serializers


def decode_image(value):
    from apps.core.image_processing import process_data_url
    from django.core.exceptions import ValidationError
    try:
        image = process_data_url(value, max_mb=2)
    except ValidationError as error:
        raise serializers.ValidationError(error.messages) from error
    return image.data, image.extension



def validate_block_image(value):
    if value.startswith('data:'):
        decode_image(value)
    else:
        parsed = urlparse(value)
        media = '/media/landing/blocks/'
        if not (parsed.scheme in ('http', 'https') and parsed.netloc) and not (
            value.startswith(media) and not value.startswith('//') and '..' not in value
        ):
            raise serializers.ValidationError('Usa una imagen subida o una URL HTTP/HTTPS.')
    return value


def store_block_images(content, store_id):
    storage = block_storage()
    content = copy.deepcopy(content)
    for block in content['bloques']:
        for image in block['imagenes']:
            if image['src'].startswith('data:'):
                data, extension = decode_image(image['src'])
                name = f"{store_id}/{block['id']}/{hashlib.sha256(data).hexdigest()}.{extension}"
                if not storage.exists(name):
                    name = storage.save(name, ContentFile(data))
                image['src'] = storage.url(name)
    return content


def block_storage():
    if not settings.MEDIA_ROOT:
        raise ImproperlyConfigured('MEDIA_ROOT must be a dedicated media directory.')
    media = Path(settings.MEDIA_ROOT).resolve()
    base = Path(settings.BASE_DIR).resolve()
    if base.is_relative_to(media):
        raise ImproperlyConfigured('MEDIA_ROOT must not contain backend source files.')
    root = media / 'landing' / 'blocks'
    return FileSystemStorage(location=root, base_url='/media/landing/blocks/')
