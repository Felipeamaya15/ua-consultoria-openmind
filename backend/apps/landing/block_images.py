"""Bounded uploads for JSON content blocks. Original files are never deleted."""
import base64
import binascii
import copy
import hashlib
import re
from io import BytesIO
from urllib.parse import urlparse

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage
from pathlib import Path
from PIL import Image, UnidentifiedImageError
from rest_framework import serializers


def decode_image(value):
    match = re.fullmatch(r'data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)', value)
    if not match:
        raise serializers.ValidationError('Usa una imagen JPG, PNG o WebP.')
    try:
        data = base64.b64decode(match[2], validate=True)
        if len(data) > 2 * 1024 * 1024:
            raise serializers.ValidationError('Cada imagen admite hasta 2 MB.')
        with Image.open(BytesIO(data)) as image:
            if image.format != {'png': 'PNG', 'jpeg': 'JPEG', 'webp': 'WEBP'}[match[1]] or image.width * image.height > 25000000:
                raise serializers.ValidationError('La imagen tiene un formato o dimensiones no admitidos.')
            image.verify()
    except (ValueError, binascii.Error, UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise serializers.ValidationError('El archivo no contiene una imagen válida.') from None
    return data, 'jpg' if match[1] == 'jpeg' else match[1]


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
    # Dedicated media subtree also works for installations with no MEDIA_ROOT.
    root = Path(settings.MEDIA_ROOT or settings.BASE_DIR) / 'landing' / 'blocks'
    return FileSystemStorage(location=root, base_url='/media/landing/blocks/')
