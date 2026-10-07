from rest_framework import serializers

from apps.landing.models import ConfiguracionLanding
from apps.landing.content_serializers import ContenidoLandingSerializer


class ConfiguracionLandingSerializer(serializers.ModelSerializer):
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
        return data
