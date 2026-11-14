
"""Private, reusable media identities. No remote fetching or supplied embed HTML."""
import hashlib
import ipaddress
import re
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db.models import Q, Sum
from rest_framework import serializers

from apps.authentication.presentation.profile import StrictSerializer
from apps.core.image_processing import process_upload
from apps.landing.models import ArchivoMultimedia, RecursoMultimedia


def media_url(kind, value):
    if len(value) > 2000 or re.search(r'[\x00-\x20\\<>"\x7f]', value):
        raise serializers.ValidationError(
            'Ingresa una URL HTTPS válida, sin código HTML.'
        )

    try:
        parsed = urlsplit(value)
        host = parsed.hostname or ''

        if (
            parsed.scheme != 'https'
            or not host
            or parsed.username
            or parsed.password
            or parsed.port not in (None, 443)
        ):
            raise ValueError

        if (
            host in ('localhost',)
            or host.endswith(('.localhost', '.local', '.internal'))
            or '.' not in host
        ):
            raise ValueError

        try:
            if not ipaddress.ip_address(host).is_global:
                raise ValueError
        except ValueError as error:
            if ':' in host or re.fullmatch(r'[0-9.]+', host):
                raise ValueError from error

        serializers.URLField().run_validation(value)

    except (ValueError, serializers.ValidationError):
        raise serializers.ValidationError(
            'Usa una URL HTTPS pública, sin credenciales ni direcciones locales.'
        ) from None

    path = parsed.path.strip('/')
    query = parse_qs(parsed.query, keep_blank_values=True)

    if kind == 'youtube':
        video = None

        if host in (
            'youtube.com',
            'www.youtube.com',
            'm.youtube.com',
            'youtube-nocookie.com',
            'www.youtube-nocookie.com',
        ):
            if path == 'watch' and len(query.get('v', [])) == 1:
                video = query['v'][0]
            else:
                match = re.fullmatch(
                    r'(?:shorts|embed)/([A-Za-z0-9_-]{11})',
                    path
                )
                video = match[1] if match else None

        elif host == 'youtu.be':
            video = path

        if not video or not re.fullmatch(r'[A-Za-z0-9_-]{11}', video):
            raise serializers.ValidationError(
                'Usa el enlace de un video de YouTube, no de un canal.'
            )

        return f'https://www.youtube.com/watch?v={video}'

    if kind == 'instagram':
        if host not in ('instagram.com', 'www.instagram.com'):
            raise serializers.ValidationError(
                'Usa un enlace válido de Instagram.'
            )

        # Publicaciones, reels y videos tradicionales.
        publicacion = re.fullmatch(
            r'(?:p|reel|tv)/[A-Za-z0-9_-]{5,64}',
            path
        )

        # Enlaces generados por la opción Compartir.
        compartido = re.fullmatch(
            r'share/(?:p|reel)/[A-Za-z0-9_-]{5,128}',
            path
        )

        if not publicacion and not compartido:
            raise serializers.ValidationError(
                'Usa el enlace de una publicación o reel de Instagram.'
            )

        # Eliminar parámetros de seguimiento.
        return f'https://www.instagram.com/{path}/'

    if kind == 'facebook':
        if host not in (
            'facebook.com',
            'www.facebook.com',
            'm.facebook.com',
        ):
            raise serializers.ValidationError(
                'Usa un enlace de publicación pública de Facebook.'
            )

        if (
            re.fullmatch(
                r'[A-Za-z0-9.]+/(?:posts|videos)/(?:[0-9]+|pfbid[A-Za-z0-9]+)',
                path
            )
            or re.fullmatch(r'reel/[0-9]+', path)
        ):
            return f'https://www.facebook.com/{path}'

        required = (
            ('story_fbid', 'id') if path == 'permalink.php'
            else ('fbid',) if path == 'photo.php'
            else ('v',) if path == 'watch'
            else ()
        )

        if required and all(
            len(query.get(key, [])) == 1
            and re.fullmatch(r'[A-Za-z0-9]+', query[key][0])
            for key in required
        ):
            return (
                f'https://www.facebook.com/{path}?'
                f'{urlencode({key: query[key][0] for key in required})}'
            )

        raise serializers.ValidationError(
            'Usa el enlace completo de una publicación, foto o video público de Facebook.'
        )

    if kind == 'imagen' and not re.search(
        r'\.(?:jpe?g|png|webp)$',
        parsed.path,
        re.I
    ):
        raise serializers.ValidationError(
            'La URL de imagen debe terminar en JPG, PNG o WebP; también puedes subir un archivo.'
        )

    return urlunsplit((
        'https',
        parsed.netloc,
        parsed.path,
        parsed.query,
        ''
    ))


