from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework import status
from rest_framework.response import Response

from apps.core.presentation.responses import success_response, error_response
from apps.core.infrastructure.tenant import resolver_tienda_id, resolver_tienda
from apps.catalog.infrastructure.repositories import ProductRepository
from apps.catalog.infrastructure.attribute_filters import (
    FiltrosAtributosInvalidos,
    parse_attribute_params,
)
from apps.catalog.application.use_cases import ListPublicProductsUseCase , GetPublicProductDetailUseCase,GetPublicProductAttributesUseCase
from apps.catalog.application.use_cases import SoftDeleteProductUseCase
from .serializers import ProductPublicListItemSerializer, ProductPublicDetailSerializer, ProductPublicAttributesSerializer, ProductoCreateSerializer
from apps.core.models import Tienda
from rest_framework.permissions import IsAuthenticated
from ..application.use_cases import CrearProductoUseCase
from .serializers import ProductoAdminDetailSerializer
from ..application.use_cases import ObtenerProductoAdminUseCase
from .serializers import ProductoUpdateSerializer
from ..application.use_cases import ActualizarProductoAdminUseCase
from .serializers import ProductoStockUpdateSerializer
from ..application.use_cases import ActualizarStockProductoUseCase
from ..application.use_cases import ValidarDisponibilidadProductoUseCase

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

class ProductoCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        
        serializer = ProductoCreateSerializer(data=request.data)
        if serializer.is_valid():
            caso_uso = CrearProductoUseCase()
            producto = caso_uso.ejecutar(tienda, serializer.validated_data)
            return Response(
                {
                    "mensaje": "Producto creado con éxito", 
                    "id_producto": producto.id_producto
                },
                status=status.HTTP_201_CREATED
            )
            
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class ProductoAdminDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id_producto):
        tienda = resolver_tienda(request, exigir_propietario=True)
        
        caso_uso = ObtenerProductoAdminUseCase()
        producto = caso_uso.ejecutar(tienda, id_producto)
        
        serializer = ProductoAdminDetailSerializer(producto)
        return Response(serializer.data, status=status.HTTP_200_OK)

class ProductoUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, id_producto):
        tienda = resolver_tienda(request, exigir_propietario=True)
        serializer = ProductoUpdateSerializer(data=request.data, partial=True)
        
        if serializer.is_valid():
            caso_uso = ActualizarProductoAdminUseCase()
            producto = caso_uso.ejecutar(tienda, id_producto, serializer.validated_data)
            
            return Response(
                {
                    "mensaje": "Producto actualizado con éxito", 
                    "id_producto": producto.id_producto
                },
                status=status.HTTP_200_OK
            )
            
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class ProductoStockUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, id_producto):
        tienda = resolver_tienda(request, exigir_propietario=True)
        
        serializer = ProductoStockUpdateSerializer(data=request.data)
        
        if serializer.is_valid():
            caso_uso = ActualizarStockProductoUseCase()
            producto = caso_uso.ejecutar(tienda, id_producto, serializer.validated_data['stock'])
            
            return Response(
                {
                    "mensaje": "Stock actualizado con éxito", 
                    "stock_actual": producto.stock
                },
                status=status.HTTP_200_OK
            )
            
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class ValidarDisponibilidadAPIView(APIView):
    """Endpoint público para verificar stock antes de agregar al carrito o comprar"""
    permission_classes = [AllowAny]

    def post(self, request, id_producto):
        tienda_id = resolver_tienda_id(request)
        
        cantidad = request.data.get('cantidad', 1)
        
        try:
            cantidad = int(cantidad)
            if cantidad <= 0:
                raise ValueError("La cantidad a comprar debe ser mayor a 0.")
                
            caso_uso = ValidarDisponibilidadProductoUseCase()
            producto = caso_uso.ejecutar(tienda_id, id_producto, cantidad)
            
            return success_response(
                data={"stock_disponible": producto.stock},
                mensaje="El producto está disponible para la compra",
                status=status.HTTP_200_OK
            )
        except ValueError as e:
            return error_response(
                mensaje=str(e),
                codigo="COMPRA_INVALIDA",
                status=status.HTTP_400_BAD_REQUEST
            )
