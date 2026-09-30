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
from apps.catalog.application.services import VariantService

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
class ProductVariantsView(APIView):
    """
    """
    permission_classes = [AllowAny]

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.service = VariantService()

    def get(self, request, id_producto=None, product_id=None, sku=None):
        pid = str(id_producto or product_id)
        try:
            # Si la ruta incluye SKU, retorna esa variante específica
            if sku:
                variante = self.service.get_variant_by_sku(pid, sku)
                return Response(variante, status=status.HTTP_200_OK)

            # Si no hay SKU, lista todas las variantes del producto
            variantes = self.service.get_variants(pid)
            return Response(
                {
                    "mensaje": "Variantes obtenidas correctamente",
                    "id_producto": pid,
                    "variantes": variantes
                },
                status=status.HTTP_200_OK
            )
        except ValueError as e:
            return Response(
                {"error": str(e), "codigo": "RECURSO_NO_ENCONTRADO"},
                status=status.HTTP_404_NOT_FOUND
            )

    def post(self, request, id_producto=None, product_id=None):
        pid = str(id_producto or product_id)
        data = request.data

        # --- 1. Validaciones para el caso inválido de QA (HTTP 400) ---
        errores = {}

        if not data:
            return Response(
                {"error": "El cuerpo de la solicitud no puede estar vacío.", "codigo": "DATOS_INVALIDOS"},
                status=status.HTTP_400_BAD_REQUEST
            )

        sku = data.get("sku")
        if not sku or not str(sku).strip():
            errores["sku"] = "El campo 'sku' es obligatorio y no puede estar vacío."

        if "precio" not in data or data.get("precio") is None:
            errores["precio"] = "El campo 'precio' es obligatorio."
        else:
            try:
                precio = float(data["precio"])
                if precio < 0:
                    errores["precio"] = "El precio no puede ser negativo."
            except (ValueError, TypeError):
                errores["precio"] = "El precio debe ser un número válido."

        if "stock" in data and data.get("stock") is not None:
            try:
                stock = int(data["stock"])
                if stock < 0:
                    errores["stock"] = "El stock no puede ser negativo."
            except (ValueError, TypeError):
                errores["stock"] = "El stock debe ser un número entero válido."

        if errores:
            return Response(
                {
                    "mensaje": "La solicitud contiene datos inválidos",
                    "codigo": "ERROR_VALIDACION",
                    "errores": errores
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # --- 2. Persistencia con VariantService (HTTP 201) ---
        payload = {
            "sku": str(data["sku"]).strip().upper(),
            "precio": float(data["precio"]),
            "stock": int(data.get("stock", 0)),
            "nombre": data.get("nombre", f"Variante {str(data['sku']).strip().upper()}"),
            "atributos": data.get("atributos", {})
        }

        try:
            variante_creada = self.service.create_variant(pid, payload)
            return Response(
                {
                    "mensaje": "Variante creada y asociada al producto exitosamente",
                    "id_producto": pid,
                    "variante": variante_creada
                },
                status=status.HTTP_201_CREATED
            )
        except ValueError as e:
            return Response(
                {"error": str(e), "codigo": "ERROR_CREACION"},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {"error": f"Error interno al guardar: {str(e)}", "codigo": "ERROR_INTERNO"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )