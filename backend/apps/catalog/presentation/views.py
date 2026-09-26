from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework import status

from apps.core.presentation.responses import success_response, error_response
from apps.core.infrastructure.tenant import resolver_tienda_id
from apps.catalog.infrastructure.repositories import ProductRepository
from apps.catalog.infrastructure.attribute_filters import (
    FiltrosAtributosInvalidos,
    parse_attribute_params,
)
from apps.catalog.application.use_cases import ListPublicProductsUseCase , GetPublicProductDetailUseCase,GetPublicProductAttributesUseCase
from .serializers import ProductPublicListItemSerializer, ProductPublicDetailSerializer, ProductPublicAttributesSerializer


class PublicProductListAPIView(APIView):
    """Listado público de productos activos del catálogo."""
    permission_classes = [AllowAny]

    def get(self, request):
        tienda_id = resolver_tienda_id(request)

        try:
            atributos = parse_attribute_params(request.query_params)
        except FiltrosAtributosInvalidos as error:
            return error_response(
                mensaje=str(error),
                codigo="ERROR_VALIDACION",
                status=status.HTTP_400_BAD_REQUEST,
            )

        use_case = ListPublicProductsUseCase(ProductRepository())
        productos = use_case.execute(tienda_id, atributos=atributos)

        data = ProductPublicListItemSerializer(productos, many=True).data

        return success_response(
            data=data,
            mensaje="Listado de productos obtenido correctamente",
            status=status.HTTP_200_OK,
        )
class PublicProductDetailAPIView(APIView):
    """Detalle público de un producto identificado por su slug."""
    permission_classes = [AllowAny]
 
    def get(self, request, slug):
        tienda_id = resolver_tienda_id(request)
 
        use_case = GetPublicProductDetailUseCase(ProductRepository())
        producto = use_case.execute(tienda_id, slug)
 
        if producto is None:
            return error_response(
                mensaje="El producto solicitado no fue encontrado",
                codigo="RECURSO_NO_ENCONTRADO",
                status=status.HTTP_404_NOT_FOUND,
            )
 
        data = ProductPublicDetailSerializer(producto).data
 
        return success_response(
            data=data,
            mensaje="Detalle de producto obtenido correctamente",
            status=status.HTTP_200_OK,
        )

class PublicProductAttributesAPIView(APIView):
    """Atributos de un producto identificado por su slug."""
    permission_classes = [AllowAny]
 
    def get(self, request, slug):
        tienda_id = resolver_tienda_id(request)
 
        use_case = GetPublicProductAttributesUseCase(ProductRepository())
        atributos = use_case.execute(tienda_id, slug)
 
        if atributos is None:
            return error_response(
                mensaje="El producto solicitado no fue encontrado",
                codigo="RECURSO_NO_ENCONTRADO",
                status=status.HTTP_404_NOT_FOUND,
            )
 
        data = ProductPublicAttributesSerializer(atributos).data
 
        return success_response(
            data=data,
            mensaje="Atributos de producto obtenidos correctamente",
            status=status.HTTP_200_OK,
        )
    
