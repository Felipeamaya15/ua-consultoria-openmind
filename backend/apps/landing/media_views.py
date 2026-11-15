from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import Tienda
from apps.core.presentation.responses import success_response
from apps.landing.media_library import MediaInputSerializer, MediaOutputSerializer, store_media_image
from apps.landing.models import RecursoMultimedia
from apps.landing.media_usage import media_usage


class PrivateMediaView(APIView):
    permission_classes = [IsAuthenticated]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response

    def resource(self, request, pk, *, lock=False):
        store = resolver_tienda(request, exigir_propietario=True)
        if lock:
            Tienda.objects.select_for_update().get(pk=store.pk)
        query = RecursoMultimedia.objects.select_related('archivo').filter(tienda=store, eliminado=False)
        if lock:
            query = query.select_for_update(of=('self',))
        return get_object_or_404(query, pk=pk)


def save_fields(resource, data, store):
    image = data.pop('imagen', None) or data.pop('video', None)
    if image:
        resource.archivo = store_media_image(image, store)
        resource.url = ''
    elif 'url' in data:
        resource.archivo = None
    for field, value in data.items():
        setattr(resource, field, value)
    resource.save()
    return resource


class MediaLibraryView(PrivateMediaView):
    def get(self, request):
        store = resolver_tienda(request, exigir_propietario=True)
        try:
            page = int(request.query_params.get('pagina', '1'))
            if not 1 <= page <= 10000:
                raise ValueError
        except (ValueError, TypeError):
            raise serializers.ValidationError('La página debe ser un número positivo.') from None
        query = RecursoMultimedia.objects.filter(tienda=store, eliminado=False).select_related('archivo')
        text = request.query_params.get('q', '').strip()
        kind = request.query_params.get('tipo', '')
        state = request.query_params.get('estado', '')
        order = request.query_params.get('orden', 'recientes')
        if len(text) > 180 or (kind and kind not in dict(RecursoMultimedia.TIPOS)) or state not in ('', 'activo', 'inactivo') or order not in ('recientes', 'nombre'):
            raise serializers.ValidationError('Revisa los filtros de la biblioteca.')
        if text:
            query = query.filter(Q(titulo__icontains=text) | Q(descripcion__icontains=text) | Q(url__icontains=text))
        if kind:
            query = query.filter(tipo=kind)
        if state:
            query = query.filter(activo=state == 'activo')
        query = query.order_by('titulo', 'id') if order == 'nombre' else query.order_by('-creado', '-id')
        total = query.count()
        return success_response(data={'resultados': MediaOutputSerializer(query[(page-1)*24:page*24], many=True, context={'usos': media_usage(store)}).data,
                                      'total': total, 'pagina': page, 'por_pagina': 24})

    @transaction.atomic
    def post(self, request):
        store = resolver_tienda(request, exigir_propietario=True)
        serializer = MediaInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        Tienda.objects.select_for_update().get(pk=store.pk)
        if RecursoMultimedia.objects.filter(tienda=store, eliminado=False).count() >= 200:
            raise serializers.ValidationError('Se permiten hasta 200 recursos vigentes por tienda.')
        resource = save_fields(RecursoMultimedia(tienda=store), serializer.validated_data, store)
        return success_response(data=MediaOutputSerializer(resource).data, status=201)


class MediaResourceView(PrivateMediaView):
    def get(self, request, pk):
        resource = self.resource(request, pk)
        return success_response(data=MediaOutputSerializer(resource, context={'usos': media_usage(resource.tienda)}).data)

    @transaction.atomic
    def patch(self, request, pk):
        resource = self.resource(request, pk, lock=True)
        serializer = MediaInputSerializer(instance=resource, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        save_fields(resource, serializer.validated_data, resource.tienda)
        return success_response(data=MediaOutputSerializer(resource).data)

    @transaction.atomic
    def delete(self, request, pk):
        resource = self.resource(request, pk, lock=True)
        if media_usage(resource.tienda).get(str(resource.pk)):
            raise serializers.ValidationError('Este recurso está en uso. Retíralo de las secciones y del carrusel antes de eliminarlo.')
        if resource.tipo == 'video':
            from apps.core.infrastructure.mongo_client import get_mongo_db
            if get_mongo_db().productos.find_one({'tienda_id': str(resource.tienda_id), 'video_recurso_id': str(resource.pk)}, {'_id': 1}):
                raise serializers.ValidationError('Este video está en uso en el catálogo. Retíralo del producto antes de eliminarlo.')
        resource.eliminado = True
        resource.activo = False
        resource.save(update_fields=['eliminado', 'activo', 'actualizado'])
        return success_response(data={'id': str(resource.pk)}, mensaje='Recurso eliminado de la biblioteca.')


class MediaImageView(PrivateMediaView):
    def get(self, request, pk):
        resource = self.resource(request, pk)
        if resource.archivo is None:
            from rest_framework.exceptions import NotFound
            raise NotFound('Este recurso no contiene una imagen subida.')
        try:
            opened = default_storage.open(resource.archivo.archivo.name, 'rb')
        except FileNotFoundError:
            from rest_framework.exceptions import NotFound
            raise NotFound('La imagen no está disponible.') from None
        return FileResponse(opened, content_type=resource.archivo.mime)
