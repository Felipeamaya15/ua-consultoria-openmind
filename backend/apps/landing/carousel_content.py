"""Stable slide metadata in the existing landing JSON; no image-position keys."""
from urllib.parse import urlsplit
from rest_framework import serializers
from apps.authentication.presentation.profile import StrictSerializer

CAROUSEL_KEYS = ('carrusel_contenido', 'carrusel_recursos', 'carrusel_orden')


class SlideContentSerializer(StrictSerializer):
    titulo = serializers.CharField(max_length=255, allow_blank=True, required=False)
    descripcion = serializers.CharField(max_length=1000, allow_blank=True, required=False)
    texto_boton = serializers.CharField(max_length=100, allow_blank=True, required=False)
    enlace = serializers.CharField(max_length=2000, allow_blank=True, required=False)
    mostrar_titulo = serializers.BooleanField(required=False)
    mostrar_descripcion = serializers.BooleanField(required=False)
    mostrar_boton = serializers.BooleanField(required=False)

    def validate_enlace(self, value):
        if not value:
            return value
        if any(ord(c) < 32 for c in value) or '\\' in value or any(c in value for c in '<>"'):
            raise serializers.ValidationError('Usa un destino interno o una URL HTTPS válida.')
        url = urlsplit(value)
        if value.startswith('//') or url.username or url.password or (url.scheme and (url.scheme != 'https' or not url.hostname)):
            raise serializers.ValidationError('Usa un destino interno o una URL HTTPS válida.')
        return value


def slide_resources(config):
    return config.contenido.get('carrusel_recursos', []) if isinstance(config.contenido, dict) else []


def carousel_items(config, request=None, private=False):
    from apps.landing.media_library import available_media
    content = config.contenido if isinstance(config.contenido, dict) else {}
    metadata = content.get('carrusel_contenido', {})
    result = []
    for image in config.imagenes_carrusel.all():
        url = image.archivo.url if image.archivo else ''
        result.append(dict(id=str(image.pk), archivo=request.build_absolute_uri(url) if request and url else url, orden=image.orden,
                           texto_alternativo=image.texto_alternativo, tipo='imagen', contenido=metadata.get(str(image.pk), {})))
    resources = {str(row.pk): row for row in available_media(config.tienda, [item['recurso_id'] for item in slide_resources(config)])}
    for item in slide_resources(config):
        resource = resources.get(item['recurso_id'])
        if not resource and not private:
            continue
        url = f'/api/landing/multimedia-publica/{resource.pk}/imagen/' if resource and resource.archivo else resource.url if resource else ''
        result.append(dict(id=item['id'], recurso_id=item['recurso_id'], archivo=request.build_absolute_uri(url) if request and url else url,
                           orden=len(result), texto_alternativo=resource.titulo if resource else 'Recurso no disponible',
                           tipo=resource.tipo if resource else 'imagen', contenido=metadata.get(item['id'], {})))
    preferred = content.get('carrusel_orden', [])
    ranks = {key: index for index, key in enumerate(preferred)}
    result.sort(key=lambda row: ranks.get(row['id'], len(ranks) + row['orden']))
    for index, row in enumerate(result):
        row['orden'] = index
    return result
