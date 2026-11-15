"""One decoding boundary for all merchant image uploads. No network or storage IO."""
import base64
import binascii
import re
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from django.core.exceptions import ValidationError
from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

register_heif_opener(thumbnails=False)
ERROR = 'No pudimos procesar esta imagen. Intenta con otra foto o con JPG, PNG, WebP, HEIC o HEIF.'
FORMATS = {'JPEG': ('image/jpeg', 'jpg'), 'PNG': ('image/png', 'png'), 'WEBP': ('image/webp', 'webp'), 'HEIF': ('image/heif', 'heif')}
EXTENSIONS = {'.jpg': 'JPEG', '.jpeg': 'JPEG', '.png': 'PNG', '.webp': 'WEBP', '.heic': 'HEIF', '.heif': 'HEIF'}
MIMES = {'image/jpeg': 'JPEG', 'image/jpg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WEBP', 'image/heic': 'HEIF', 'image/heif': 'HEIF'}
MAX_PIXELS = 25_000_000

# Reduccion automatica de fotos (se activa con optimize=True). Estos valores se cambian aqui:
OPTIMIZE_MAX_SIDE = 1200      # lado mas largo, en pixeles
OPTIMIZE_TARGET_KB = 150      # peso objetivo de cada foto, en KB
OPTIMIZE_MIN_QUALITY = 60     # calidad minima de WebP (bajo 60 se notan manchas)
OPTIMIZE_MIN_SIDE = 600       # no se reduce mas que esto


@dataclass(frozen=True)
class ProcessedImage:
    data: bytes
    mime: str
    extension: str
    width: int
    height: int
    converted: bool = False

    @property
    def url(self):
        return f'data:{self.mime};base64,{base64.b64encode(self.data).decode()}'


def optimize_image(source):
    """Endereza la foto, borra sus metadatos (incluida la ubicacion GPS), la reduce a OPTIMIZE_MAX_SIDE
    y la guarda como WebP con la mayor calidad que cabe en OPTIMIZE_TARGET_KB. Devuelve (bytes, (ancho, alto))."""
    oriented = ImageOps.exif_transpose(source)
    mode = 'RGBA' if 'A' in oriented.getbands() else 'RGB'
    clean = Image.new(mode, oriented.size)          # una imagen nueva no arrastra metadatos
    clean.paste(oriented.convert(mode))
    target = OPTIMIZE_TARGET_KB * 1024
    scale = min(1.0, OPTIMIZE_MAX_SIDE / max(clean.size))
    while True:
        work = clean if scale == 1.0 else clean.resize((max(1, round(clean.width * scale)), max(1, round(clean.height * scale))), Image.LANCZOS)
        low, high, best = OPTIMIZE_MIN_QUALITY, 90, None
        while low <= high:                              # busca la mayor calidad que cabe en el objetivo
            quality = (low + high) // 2
            out = BytesIO()
            work.save(out, format='WEBP', quality=quality, method=4)
            if out.tell() <= target:
                best, low = (out.getvalue(), work.size), quality + 1
            else:
                high = quality - 1
        if best:
            return best
        if max(work.size) <= OPTIMIZE_MIN_SIDE:         # ni asi cabe: se entrega la calidad minima
            out = BytesIO()
            work.save(out, format='WEBP', quality=OPTIMIZE_MIN_QUALITY, method=4)
            return out.getvalue(), work.size
        scale *= 0.85


def process_image(data, *, name=None, mime=None, max_mb=2, optimize=False):
    limit = max_mb * 1024 * 1024
    if len(data) > limit:
        raise ValidationError(f'La imagen supera el máximo de {max_mb} MB.')
    extension_format = EXTENSIONS.get(Path(name).suffix.lower()) if name else None
    # iOS can send no MIME or application/octet-stream; inspect the bytes anyway.
    declared_format = MIMES.get(mime) if mime else None
    if (name and not extension_format) or (mime and mime != 'application/octet-stream' and not declared_format):
        raise ValidationError(ERROR)
    try:
        with Image.open(BytesIO(data)) as source:
            actual = source.format
            if actual not in FORMATS or (extension_format and extension_format != actual) or (declared_format and declared_format != actual):
                raise ValidationError(ERROR)
            if not 0 < source.width * source.height <= MAX_PIXELS:
                raise ValidationError('La imagen supera las dimensiones permitidas (25 millones de píxeles).')
            source.load()  # verify the full payload, including truncated files
            width, height = source.size
            converted = actual == 'HEIF'
            if optimize:
                data, (width, height) = optimize_image(source)
                actual, converted = 'WEBP', True
            elif converted:
                oriented = ImageOps.exif_transpose(source)
                output = BytesIO()
                # Passing a fresh image strips private metadata and stale orientation.
                clean = Image.new('RGBA' if 'A' in oriented.getbands() else 'RGB', oriented.size)
                clean.paste(oriented)
                clean.save(output, format='WEBP', quality=90, method=4)
                data, actual = output.getvalue(), 'WEBP'
                width, height = clean.size
            if len(data) > limit:
                raise ValidationError(f'La imagen procesada supera el máximo de {max_mb} MB. Intenta con una foto más pequeña.')
    except (ValueError, OSError, SyntaxError, UnidentifiedImageError, Image.DecompressionBombError) as error:
        raise ValidationError(ERROR) from error
    mime, extension = FORMATS[actual]
    return ProcessedImage(data, mime, extension, width, height, converted)


def process_upload(upload, max_mb=2, optimize=False):
    if upload.size > max_mb * 1024 * 1024:
        raise ValidationError(f'La imagen supera el máximo de {max_mb} MB.')
    upload.seek(0)
    try:
        return process_image(upload.read(max_mb * 1024 * 1024 + 1), name=upload.name, mime=getattr(upload, 'content_type', None), max_mb=max_mb, optimize=optimize)
    finally:
        upload.seek(0)


def process_data_url(value, max_mb=2):
    match = re.fullmatch(r'data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)', value)
    if not match or len(match[2]) > (max_mb * 1024 * 1024 + 2) * 4 // 3 + 8:
        raise ValidationError(ERROR)
    try:
        raw = base64.b64decode(match[2], validate=True)
    except (ValueError, binascii.Error) as error:
        raise ValidationError(ERROR) from error
    return process_image(raw, mime=match[1], max_mb=max_mb)


def normalize_image_url(value, max_mb=2):
    if value.startswith(('http://', 'https://', '/')):
        return value  # existing remote assets are never downloaded by the server
    return process_data_url(value, max_mb).url
