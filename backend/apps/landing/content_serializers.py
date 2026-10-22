from urllib.parse import urlparse

from rest_framework import serializers


class WebURLField(serializers.URLField):
    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        if urlparse(value).scheme.lower() not in ('http', 'https'):
            raise serializers.ValidationError('Usa una URL HTTP o HTTPS.')
        return value


class BeneficioSerializer(serializers.Serializer):
    titulo = serializers.CharField(max_length=100)
    descripcion = serializers.CharField(max_length=250, allow_blank=True, required=False)
    icono = serializers.ChoiceField(choices=['truck', 'lock', 'return', 'chat'], required=False)


class ContactoSerializer(serializers.Serializer):
    telefono = serializers.CharField(max_length=40, allow_blank=True, required=False)
    whatsapp = serializers.RegexField(r'^\+?[0-9 ()-]{5,40}$', allow_blank=True, required=False)
    correo = serializers.EmailField(allow_blank=True, required=False)
    instagram = WebURLField(allow_blank=True, required=False)
    facebook = WebURLField(allow_blank=True, required=False)
    sitio_web = WebURLField(allow_blank=True, required=False)
    horario = serializers.CharField(max_length=250, allow_blank=True, required=False)


class UbicacionSerializer(serializers.Serializer):
    direccion = serializers.CharField(max_length=250, allow_blank=True, required=False)
    comuna = serializers.CharField(max_length=100, allow_blank=True, required=False)
    ciudad = serializers.CharField(max_length=100, allow_blank=True, required=False)
    region = serializers.CharField(max_length=100, allow_blank=True, required=False)
    enlace_maps = WebURLField(allow_blank=True, required=False)

    def validate_enlace_maps(self, value):
        if not value:
            return value
        host = (urlparse(value).hostname or '').lower()
        if not (host in ['maps.app.goo.gl', 'goo.gl'] or host == 'google.com' or host.endswith('.google.com') or host == 'google.cl' or host.endswith('.google.cl')):
            raise serializers.ValidationError('Usa un enlace de Google Maps.')
        return value


class ImagenBloqueSerializer(serializers.Serializer):
    id = serializers.UUIDField(format='hex_verbose')
    src = serializers.CharField(max_length=2800000)
    alt = serializers.CharField(max_length=250, allow_blank=True, default='')

    def validate_id(self, value):
        return str(value)

    def validate_src(self, value):
        from apps.landing.block_images import validate_block_image
        return validate_block_image(value)


class BloqueLandingSerializer(serializers.Serializer):
    id = serializers.UUIDField(format='hex_verbose')
    tipo = serializers.ChoiceField(choices=['historia', 'imagen_texto', 'texto', 'galeria', 'cita'])
    visible = serializers.BooleanField(default=True)
    titulo = serializers.CharField(max_length=255, allow_blank=True, default='')
    subtitulo = serializers.CharField(max_length=500, allow_blank=True, default='')
    texto = serializers.CharField(max_length=10000, allow_blank=True, default='')
    imagenes = ImagenBloqueSerializer(many=True, required=False, default=list)

    def validate_id(self, value):
        return str(value)

    def validate(self, value):
        images = value['imagenes']
        limit = 8 if value['tipo'] == 'galeria' else 1 if value['tipo'] in ['historia', 'imagen_texto'] else 0
        if len(images) > limit:
            raise serializers.ValidationError({'imagenes': f'Este bloque permite hasta {limit} imágenes.'})
        if len({i['id'] for i in images}) != len(images):
            raise serializers.ValidationError({'imagenes': 'Los identificadores deben ser únicos.'})
        return value


class ContenidoLandingSerializer(serializers.Serializer):
    bloques = BloqueLandingSerializer(many=True, required=False)

    def validate_bloques(self, value):
        if len(value) > 20:
            raise serializers.ValidationError('Se permiten hasta 20 secciones.')
        if len({b['id'] for b in value}) != len(value):
            raise serializers.ValidationError('Los identificadores de las secciones deben ser únicos.')
        uploads = [i['src'] for b in value for i in b['imagenes'] if i['src'].startswith('data:')]
        if sum(len(src) for src in uploads) > 14000000:
            raise serializers.ValidationError('Guarda las imágenes en grupos de hasta 10 MB.')
        return value

    productos_destacados = serializers.ListField(child=serializers.RegexField(r'^[0-9a-f]{24}$'), max_length=6, required=False)
    categorias = serializers.ListField(child=serializers.CharField(max_length=100), max_length=6, required=False)
    beneficios = BeneficioSerializer(many=True, required=False)
    contacto = ContactoSerializer(required=False)
    ubicacion = UbicacionSerializer(required=False)

    def validate_beneficios(self, value):
        if len(value) > 4:
            raise serializers.ValidationError('Se permiten hasta 4 beneficios.')
        return value

    def validate(self, value):
        for key in ('productos_destacados', 'categorias'):
            if len(value.get(key, [])) != len(set(value.get(key, []))):
                raise serializers.ValidationError({key: 'No se permiten selecciones duplicadas.'})
        return value
