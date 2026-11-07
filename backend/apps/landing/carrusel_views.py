
from django.db import transaction
from django.db.models import Max

from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.views import APIView

from apps.core.models import Tienda
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.presentation.responses import success_response

from apps.landing.models import (
    ConfiguracionLanding,
    ImagenCarruselLanding,
)
from apps.landing.serializers import (
    ImagenCarruselLandingSerializer,
    WebImageField,
)


MAX_IMAGENES_CARRUSEL = 8


class OrdenCarruselSerializer(serializers.Serializer):
    ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=False,
        max_length=MAX_IMAGENES_CARRUSEL,
    )

    def validate_ids(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError(
                'No puedes repetir imágenes en el orden.'
            )
        return value


class ImagenesCarruselLandingAPIView(APIView):
    """
    GET: consultar imágenes de portada.
    POST: subir una imagen nueva.

    Ambas operaciones requieren ser propietario de la tienda.
    """

    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        tienda = resolver_tienda(
            request,
            exigir_propietario=True,
        )

        configuracion = ConfiguracionLanding.objects.filter(
            tienda=tienda,
        ).first()

        if configuracion is None:
            return success_response(
                data=[],
                mensaje='Aún no hay imágenes de carrusel.',
            )

        imagenes = ImagenCarruselLanding.objects.filter(
            configuracion=configuracion,
        )

        serializer = ImagenCarruselLandingSerializer(
            imagenes,
            many=True,
            context={'request': request},
        )

        return success_response(
            data=serializer.data,
            mensaje='Imágenes de portada obtenidas.',
        )

    @transaction.atomic
    def post(self, request):
        tienda = resolver_tienda(
            request,
            exigir_propietario=True,
        )

        # Bloquear la tienda evita cargas simultáneas
        # que superen el límite o repitan posiciones.
        Tienda.objects.select_for_update().get(pk=tienda.pk)

        configuracion = ConfiguracionLanding.objects.filter(
            tienda=tienda,
        ).first()

        if configuracion is None:
            raise ValidationError({
                'detalle': (
                    'Primero debes guardar la página principal.'
                )
            })

        imagenes = ImagenCarruselLanding.objects.filter(
            configuracion=configuracion,
        )

        if imagenes.count() >= MAX_IMAGENES_CARRUSEL:
            raise ValidationError({
                'archivo': (
                    'Puedes agregar un máximo de 8 imágenes.'
                )
            })

        archivo = request.FILES.get('archivo')

        if archivo is None:
            raise ValidationError({
                'archivo': 'Selecciona una imagen para subir.'
            })

        archivo_validado = WebImageField(
            max_mb=2,
        ).run_validation(archivo)

        texto = request.data.get('texto_alternativo', '')

        if not isinstance(texto, str) or len(texto.strip()) > 250:
            raise ValidationError({
                'texto_alternativo': (
                    'La descripción debe tener máximo 250 caracteres.'
                )
            })

        ultimo = imagenes.aggregate(
            maximo=Max('orden')
        )['maximo']

        siguiente_orden = 0 if ultimo is None else ultimo + 1

        imagen = ImagenCarruselLanding.objects.create(
            configuracion=configuracion,
            archivo=archivo_validado,
            orden=siguiente_orden,
            texto_alternativo=texto.strip(),
        )

        serializer = ImagenCarruselLandingSerializer(
            imagen,
            context={'request': request},
        )

        return success_response(
            data=serializer.data,
            mensaje='Imagen agregada correctamente.',
            status=status.HTTP_201_CREATED,
        )


class ImagenCarruselLandingDetalleAPIView(APIView):
    """
    DELETE: eliminar una imagen del carrusel.
    """

    @transaction.atomic
    def delete(self, request, pk):
        tienda = resolver_tienda(
            request,
            exigir_propietario=True,
        )

        Tienda.objects.select_for_update().get(pk=tienda.pk)

        imagen = ImagenCarruselLanding.objects.filter(
            pk=pk,
            configuracion__tienda=tienda,
        ).first()

        if imagen is None:
            raise NotFound(
                'La imagen no existe o no pertenece a tu tienda.'
            )

        # Eliminar el registro primero y el archivo físico
        # solamente después de confirmar la transacción.
        archivo_nombre = imagen.archivo.name
        almacenamiento = imagen.archivo.storage

        imagen.delete()

        if archivo_nombre:
            transaction.on_commit(
                lambda: almacenamiento.delete(archivo_nombre)
            )

        return success_response(
            data={'id': str(pk)},
            mensaje='Imagen eliminada del carrusel.',
        )


class OrdenImagenesCarruselLandingAPIView(APIView):
    """
    PATCH: guardar el orden completo del carrusel.

    Ejemplo:
    {
        "ids": ["uuid-1", "uuid-2", "uuid-3"]
    }
    """

    @transaction.atomic
    def patch(self, request):
        tienda = resolver_tienda(
            request,
            exigir_propietario=True,
        )

        serializer = OrdenCarruselSerializer(
            data=request.data
        )
        serializer.is_valid(raise_exception=True)

        ids = serializer.validated_data['ids']

        Tienda.objects.select_for_update().get(pk=tienda.pk)

        configuracion = ConfiguracionLanding.objects.filter(
            tienda=tienda,
        ).first()

        if configuracion is None:
            raise ValidationError({
                'ids': 'Primero debes guardar la página principal.'
            })

        imagenes = list(
            ImagenCarruselLanding.objects.filter(
                configuracion=configuracion,
            )
        )

        imagenes_por_id = {
            imagen.id: imagen
            for imagen in imagenes
        }

        # Deben incluirse todas las imágenes de esa tienda.
        # No se aceptan IDs externos, duplicados o faltantes.
        if set(ids) != set(imagenes_por_id):
            raise ValidationError({
                'ids': (
                    'El orden debe incluir exactamente las '
                    'imágenes actuales de tu tienda.'
                )
            })

        for posicion, imagen_id in enumerate(ids):
            imagenes_por_id[imagen_id].orden = posicion

        ImagenCarruselLanding.objects.bulk_update(
            imagenes,
            ['orden'],
        )

        resultado = ImagenCarruselLandingSerializer(
            sorted(imagenes, key=lambda imagen: imagen.orden),
            many=True,
            context={'request': request},
        )

        return success_response(
            data=resultado.data,
            mensaje='Orden del carrusel actualizado.',
        )
