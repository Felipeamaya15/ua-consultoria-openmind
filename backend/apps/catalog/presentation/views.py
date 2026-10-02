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

from .serializers import ProductPublicListItemSerializer, ProductPublicDetailSerializer, ProductPublicAttributesSerializer

from apps.core.models import Tienda

from rest_framework.permissions import IsAuthenticated

from ..application.use_cases import CreateProductUseCase
from .serializers import ProductCreateSerializer, ProductAdminDetailSerializer
from ..application.use_cases import UpdateCatalogProductUseCase, ProductEditConflict
from pymongo.errors import DuplicateKeyError, PyMongoError
from bson import ObjectId

from .serializers import ProductoAdminDetailSerializer

from ..application.use_cases import ObtenerProductoAdminUseCase

from .serializers import ProductoUpdateSerializer

from ..application.use_cases import ActualizarProductoAdminUseCase

from .serializers import ProductoStockUpdateSerializer

from ..application.use_cases import ActualizarStockProductoUseCase

from ..application.use_cases import ValidarDisponibilidadProductoUseCase

from ..application.services import VariantService
from .serializers import VarianteStockUpdateSerializer


class VarianteStockUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, id_producto, sku):
        tienda_id = resolver_tienda_id(
            request,
            exigir_propietario=True
        )

        serializer = VarianteStockUpdateSerializer(data=request.data)

        if not serializer.is_valid():
            return error_response(
                mensaje="El stock enviado no es válido.",
                codigo="ERROR_VALIDACION",
                detalles=serializer.errors,
            )

        variante = VariantService().update_stock(
            tienda_id,
            id_producto,
            sku,
            serializer.validated_data["stock"],
        )

        if variante is None:
            return error_response(
                mensaje="El producto o la variante no existe en esta tienda.",
                codigo="RECURSO_NO_ENCONTRADO",
                status=status.HTTP_404_NOT_FOUND,
            )

        return success_response(
            data={
                "producto_id": id_producto,
                "sku": variante["sku"],
                "stock": variante["stock"],
            },
            mensaje="Stock de variante actualizado correctamente",
        )

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


    def delete(self, request, producto_id=None, id_producto=None):

        try:

            tienda_id = resolver_tienda_id(request)
            #Eliminación de producto, verificando propiedad.
          
            if not Tienda.objects.filter(id_tienda=tienda_id, id_usuario_propietario=request.user).exists():

                return error_response(

                    mensaje="No tienes permisos de administrador para eliminar productos en esta tienda.",

                    codigo="ACCESO_DENEGADO",

                    status=403

                )


            use_case = SoftDeleteProductUseCase()

            resultado = use_case.execute(id_producto=producto_id or id_producto, tienda_id=tienda_id)


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

        serializer = ProductCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            product_id = CreateProductUseCase(ProductRepository()).execute(
                str(tienda.pk), serializer.validated_data
            )
        except (DuplicateKeyError, ValueError) as error:
            return error_response(str(error) if isinstance(error, ValueError) else
                "El SKU o slug ya existe en esta tienda.", "ERROR_VALIDACION")
        except PyMongoError:
            return error_response("No se pudo persistir el producto en el catálogo.",
                "ERROR_PERSISTENCIA", status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return success_response(
            data={"id": product_id},
            mensaje="Producto creado con éxito",
            status=status.HTTP_201_CREATED
        )


class ProductoAdminDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, id_producto=None):
        tienda = resolver_tienda(request, exigir_propietario=True)
        if id_producto is None or ObjectId.is_valid(str(id_producto)):
            try:
                repository = ProductRepository()
                if id_producto is None:
                    products = repository.list_by_store(str(tienda.pk))
                    return success_response(data=ProductAdminDetailSerializer(products, many=True).data)
                product = repository.get_admin_product(str(tienda.pk), id_producto)
                if product is None:
                    return error_response("Producto no encontrado en esta tienda.", "RECURSO_NO_ENCONTRADO", status=404)
                return success_response(data=ProductAdminDetailSerializer(product).data)
            except PyMongoError:
                return error_response("No se pudo consultar el catálogo.", "ERROR_PERSISTENCIA", status=503)
        caso_uso = ObtenerProductoAdminUseCase()

        try:
            producto = caso_uso.ejecutar(tienda, id_producto)
            
            if producto is None:
                return Response(
                    {
                        "mensaje": "El producto solicitado no fue encontrado", 
                        "codigo": "RECURSO_NO_ENCONTRADO"
                    },
                    status=status.HTTP_404_NOT_FOUND
                )

            serializer = ProductoAdminDetailSerializer(producto)
            return Response(serializer.data, status=status.HTTP_200_OK)
            
        except Exception:
            return Response(
                {
                    "mensaje": "El producto solicitado no fue encontrado", 
                    "codigo": "RECURSO_NO_ENCONTRADO"
                },
                status=status.HTTP_404_NOT_FOUND
            )

class ProductoUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, id_producto):
        return self._actualizar(request, id_producto)

    def patch(self, request, id_producto):
        return self._actualizar(request, id_producto)

    def _actualizar(self, request, id_producto):
        tienda = resolver_tienda(request, exigir_propietario=True)
        if ObjectId.is_valid(str(id_producto)):
            return self._actualizar_mongo(request, str(tienda.pk), id_producto)
        serializer = ProductoUpdateSerializer(data=request.data, partial=True)

        serializer.is_valid(raise_exception=True)

        caso_uso = ActualizarProductoAdminUseCase()

        try:
            producto = caso_uso.ejecutar(tienda, id_producto, serializer.validated_data)

            if producto is None:
                return Response(
                    {"mensaje": "El producto a actualizar no existe", "codigo": "RECURSO_NO_ENCONTRADO"},
                    status=status.HTTP_404_NOT_FOUND
                )

            return Response(
                {
                    "mensaje": "Producto actualizado con éxito",
                    "id_producto": producto.id_producto
                },
                status=status.HTTP_200_OK
            )
            
        except Exception:
            return Response(
                {"mensaje": "El producto a actualizar no existe", "codigo": "RECURSO_NO_ENCONTRADO"},
                status=status.HTTP_404_NOT_FOUND
            )

    def _actualizar_mongo(self, request, tienda_id, product_id):
        try:
            repository = ProductRepository()
            original = repository.get_admin_product(tienda_id, product_id)
            if original is None:
                return error_response("Producto no encontrado en esta tienda.", "RECURSO_NO_ENCONTRADO", status=404)
            revision = request.data.get('revision')
            if not isinstance(revision, str) or not revision:
                return error_response("Recarga el producto antes de editar: falta revision.", "ERROR_VALIDACION")
            # Validar el documento completo también para PATCH; no perder campos omitidos.
            serializer = ProductCreateSerializer(data={**original, **request.data})
            serializer.is_valid(raise_exception=True)
            fields = {key: value for key, value in serializer.validated_data.items()
                      if request.method == 'PUT' or key in request.data}
            product = UpdateCatalogProductUseCase(repository).execute(
                tienda_id, original, fields, revision,
            )
            return success_response(data=ProductAdminDetailSerializer(product).data,
                                    mensaje="Producto actualizado correctamente")
        except ProductEditConflict as error:
            return error_response(str(error), "CONFLICTO_EDICION", status=409)
        except (DuplicateKeyError, ValueError) as error:
            return error_response(str(error) if isinstance(error, ValueError) else
                                  "El SKU ya existe en esta tienda.", "ERROR_VALIDACION")
        except PyMongoError:
            return error_response("No se pudo guardar el producto.", "ERROR_PERSISTENCIA", status=503)


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

    def delete(self, request, id_producto=None, product_id=None, sku=None):

        """

        Eliminación administrativa de una variante (SCRUM-248).

        """

        pid = str(id_producto or product_id)

        if not sku:

            return Response(

                {"error": "Debe especificar el identificador o SKU de la variante a eliminar en la URL.", "codigo": "PARAMETRO_FALTANTE"},

                status=status.HTTP_400_BAD_REQUEST

            )


        soft_param = request.query_params.get("soft", "false").lower() in ("true", "1")


        try:

            sku_eliminado = self.service.delete_variant(pid, sku, soft_delete=soft_param)

            return Response(

                {

                    "mensaje": "Variante eliminada exitosamente",

                    "id_producto": pid,

                    "sku": sku_eliminado

                },

                status=status.HTTP_200_OK

            )

        except ValueError as e:

            return Response(

                {"error": str(e), "codigo": "RECURSO_NO_ENCONTRADO"},

                status=status.HTTP_404_NOT_FOUND

            )

        except Exception as e:

            return Response(

                {"error": f"Error interno al eliminar variante: {str(e)}", "codigo": "ERROR_INTERNO"},

                status=status.HTTP_500_INTERNAL_SERVER_ERROR

            )


    def put(self, request, id_producto=None, product_id=None, sku=None):

        return self._actualizar_variante(request, id_producto or product_id, sku)


    def patch(self, request, id_producto=None, product_id=None, sku=None):

        return self._actualizar_variante(request, id_producto or product_id, sku)


    def _actualizar_variante(self, request, id_producto, sku):

        pid = str(id_producto)

        data = request.data


        if not sku:

            return Response(

                {"error": "Debe especificar el identificador de la variante en la URL.", "codigo": "PARAMETRO_FALTANTE"},

                status=status.HTTP_400_BAD_REQUEST

            )


        if not data or not isinstance(data, dict):

            return Response(

                {"error": "El cuerpo de la solicitud no puede estar vacío.", "codigo": "DATOS_INVALIDOS"},

                status=status.HTTP_400_BAD_REQUEST

            )


        # Validaciones para el caso de datos inválidos (HTTP 400)

        errores = {}


        if "precio" in data:

            try:

                precio = float(data["precio"])

                if precio < 0:

                    errores["precio"] = "El precio no puede ser negativo."

            except (ValueError, TypeError):

                errores["precio"] = "El precio debe ser un número válido."


        if "stock" in data:

            try:

                stock = int(data["stock"])

                if stock < 0:

                    errores["stock"] = "El stock no puede ser negativo."

            except (ValueError, TypeError):

                errores["stock"] = "El stock debe ser un número entero válido."


        if errores:

            return Response(

                {

                    "mensaje": "La actualización contiene datos inválidos",

                    "codigo": "ERROR_VALIDACION",

                    "errores": errores

                },

                status=status.HTTP_400_BAD_REQUEST

            )


        # Campos permitidos para edición

        campos_permitidos = [
            "precio",
            "stock",
            "nombre",
            "atributos_variante",
            "atributos",
        ]

        datos_a_actualizar = {}

        for campo in campos_permitidos:

            if campo in data:

                if campo == "precio":

                    datos_a_actualizar[campo] = float(data[campo])

                elif campo == "stock":

                    datos_a_actualizar[campo] = int(data[campo])

                else:

                    datos_a_actualizar[campo] = data[campo]


        if not datos_a_actualizar:

            return Response(

                {"error": "No se enviaron campos válidos para actualizar.", "codigo": "SIN_CAMBIOS"},

                status=status.HTTP_400_BAD_REQUEST

            )


        try:

            variante_actualizada = self.service.update_variant(pid, sku, datos_a_actualizar)

            return Response(

                {

                    "mensaje": "Variante actualizada exitosamente",

                    "id_producto": pid,

                    "variante": variante_actualizada

                },

                status=status.HTTP_200_OK

            )

        except ValueError as e:

            msg = str(e)

            if "No se encontró" in msg:

                return Response({"error": msg, "codigo": "RECURSO_NO_ENCONTRADO"}, status=status.HTTP_404_NOT_FOUND)

            return Response({"error": msg, "codigo": "ERROR_VALIDACION"}, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:

            return Response({"error": f"Error interno: {str(e)}", "codigo": "ERROR_INTERNO"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


    def post(self, request, id_producto=None, product_id=None, sku=None):

        pid = str(id_producto or product_id)


        if sku:

            data = request.data or {}

            try:

                cantidad = int(data.get("cantidad", 1))

                if cantidad <= 0:

                    return Response(

                        {"error": "La cantidad a comprar debe ser un número entero mayor a 0.", "codigo": "CANTIDAD_INVALIDA"},

                        status=status.HTTP_400_BAD_REQUEST

                    )

            except (ValueError, TypeError):

                return Response(

                    {"error": "La cantidad a comprar debe ser un número entero válido.", "codigo": "CANTIDAD_INVALIDA"},

                    status=status.HTTP_400_BAD_REQUEST

                )


            try:

                variante_actualizada = self.service.process_purchase(pid, sku, cantidad=cantidad)

                return Response(

                    {

                        "mensaje": "Compra realizada exitosamente",

                        "id_producto": pid,

                        "sku": variante_actualizada.get("sku"),

                        "cantidad_comprada": cantidad,

                        "stock_actual": variante_actualizada.get("stock"),

                        "variante": variante_actualizada

                    },

                    status=status.HTTP_200_OK

                )

            except ValueError as e:

                msg = str(e)

                if "no existe" in msg or "No se encontró" in msg:

                    return Response(

                        {"error": msg, "codigo": "RECURSO_NO_ENCONTRADO"},

                        status=status.HTTP_404_NOT_FOUND

                    )

                # Rechazo controlado cuando el stock es 0 o insuficiente

                return Response(

                    {"error": msg, "codigo": "STOCK_INSUFICIENTE"},

                    status=status.HTTP_400_BAD_REQUEST

                )

            except Exception as e:

                return Response(

                    {"error": f"Error interno al procesar compra: {str(e)}", "codigo": "ERROR_INTERNO"},

                    status=status.HTTP_500_INTERNAL_SERVER_ERROR

                )


        data = request.data


        # --- 1. Validaciones para el caso inválido de QA (HTTP 400) ---

        errores = {}


        if not data:

            return Response(

                {"error": "El cuerpo de la solicitud no puede estar vacío.", "codigo": "DATOS_INVALIDOS"},

                status=status.HTTP_400_BAD_REQUEST

            )


        sku_input = data.get("sku")

        if not sku_input or not str(sku_input).strip():

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

            "atributos_variante": data.get(
                "atributos_variante",
                data.get("atributos", [])
            )
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

class VariantPurchaseView(APIView):

    """

    Endpoint para procesar compras de variantes y validar stock atómico.

    """

    permission_classes = [AllowAny]


    def __init__(self, **kwargs):

        super().__init__(**kwargs)

        self.service = VariantService()


    def post(self, request, id_producto=None, product_id=None, sku=None):

        pid = str(id_producto or product_id)

        if not sku:

            return Response(

                {"error": "Debe especificar la variante a comprar en la URL.", "codigo": "PARAMETRO_FALTANTE"},

                status=status.HTTP_400_BAD_REQUEST

            )


        data = request.data or {}

        try:

            cantidad = int(data.get("cantidad", 1))

            if cantidad <= 0:

                raise ValueError()

        except (ValueError, TypeError):

            return Response(

                {"error": "La cantidad a comprar debe ser un número entero mayor a 0.", "codigo": "CANTIDAD_INVALIDA"},

                status=status.HTTP_400_BAD_REQUEST

            )


        try:

            variante_actualizada = self.service.process_purchase(pid, sku, cantidad=cantidad)

            return Response(

                {

                    "mensaje": "Compra realizada exitosamente",

                    "id_producto": pid,

                    "sku": variante_actualizada.get("sku"),

                    "cantidad_comprada": cantidad,

                    "stock_actual": variante_actualizada.get("stock"),

                    "variante": variante_actualizada

                },

                status=status.HTTP_200_OK

            )

        except ValueError as e:

            msg = str(e)

            if "no existe" in msg or "No se encontró" in msg:

                return Response({"error": msg, "codigo": "RECURSO_NO_ENCONTRADO"}, status=status.HTTP_404_NOT_FOUND)

            return Response({"error": msg, "codigo": "STOCK_INSUFICIENTE"}, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:

            return Response({"error": f"Error interno: {str(e)}", "codigo": "ERROR_INTERNO"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
