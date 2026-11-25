"""Imágenes públicas del catálogo comercial, sin modificar MongoDB."""
from django.core.exceptions import ValidationError
from django.http import Http404, HttpResponse
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.catalog.application.use_cases import (
    GetPublicProductDetailUseCase,
)
from apps.catalog.infrastructure.repositories import ProductRepository
from apps.core.image_processing import process_data_url
from apps.core.infrastructure.tenant import resolver_tienda_id


class PublicProductMetaImageView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, slug, index):
        if index < 0 or index > 9:
            raise Http404("Imagen no disponible.")

        store_id = resolver_tienda_id(request)
        product = GetPublicProductDetailUseCase(
            ProductRepository()
        ).execute(store_id, slug)

        if not product:
            raise Http404("Producto no disponible.")

        images = product.get("imagenes") or []

        if not isinstance(images, list) or index >= len(images):
            raise Http404("Imagen no disponible.")

        raw = images[index]

        if not isinstance(raw, str) or not raw.startswith("data:image/"):
            raise Http404("Imagen no disponible.")

        try:
            image = process_data_url(raw, max_mb=2)
        except (ValidationError, ValueError, TypeError):
            raise Http404("Imagen inválida.") from None

        response = HttpResponse(
            image.data,
            content_type=image.mime,
        )
        response["Content-Disposition"] = "inline"
        response["Cache-Control"] = "public, max-age=300"
        response["X-Content-Type-Options"] = "nosniff"
        return response
