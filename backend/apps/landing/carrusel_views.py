"""Existing carousel CRUD, plus stable JSON content and reusable library slides."""
import uuid
from django.db import transaction
from django.db.models import Max
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser, JSONParser
from rest_framework.views import APIView
from apps.core.models import Tienda
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.presentation.responses import success_response
from apps.landing.models import ConfiguracionLanding, ImagenCarruselLanding, RecursoMultimedia
from apps.landing.serializers import WebImageField
from apps.landing.carousel_content import carousel_items, slide_resources, SlideContentSerializer

MAX_IMAGENES_CARRUSEL = 8


class OrdenCarruselSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False, max_length=MAX_IMAGENES_CARRUSEL)

    def validate_ids(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError('No puedes repetir imágenes en el orden.')
        return value


def configuration(request, lock=False):
    store = resolver_tienda(request, exigir_propietario=True)
    if lock:
        Tienda.objects.select_for_update().get(pk=store.pk)
    return ConfiguracionLanding.objects.filter(tienda=store).first()


def persist_json(config, key, value):
    config.contenido = {**config.contenido, key: value}
    config.save(update_fields=['contenido'])


class ImagenesCarruselLandingAPIView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        config = configuration(request)
        return success_response(data=carousel_items(config, request, private=True) if config else [])

    @transaction.atomic
    def post(self, request):
        config = configuration(request, lock=True)
        if config is None:
            raise ValidationError({'detalle': 'Primero debes guardar la página principal.'})
        items = carousel_items(config, request, private=True)
        if len(items) >= MAX_IMAGENES_CARRUSEL:
            raise ValidationError({'archivo': 'Puedes agregar un máximo de 8 imágenes o videos.'})
        if request.data.get('recurso_id'):
            if request.FILES:
                raise ValidationError('Selecciona un recurso o sube una imagen, no ambos.')
            key = serializers.UUIDField().run_validation(request.data['recurso_id'])
            resource = RecursoMultimedia.objects.filter(pk=key, tienda=config.tienda, activo=True, eliminado=False, tipo__in=['imagen', 'video']).first()
            if not resource:
                raise ValidationError('Selecciona una imagen o video activo de la biblioteca de esta tienda.')
            new_id = str(uuid.uuid4())
            persist_json(config, 'carrusel_recursos', [*slide_resources(config), {'id': new_id, 'recurso_id': str(resource.pk)}])
        else:
            uploaded = request.FILES.get('archivo')
            if uploaded is None:
                raise ValidationError({'archivo': 'Selecciona una imagen para subir.'})
            image = WebImageField(max_mb=2).run_validation(uploaded)
            text = request.data.get('texto_alternativo', '')
            if not isinstance(text, str) or len(text.strip()) > 250:
                raise ValidationError({'texto_alternativo': 'La descripción debe tener máximo 250 caracteres.'})
            order = config.imagenes_carrusel.aggregate(last=Max('orden'))['last']
            row = ImagenCarruselLanding.objects.create(configuracion=config, archivo=image, orden=0 if order is None else order + 1, texto_alternativo=text.strip())
            new_id = str(row.pk)
        # New slides append even after an earlier manual reorder.
        persist_json(config, 'carrusel_orden', [*[item['id'] for item in items], new_id])
        result = next(item for item in carousel_items(config, request, private=True) if item['id'] == new_id)
        return success_response(data=result, status=status.HTTP_201_CREATED)


class ImagenCarruselLandingDetalleAPIView(APIView):
    @transaction.atomic
    def patch(self, request, pk):
        config = configuration(request, lock=True)
        if not config or str(pk) not in {item['id'] for item in carousel_items(config, request, private=True)}:
            raise NotFound('La imagen no existe o no pertenece a tu tienda.')
        if not isinstance(request.data, dict) or set(request.data) != {'contenido'}:
            raise ValidationError('Envía únicamente el contenido de esta diapositiva.')
        serializer = SlideContentSerializer(data=request.data['contenido'])
        serializer.is_valid(raise_exception=True)
        persist_json(config, 'carrusel_contenido', {**config.contenido.get('carrusel_contenido', {}), str(pk): serializer.validated_data})
        return success_response(data=next(item for item in carousel_items(config, request, private=True) if item['id'] == str(pk)))

    @transaction.atomic
    def delete(self, request, pk):
        config = configuration(request, lock=True)
        if not config:
            raise NotFound('La imagen no existe o no pertenece a tu tienda.')
        image = config.imagenes_carrusel.filter(pk=pk).first()
        extras = slide_resources(config)
        if not image and not any(item['id'] == str(pk) for item in extras):
            raise NotFound('La imagen no existe o no pertenece a tu tienda.')
        if image:
            name, storage = image.archivo.name, image.archivo.storage
            image.delete()
            if name:
                transaction.on_commit(lambda: storage.delete(name))
        content = dict(config.contenido)
        content['carrusel_recursos'] = [item for item in extras if item['id'] != str(pk)]
        content['carrusel_orden'] = [key for key in content.get('carrusel_orden', []) if key != str(pk)]
        content['carrusel_contenido'] = {key: value for key, value in content.get('carrusel_contenido', {}).items() if key != str(pk)}
        config.contenido = content
        config.save(update_fields=['contenido'])
        return success_response(data={'id': str(pk)})


class OrdenImagenesCarruselLandingAPIView(APIView):
    @transaction.atomic
    def patch(self, request):
        serializer = OrdenCarruselSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ids = [str(key) for key in serializer.validated_data['ids']]
        config = configuration(request, lock=True)
        if not config:
            raise ValidationError({'ids': 'Primero debes guardar la página principal.'})
        if set(ids) != {item['id'] for item in carousel_items(config, request, private=True)}:
            raise ValidationError({'ids': 'El orden debe incluir exactamente las imágenes actuales de tu tienda.'})
        images = list(config.imagenes_carrusel.all())
        for image in images:
            image.orden = ids.index(str(image.pk))
        ImagenCarruselLanding.objects.bulk_update(images, ['orden'])
        persist_json(config, 'carrusel_orden', ids)
        return success_response(data=carousel_items(config, request, private=True))
