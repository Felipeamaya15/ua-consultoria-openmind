"""Anonymous access is derived from current published references, never library listing."""
from django.core.files.storage import default_storage
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from rest_framework.exceptions import NotFound

from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.presentation.responses import success_response
from apps.landing.media_library import available_media, MediaOutputSerializer
from apps.landing.models import ConfiguracionLanding
from apps.landing.section_elements import referenced_media


def published_resources(request):
    store = resolver_tienda(request)
    config = ConfiguracionLanding.objects.filter(tienda=store).first()
    ids = referenced_media(config.contenido.get('bloques', []) if config else [], published_only=True)
    if config:
        from apps.landing.carousel_content import slide_resources
        ids = ids | {item['recurso_id'] for item in slide_resources(config)}
    return available_media(store, ids)


class PublicSectionMediaView(APIView):
    permission_classes = [AllowAny]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response['Cache-Control'] = 'no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response

    def get(self, request):
        result = {}
        for resource in published_resources(request):
            data = dict(MediaOutputSerializer(resource).data)
            # Public consumers do not receive administrative file IDs or storage paths.
            data['archivo'] = None
            data['imagen_publica'] = request.build_absolute_uri(f'/api/landing/multimedia-publica/{resource.pk}/imagen/') if resource.archivo else None
            result[str(resource.pk)] = data
        return success_response(data={'recursos': result})


class PublicSectionImageView(PublicSectionMediaView):
    def get(self, request, pk):
        resource = get_object_or_404(published_resources(request), pk=pk)
        if resource.archivo is None:
            raise NotFound('Este recurso no contiene una imagen publicada.')
        try:
            opened = default_storage.open(resource.archivo.archivo.name, 'rb')
        except FileNotFoundError:
            raise NotFound('La imagen no está disponible.') from None
        return FileResponse(opened, content_type=resource.archivo.mime)


class PublicSectionVideoView(PublicSectionMediaView):
    def get(self, request, pk):
        resource = get_object_or_404(
            published_resources(request), pk=pk
        )

        if (
            resource.tipo != 'video'
            or resource.archivo is None
            or resource.archivo.mime not in ('video/mp4', 'video/webm')
        ):
            raise NotFound('Video no disponible.')

        try:
            opened = default_storage.open(
                resource.archivo.archivo.name, 'rb'
            )
        except (FileNotFoundError, OSError):
            raise NotFound('Archivo no disponible.') from None

        response = FileResponse(
            opened, content_type=resource.archivo.mime
        )
        response['Content-Disposition'] = 'inline'
        return response
