"""Reproduccion publica de clips asociados a productos activos de una tienda."""
from uuid import UUID

from django.core.files.storage import default_storage
from django.http import FileResponse, Http404
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.core.infrastructure.tenant import resolver_tienda_id
from apps.catalog.application.use_cases import GetPublicProductDetailUseCase
from apps.catalog.infrastructure.repositories import ProductRepository
from apps.landing.models import RecursoMultimedia


class PublicProductVideoView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug):
        tienda_id = resolver_tienda_id(request)
        producto = GetPublicProductDetailUseCase(ProductRepository()).execute(tienda_id, slug)
        if not producto:
            raise Http404("Producto no disponible.")

        try:
            resource_id = UUID(str(producto.get("video_recurso_id")))
        except (ValueError, TypeError, AttributeError):
            raise Http404("Este producto no tiene video.")

        recurso = RecursoMultimedia.objects.select_related("archivo").filter(
            pk=resource_id,
            tienda_id=tienda_id,
            tipo="video",
            activo=True,
            eliminado=False,
            archivo__isnull=False,
        ).first()
        if not recurso or recurso.archivo.mime not in ("video/mp4", "video/webm"):
            raise Http404("Video no disponible.")

        try:
            abierto = default_storage.open(recurso.archivo.archivo.name, "rb")
        except (OSError, FileNotFoundError):
            raise Http404("Archivo no disponible.")

        respuesta = FileResponse(abierto, content_type=recurso.archivo.mime)
        respuesta["Content-Disposition"] = "inline"
        respuesta["Cache-Control"] = "no-store"
        respuesta["X-Content-Type-Options"] = "nosniff"
        return respuesta