class MediaInputSerializer(StrictSerializer):
    titulo = serializers.CharField(max_length=180, required=False)
    descripcion = serializers.CharField(
        max_length=2000,
        allow_blank=True,
        required=False
    )
    tipo = serializers.ChoiceField(
        choices=RecursoMultimedia.TIPOS,
        required=False
    )
    url = serializers.CharField(
        max_length=2000,
        allow_blank=True,
        required=False
    )
    imagen = serializers.FileField(required=False)
    video = serializers.FileField(required=False)
    perfil_video = serializers.ChoiceField(choices=('section', 'product'), required=False, write_only=True)
    activo = serializers.BooleanField(required=False, default=True)

    def validate(self, data):
        video_profile = data.pop('perfil_video', 'section')
        if video_profile == 'product' and 'video' not in data:
            raise serializers.ValidationError(
                {'perfil_video': 'Este perfil solo se aplica al subir un video nuevo.'}
            )

        if self.instance is None and not all(
            key in data for key in ('titulo', 'tipo')
        ):
            raise serializers.ValidationError(
                'Indica el título y el tipo del recurso.'
            )

        kind = data.get(
            'tipo',
            self.instance.tipo if self.instance else None
        )

        if sum(bool(data.get(key)) for key in ('imagen', 'video', 'url')) > 1:
            raise serializers.ValidationError(
                'Usa una URL o un archivo; no ambos.'
            )

        if 'video' in data:
            if kind != 'video':
                raise serializers.ValidationError('Selecciona el tipo Video para subir este archivo.')
            from apps.landing.video_uploads import process_video_upload
            try:
                data['video'] = process_video_upload(data['video'], kind=video_profile)
            except DjangoValidationError as error:
                raise serializers.ValidationError({'video': error.messages}) from error
        elif 'imagen' in data:
            if kind != 'imagen':
                raise serializers.ValidationError(
                    'Los archivos permitidos son imágenes; no se admiten videos propios.'
                )

            try:
                data['imagen'] = process_upload(
                    data['imagen'],
                    max_mb=2
                )
            except DjangoValidationError as error:
                raise serializers.ValidationError({
                    'imagen': error.messages
                }) from error

        elif 'url' in data:
            if kind == 'video':
                raise serializers.ValidationError('Los videos propios se suben desde tu dispositivo.')
            if not data['url']:
                raise serializers.ValidationError({
                    'url': 'Ingresa una URL o selecciona una imagen.'
                })

            data['url'] = media_url(kind, data['url'])

        elif self.instance is None or kind != self.instance.tipo:
            raise serializers.ValidationError(
                'Indica una URL o una imagen para este tipo de recurso.'
            )

        return data


def store_media_image(image, store):
    digest = hashlib.sha256(image.data).hexdigest()

    previous = ArchivoMultimedia.objects.filter(
        tienda=store,
        sha256=digest
    ).first()

    if previous:
        return previous

    used = (
        ArchivoMultimedia.objects.filter(tienda=store)
        .aggregate(size=Sum('tamano'))['size'] or 0
    )

    if used + len(image.data) > 100 * 1024 * 1024:
        raise serializers.ValidationError(
            'La biblioteca alcanzó su límite de 100 MB de archivos multimedia.'
        )

    name = f'biblioteca/{store.pk}/{digest}.{image.extension}'

    if not default_storage.exists(name):
        name = default_storage.save(
            name,
            ContentFile(image.data)
        )

    return ArchivoMultimedia.objects.create(
        tienda=store,
        archivo=name,
        sha256=digest,
        mime=image.mime,
        tamano=len(image.data),
        ancho=image.width,
        alto=image.height
    )


class MediaOutputSerializer(serializers.ModelSerializer):
    archivo = serializers.SerializerMethodField()

    def get_archivo(self, resource):
        asset = resource.archivo

        return {
            'id': str(asset.pk),
            'mime': asset.mime,
            'tamano': asset.tamano,
            'ancho': asset.ancho,
            'alto': asset.alto
        } if asset else None

    class Meta:
        model = RecursoMultimedia
        fields = (
            'id',
            'titulo',
            'descripcion',
            'tipo',
            'url',
            'activo',
            'archivo',
            'creado',
            'actualizado'
        )


def available_media(store, ids):
    """Future section resolver: callers pass the server-resolved store, never a client scope."""
    return (
        RecursoMultimedia.objects
        .filter(
            tienda=store,
            pk__in=ids,
            activo=True,
            eliminado=False
        )
        .filter(
            Q(archivo__isnull=True) |
            Q(archivo__tienda=store)
        )
        .select_related('archivo')
    )
