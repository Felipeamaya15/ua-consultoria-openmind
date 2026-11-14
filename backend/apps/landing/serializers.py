
from rest_framework import serializers

from apps.landing.models import (
    ConfiguracionLanding,
    ImagenCarruselLanding,
)
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
            raise serializers.ValidationError(
                getattr(
                    error,
                    'messages',
                    ['Selecciona una imagen válida.']
                )
            ) from error

        return super().to_internal_value(
            SimpleUploadedFile(
                f'imagen.{image.extension}',
                image.data,
                content_type=image.mime
            )
        )


# ============================================================
# CARRUSEL DE PORTADA
# ============================================================

class ImagenCarruselLandingSerializer(serializers.ModelSerializer):
    """
    Devuelve las imágenes del carrusel asociadas a la tienda.

    La subida y administración de imágenes se realiza mediante
    el endpoint específico del carrusel.
    """

    class Meta:
        model = ImagenCarruselLanding
        fields = [
            'id',
            'archivo',
            'orden',
            'texto_alternativo',
        ]
        read_only_fields = fields


# ============================================================
# CONFIGURACIÓN DE PÁGINA PRINCIPAL
# ============================================================

class ConfiguracionLandingSerializer(serializers.ModelSerializer):
    imagen_principal = WebImageField(
        max_mb=2,
        required=False,
        allow_null=True
    )

    # Imágenes adicionales asociadas a esta configuración.
    # Es de solo lectura para no modificar las imágenes
    # accidentalmente al guardar otros datos de la Landing.
    imagenes_carrusel = serializers.SerializerMethodField()

    def get_imagenes_carrusel(self, instance):
        from apps.landing.carousel_content import carousel_items
        return carousel_items(instance, self.context.get('request'))

    logo = WebImageField(
        max_mb=1,
        required=False,
        allow_null=True
    )

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
            'imagenes_carrusel',
            'logo',
            'secciones',
            'contenido',
        ]

        read_only_fields = [
            'id',
            'tienda',
            'imagenes_carrusel',
        ]

    def validate_secciones(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError(
                'Las secciones de la landing deben enviarse como un objeto.'
            )

        if any(
            not isinstance(enabled, bool)
            for enabled in value.values()
        ):
            raise serializers.ValidationError(
                'Las banderas de secciones deben ser true o false.'
            )

        return value

    def validate_contenido(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError(
                'El contenido debe ser un objeto.'
            )

        # Recuperar el contenido previamente guardado.
        contenido_anterior = {}

        if self.instance and isinstance(self.instance.contenido, dict):
            contenido_anterior = self.instance.contenido

        # Validar la estructura, las secciones y sus componentes.
        serializer = ContenidoLandingSerializer(
            data=value,
            context={
                **self.context,
                'bloques_previos': contenido_anterior.get('bloques', []),
            }
        )

        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # ---------------------------------------------------------
        # QA SPRINT 8
        # Validación de productos destacados y categorías.
        #
        # Se validan solamente las referencias NUEVAS.
        # Las selecciones antiguas no bloquean cambios en portada,
        # logo u otras secciones independientes.
        # ---------------------------------------------------------

        ids_actuales = data.get('productos_destacados', [])
        categorias_actuales = data.get('categorias', [])

        ids_anteriores = contenido_anterior.get(
            'productos_destacados', []
        )
        categorias_anteriores = contenido_anterior.get(
            'categorias', []
        )

        ids_nuevos = []

        if 'productos_destacados' in data:
            ids_previos = set(ids_anteriores)

            ids_nuevos = [
                product_id
                for product_id in ids_actuales
                if product_id not in ids_previos
            ]

        categorias_nuevas = []

        if 'categorias' in data:
            categorias_previas = set(categorias_anteriores)

            categorias_nuevas = [
                categoria
                for categoria in categorias_actuales
                if categoria not in categorias_previas
            ]

        # Consultar MongoDB solamente cuando se agregan
        # nuevos productos o categorías.
        if ids_nuevos or categorias_nuevas:
            from apps.catalog.infrastructure.repositories import (
                ProductRepository
            )
            from pymongo.errors import PyMongoError
            from rest_framework.exceptions import APIException

            tienda = self.context.get('tienda')

            if tienda is None:
                raise serializers.ValidationError(
                    'No se pudo identificar la tienda.'
                )

            try:
                productos = ProductRepository().list_by_store(
                    str(tienda.pk),
                    activo=True
                )

            except PyMongoError:
                error = APIException(
                    'No se pudo validar la selección contra el '
                    'catálogo. Intenta nuevamente.'
                )
                error.status_code = 503
                raise error from None

            valid_ids = {
                str(producto['_id'])
                for producto in productos
            }

            valid_categories = {
                producto.get('categoria')
                for producto in productos
            }

            ids_invalidos = [
                product_id
                for product_id in ids_nuevos
                if product_id not in valid_ids
            ]

            if ids_invalidos:
                raise serializers.ValidationError({
                    'productos_destacados': (
                        'Uno o más productos seleccionados no '
                        'están activos o no pertenecen a esta '
                        'tienda. Revisa Productos destacados.'
                    )
                })

            categorias_invalidas = [
                categoria
                for categoria in categorias_nuevas
                if categoria not in valid_categories
            ]

            if categorias_invalidas:
                raise serializers.ValidationError({
                    'categorias': (
                        'Una o más categorías seleccionadas '
                        'no están disponibles en esta tienda. '
                        'Revisa la sección Categorías.'
                    )
                })

        # ---------------------------------------------------------
        # Conservar la información existente.
        # ---------------------------------------------------------

        if self.instance:
            if 'contacto' in data:
                previous = contenido_anterior.get('contacto', {})

                contact = {
                    **previous,
                    **data['contacto'],
                }

                # Un guardado de Landing no debe reactivar
                # redes sociales deshabilitadas desde Marketing.
                for network in previous.get('redes_sociales', {}):
                    contact[network] = previous.get(network, '')

                data['contacto'] = contact

            data = {
                **contenido_anterior,
                **data,
            }

        # Mantener el orden unificado de las secciones.
        from apps.landing.home_sections import reconcile_home_order

        return reconcile_home_order(data)

    def save(self, **kwargs):
        from apps.landing.block_images import store_block_images

        content = self.validated_data.get('contenido')

        if content is not None and 'bloques' in content:
            tienda = kwargs.get('tienda') or self.context['tienda']

            self.validated_data['contenido'] = store_block_images(
                content,
                tienda.pk
            )

        return super().save(**kwargs)
