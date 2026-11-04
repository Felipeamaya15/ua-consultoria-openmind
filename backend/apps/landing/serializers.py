from rest_framework import serializers

from apps.landing.models import ConfiguracionLanding
from apps.landing.content_serializers import ContenidoLandingSerializer


class WebImageField(serializers.ImageField):
    def __init__(self, *, max_mb, **kwargs):
        self.max_mb = max_mb
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        from apps.core.image_processing import process_upload
        from django.core.exceptions import ValidationError
        from django.core.files.uploadedfile import SimpleUploadedFile
        try:
            image = process_upload(data, self.max_mb)
        except (AttributeError, ValidationError) as error:
            raise serializers.ValidationError(getattr(error, 'messages', ['Selecciona una imagen válida.'])) from error
        return super().to_internal_value(SimpleUploadedFile(f'imagen.{image.extension}', image.data, content_type=image.mime))


class ConfiguracionLandingSerializer(serializers.ModelSerializer):
    imagen_principal = WebImageField(max_mb=2, required=False, allow_null=True)
    logo = WebImageField(max_mb=1, required=False, allow_null=True)
    titulo = serializers.CharField(
        max_length=255,
        trim_whitespace=True,
    )
    descripcion = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )
    texto_boton = serializers.CharField(
        max_length=100,
        trim_whitespace=True,
    )
    secciones = serializers.JSONField(
        required=False,
        default=dict,
    )

    contenido = serializers.JSONField(required=False)

    class Meta:
        model = ConfiguracionLanding
        fields = [
            'id',
            'tienda',
            'titulo',
            'descripcion',
            'texto_boton',
            'imagen_principal',
            'logo',
            'secciones',
            'contenido',
        ]
        read_only_fields = [
            'id',
            'tienda',
        ]

    def validate_secciones(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError(
                "Las secciones de la landing deben enviarse como un objeto."
            )

        if any(not isinstance(enabled, bool) for enabled in value.values()):
            raise serializers.ValidationError('Las banderas de secciones deben ser true o false.')
        return value

    def validate_contenido(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('El contenido debe ser un objeto.')
        serializer = ContenidoLandingSerializer(data=value)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        ids, categorias = data.get('productos_destacados', []), data.get('categorias', [])
        if ids or categorias:
            from apps.catalog.infrastructure.repositories import ProductRepository
            from pymongo.errors import PyMongoError
            from rest_framework.exceptions import APIException
            tienda = self.context.get('tienda')
            if tienda is None:
                raise serializers.ValidationError('No se pudo identificar la tienda.')
            try:
                productos = ProductRepository().list_by_store(str(tienda.pk), activo=True)
            except PyMongoError:
                error = APIException('No se pudo validar la selección contra el catálogo. Intenta nuevamente.')
                error.status_code = 503
                raise error from None
            valid_ids = {str(p['_id']) for p in productos}
            valid_categories = {p.get('categoria') for p in productos}
            if any(product_id not in valid_ids for product_id in ids):
                raise serializers.ValidationError({'productos_destacados': 'Selecciona productos activos de esta tienda.'})
            if any(category not in valid_categories for category in categorias):
                raise serializers.ValidationError({'categorias': 'Selecciona categorías disponibles de esta tienda.'})
        if self.instance:
            # An older client may not know optional keys; preserve them on update.
            if 'contacto' in data:
                previous = self.instance.contenido.get('contacto', {})
                contact = {**previous, **data['contacto']}
                # Marketing is the writer for profiles once managed there. Stale
                # landing forms cannot reactivate, restore or overwrite them.
                for network in previous.get('redes_sociales', {}):
                    contact[network] = previous.get(network, '')
                data['contacto'] = contact
            data = {**self.instance.contenido, **data}
        return data

    def save(self, **kwargs):
        from apps.landing.block_images import store_block_images
        content = self.validated_data.get('contenido')
        if content is not None and 'bloques' in content:
            tienda = kwargs.get('tienda') or self.context['tienda']
            self.validated_data['contenido'] = store_block_images(content, tienda.pk)
        return super().save(**kwargs)
