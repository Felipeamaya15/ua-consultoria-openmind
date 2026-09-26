from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework import status

from apps.core.presentation.responses import success_response, error_response
from apps.core.infrastructure.tenant import resolver_tienda_id
from apps.catalog.infrastructure.repositories import ProductRepository
from apps.catalog.application.use_cases import ListPublicProductsUseCase , GetPublicProductDetailUseCase,GetPublicProductAttributesUseCase
from apps.catalog.application.use_cases import SoftDeleteProductUseCase
from .serializers import ProductPublicListItemSerializer, ProductPublicDetailSerializer, ProductPublicAttributesSerializer
from apps.core.models import Tienda
from rest_framework.permissions import IsAuthenticated


class PublicProductListAPIView(APIView):
    """Listado público de productos activos del catálogo."""
    permission_classes = [AllowAny]

    def get(self, request):
        tienda_id = resolver_tienda_id(request)

        use_case = ListPublicProductsUseCase(ProductRepository())
        productos = use_case.execute(tienda_id)

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

class ProductDeleteAPIView(APIView):
   
    permission_classes = [IsAuthenticated]

    def delete(self, request, producto_id):
        try:
            tienda_id = resolver_tienda_id(request)
            
          
            if not Tienda.objects.filter(id_tienda=tienda_id, id_usuario_propietario=request.user).exists():
                return error_response(
                    mensaje="No tienes permisos de administrador para eliminar productos en esta tienda.",
                    codigo="ACCESO_DENEGADO",
                    status=403
                )
            
           
            use_case = SoftDeleteProductUseCase()
            resultado = use_case.execute(id_producto=producto_id, tienda_id=tienda_id)
            
            return success_response(mensaje=resultado["mensaje"])
            
        except ValueError as e:
            return error_response(mensaje=str(e), codigo="PRODUCTO_NO_ELIMINADO", status=404)
        except Exception as e:
            return error_response(
                mensaje="Ocurrió un error interno al intentar eliminar el producto", 
                codigo="ERROR_INTERNO", 
                status=500
            )