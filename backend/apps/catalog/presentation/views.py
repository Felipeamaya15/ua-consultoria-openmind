from rest_framework.exceptions import PermissionDenied
from .serializers import ProductPublicListItemSerializer, ProductPublicDetailSerializer, ProductPublicAttributesSerializer

from apps.core.models import Tienda, Producto

from ..application.use_cases import CreateProductUseCase
from .serializers import ProductCreateSerializer, ProductAdminDetailSerializer
from ..application.use_cases import UpdateCatalogProductUseCase, ProductEditConflict
from pymongo.errors import DuplicateKeyError, PyMongoError
from bson import ObjectId


# 1. Framework & Librerías de terceros (DRF)
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from apps.authentication.permissions import IsStoreOwner
from rest_framework.views import APIView

# 2. Módulos Core (Infraestructura, Modelos y Respuestas comunes)
from apps.core.infrastructure.tenant import resolver_tienda, resolver_tienda_id
from apps.core.presentation.responses import error_response, success_response

# 3. Catálogo - Capa de Dominio (Excepciones)
from apps.catalog.domain.exceptions import (
    CantidadInvalidaException,
    ItemCarritoNoEncontradoException,
    ProductoNoEncontradoException,
    StockInsuficienteException,
    VarianteNoEncontradaException,
    ConfiguracionPagoInvalidaException,
    TiendaNoAutorizadaException,
    # Nuevas excepciones - Adaptador Transbank
    TransbankTransaccionException,
    TransbankRechazoException,
    TransbankConfiguracionFaltanteException,
)

# 4. Catálogo - Capa de Aplicación (Servicios y Casos de Uso)
from apps.catalog.application.services import VariantService
from apps.catalog.application.use_cases import (
    ActualizarProductoAdminUseCase,
    ActualizarStockProductoUseCase,
    AgregarItemCarritoDTO,
    AgregarItemCarritoUseCase,
    ConsultarCarritoUseCase,
    CrearProductoUseCase,
    EliminarItemCarritoDTO,
    EliminarItemCarritoUseCase,
    GetPublicProductAttributesUseCase,
    GetPublicProductDetailUseCase,
    GuardarConfiguracionTransbankDTO,
    GuardarConfiguracionTransbankUseCase,
    ListPublicProductsUseCase,
    ModificarCantidadDTO,
    ModificarCantidadItemUseCase,
    ObtenerConfiguracionTransbankUseCase,
    ObtenerProductoAdminUseCase,
    SoftDeleteProductUseCase,
    ValidarDisponibilidadProductoUseCase,
    # Nuevos Casos de Uso y DTOs - Adaptador Transbank
    IniciarPagoTransbankDTO,
    IniciarPagoTransbankUseCase,
    ConfirmarPagoTransbankUseCase,
    #PayPal
    GuardarConfiguracionPayPalDTO,
    ObtenerConfiguracionPayPalUseCase,
    GuardarConfiguracionPayPalUseCase,
    #MercadoPago
    GuardarConfiguracionMercadoPagoDTO,
    ObtenerConfiguracionMercadoPagoUseCase,
    GuardarConfiguracionMercadoPagoUseCase,

)

# 5. Catálogo - Capa de Infraestructura (Repositorios y Filtros)
from apps.catalog.infrastructure.attribute_filters import (
    FiltrosAtributosInvalidos,
    parse_attribute_params,
)
from apps.catalog.infrastructure.repositories import ProductRepository

# 6. Catálogo - Capa de Presentación (Serializadores)
from .serializers import AgregarItemCarritoRequestSerializer, ConfiguracionTransbankInputSerializer, ConfiguracionTransbankResponseSerializer, ItemCarritoResponseSerializer, ModificarCantidadRequestSerializer, ProductoAdminDetailSerializer, ProductoCreateSerializer, ProductoStockUpdateSerializer, ProductoUpdateSerializer, VarianteStockUpdateSerializer, IniciarPagoTransbankSerializer, ConfirmarPagoTransbankSerializer, ConfiguracionPayPalInputSerializer, ConfiguracionPayPalResponseSerializer, ConfiguracionMercadoPagoInputSerializer, ConfiguracionMercadoPagoResponseSerializer


class StorePaymentConfigurationView(APIView):
    permission_classes = [IsAuthenticated, IsStoreOwner]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        tienda = resolver_tienda(request, exigir_propietario=True)
        if str(kwargs.get('id_tienda')) != str(tienda.pk):
            raise PermissionDenied('Solo puedes administrar la configuración de tu propia tienda.')


class ConfiguracionMercadoPagoView(StorePaymentConfigurationView):
    """
    GET: Consulta la configuración actual de Mercado Pago para la tienda.
    POST: Actualiza credenciales y estado de activación.
    """

    def get(self, request, id_tienda):
        use_case = ObtenerConfiguracionMercadoPagoUseCase()
        datos = use_case.execute(id_tienda=id_tienda)
        serializer = ConfiguracionMercadoPagoResponseSerializer(datos)
        return Response(
            {
                "exito": True,
                "mensaje": "Configuración de Mercado Pago obtenida correctamente.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request, id_tienda):
        serializer = ConfiguracionMercadoPagoInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "exito": False,
                    "mensaje": "Datos del formulario inválidos.",
                    "error": {"codigo": "DATOS_INVALIDOS", "detalles": serializer.errors},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        dto = GuardarConfiguracionMercadoPagoDTO(
            id_tienda=id_tienda,
            **serializer.validated_data
        )

        use_case = GuardarConfiguracionMercadoPagoUseCase()
        try:
            resultado = use_case.execute(id_tienda=id_tienda, dto=dto)
            response_serializer = ConfiguracionMercadoPagoResponseSerializer(resultado)
            return Response(
                {
                    "exito": True,
                    "mensaje": "Configuración de Mercado Pago guardada exitosamente.",
                    "data": response_serializer.data,
                },
                status=status.HTTP_200_OK,
            )
        except ConfiguracionPagoInvalidaException as e:
            return Response(
                {
                    "exito": False,
                    "mensaje": str(e),
                    "error": {"codigo": "CONFIGURACION_INVALIDA", "detalles": None},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
















class ConfiguracionPayPalView(StorePaymentConfigurationView):
    """
    GET: Consulta la configuración actual de PayPal para la tienda.
    POST: Actualiza credenciales y estado de activación.
    """

    def get(self, request, id_tienda):
        use_case = ObtenerConfiguracionPayPalUseCase()
        datos = use_case.execute(id_tienda=id_tienda)
        serializer = ConfiguracionPayPalResponseSerializer(datos)
        return Response(
            {
                "exito": True,
                "mensaje": "Configuración de PayPal obtenida correctamente.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request, id_tienda):
        serializer = ConfiguracionPayPalInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "exito": False,
                    "mensaje": "Datos del formulario inválidos.",
                    "error": {"codigo": "DATOS_INVALIDOS", "detalles": serializer.errors},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        dto = GuardarConfiguracionPayPalDTO(
            id_tienda=id_tienda,
            **serializer.validated_data
        )

        use_case = GuardarConfiguracionPayPalUseCase()
        try:
            resultado = use_case.execute(id_tienda=id_tienda, dto=dto)
            response_serializer = ConfiguracionPayPalResponseSerializer(resultado)
            return Response(
                {
                    "exito": True,
                    "mensaje": "Configuración de PayPal guardada exitosamente.",
                    "data": response_serializer.data,
                },
                status=status.HTTP_200_OK,
            )
        except ConfiguracionPagoInvalidaException as e:
            return Response(
                {
                    "exito": False,
                    "mensaje": str(e),
                    "error": {"codigo": "CONFIGURACION_INVALIDA", "detalles": None},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )









class ConfiguracionTransbankView(StorePaymentConfigurationView):
    """
    Endpoint para consultar y actualizar las credenciales de Transbank de una tienda.
    GET/POST /api/catalog/tiendas/<int:id_tienda>/configuracion/transbank/
    """

    def get(self, request, id_tienda: int):
        use_case = ObtenerConfiguracionTransbankUseCase()
        try:
            config = use_case.execute(usuario_id=request.user.id, id_tienda=id_tienda)
            if not config:
                return Response(
                    {
                        "exito": True,
                        "mensaje": "La tienda aún no tiene configurado Transbank.",
                        "data": {
                            "configurado": False,
                            "id_tienda": id_tienda,
                            "codigo_comercio": "597055555532",
                            "ambiente": "INTEGRACION",
                            "activo": False,
                            "api_key_enmascarada": ""
                        }
                    },
                    status=status.HTTP_200_OK
                )

            data = ConfiguracionTransbankResponseSerializer(config).data
            data["configurado"] = True
            return Response(
                {"exito": True, "mensaje": "Configuración obtenida exitosamente.", "data": data},
                status=status.HTTP_200_OK
            )
        except TiendaNoAutorizadaException as e:
            return Response(
                {"exito": False, "mensaje": str(e), "error": {"codigo": "NO_AUTORIZADO", "detalles": None}},
                status=status.HTTP_403_FORBIDDEN
            )

    def post(self, request, id_tienda: int):
        serializer = ConfiguracionTransbankInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "exito": False,
                    "mensaje": "Datos del formulario inválidos.",
                    "error": {"codigo": "DATOS_INVALIDOS", "detalles": serializer.errors}
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        dto = GuardarConfiguracionTransbankDTO(
            usuario_id=request.user.id,
            id_tienda=id_tienda,
            codigo_comercio=serializer.validated_data["codigo_comercio"],
            api_key=serializer.validated_data["api_key"],
            ambiente=serializer.validated_data["ambiente"],
            activo=serializer.validated_data.get("activo", True)
        )

        use_case = GuardarConfiguracionTransbankUseCase()

        try:
            config_guardada = use_case.execute(dto)
            data = ConfiguracionTransbankResponseSerializer(config_guardada).data
            data["configurado"] = True
            return Response(
                {
                    "exito": True,
                    "mensaje": "Configuración de Transbank guardada exitosamente.",
                    "data": data
                },
                status=status.HTTP_200_OK
            )
        except ConfiguracionPagoInvalidaException as e:
            return Response(
                {"exito": False, "mensaje": str(e), "error": {"codigo": "CONFIGURACION_INVALIDA", "detalles": None}},
                status=status.HTTP_400_BAD_REQUEST
            )
        except TiendaNoAutorizadaException as e:
            return Response(
                {"exito": False, "mensaje": str(e), "error": {"codigo": "NO_AUTORIZADO", "detalles": None}},
                status=status.HTTP_403_FORBIDDEN
            )
        except Exception as e:
            return Response(
                {"exito": False, "mensaje": "No se pudo guardar la configuración de Webpay.", "error": {"codigo": "ERROR_INTERNO", "detalles": None}},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )






class CarritoItemsView(APIView):
    """
    Endpoint para listar y agregar productos o variantes al carrito del usuario autenticado.
    POST /api/catalog/carrito/items/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        """Recupera los ítems del carrito del usuario autenticado."""
        items = ConsultarCarritoUseCase().execute(request.user.id, resolver_tienda_id(request))
        data = ItemCarritoResponseSerializer(items, many=True).data
        return success_response(
            data=data,
            mensaje="Carrito obtenido exitosamente." if items else "El carrito está vacío.",
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        serializer = AgregarItemCarritoRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "exito": False,
                    "mensaje": "Datos de entrada inválidos.",
                    "error": {
                        "codigo": "DATOS_INVALIDOS",
                        "detalles": serializer.errors
                    }
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        id_producto = serializer.validated_data.get("id_producto")
        slug = serializer.validated_data.get("slug")

        dto = AgregarItemCarritoDTO(
            usuario_id=request.user.id,
            id_producto=id_producto,
            cantidad=serializer.validated_data.get("cantidad", 1),
            sku=serializer.validated_data.get("sku"),
            slug=slug,
            tienda_id=resolver_tienda_id(request),
        )

        use_case = AgregarItemCarritoUseCase()

        try:
            item = use_case.execute(dto)
            response_serializer = ItemCarritoResponseSerializer(item)
            return Response(
                {
                    "exito": True,
                    "mensaje": "Producto agregado al carrito exitosamente.",
                    "data": response_serializer.data
                },
                status=status.HTTP_201_CREATED
            )
        except CantidadInvalidaException as e:
            return Response(
                {"exito": False, "mensaje": str(e), "error": {"codigo": "CANTIDAD_INVALIDA", "detalles": None}},
                status=status.HTTP_400_BAD_REQUEST
            )
        except StockInsuficienteException as e:
            return Response(
                {"exito": False, "mensaje": str(e), "error": {"codigo": "STOCK_INSUFICIENTE", "detalles": None}},
                status=status.HTTP_400_BAD_REQUEST
            )
        except (ProductoNoEncontradoException, VarianteNoEncontradaException) as e:
            return Response(
                {"exito": False, "mensaje": str(e), "error": {"codigo": "RECURSO_NO_ENCONTRADO", "detalles": None}},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"exito": False, "mensaje": "No se pudo procesar el carrito.", "error": {"codigo": "ERROR_INTERNO", "detalles": None}},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class ModificarCantidadItemAPIView(APIView):
    """
    Endpoint para modificar la cantidad de un ítem en el carrito del usuario autenticado.
    PATCH /api/catalog/carrito/items/<id_item_carrito>/
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, id_item_carrito):
        serializer = ModificarCantidadRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        dto = ModificarCantidadDTO(
            id_item_carrito=id_item_carrito,
            nueva_cantidad=serializer.validated_data['cantidad'],
            usuario_id=request.user.id,
            tienda_id=resolver_tienda_id(request),
        )

        use_case = ModificarCantidadItemUseCase()

        try:
            item_actualizado = use_case.execute(dto)
            return success_response(
                data=ItemCarritoResponseSerializer(item_actualizado).data,
                mensaje="Cantidad actualizada exitosamente.",
                status=status.HTTP_200_OK
            )
        except (CantidadInvalidaException, StockInsuficienteException) as err:
            return error_response(
                mensaje=str(err),
                codigo="CANTIDAD_INVALIDA",
                status=status.HTTP_400_BAD_REQUEST
            )
        except ItemCarritoNoEncontradoException as err:
            return error_response(
                mensaje=str(err),
                codigo="ITEM_NO_ENCONTRADO",
                status=status.HTTP_404_NOT_FOUND
            )

    def delete(self, request, id_item_carrito):
        """
        Elimina un ítem específico del carrito del usuario autenticado.
        """
        dto = EliminarItemCarritoDTO(
            usuario_id=request.user.id,
            id_item_carrito=id_item_carrito,
            tienda_id=resolver_tienda_id(request),
        )

        use_case = EliminarItemCarritoUseCase()

        try:
            use_case.execute(dto)
            return Response(
                {
                    "exito": True,
                    "mensaje": "Producto eliminado del carrito exitosamente.",
                    "data": None
                },
                status=status.HTTP_200_OK
            )
        except ItemCarritoNoEncontradoException as e:
            return Response(
                {
                    "exito": False,
                    "mensaje": str(e),
                    "error": {
                        "codigo": "RECURSO_NO_ENCONTRADO",
                        "detalles": None
                    }
                },
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {
                    "exito": False,
                    "mensaje": f"Error interno: {str(e)}",
                    "error": {
                        "codigo": "ERROR_INTERNO",
                        "detalles": None
                    }
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


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

    def delete(self, request, id_producto):
        tienda_id = resolver_tienda_id(request, exigir_propietario=True)

        try:


            use_case = SoftDeleteProductUseCase()

            resultado = use_case.execute(id_producto=id_producto, tienda_id=tienda_id)

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

class VariantTenantMixin:
    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        from apps.catalog.domain.stock import validate_stock
        from rest_framework.exceptions import ValidationError
        tienda_id = resolver_tienda_id(request, exigir_propietario=request.method in ('PUT', 'PATCH', 'DELETE')
                                       or request.method == 'POST')
        if request.method in ('POST', 'PUT', 'PATCH'):
            for field in ('stock', 'cantidad'):
                if field in request.data:
                    try:
                        validate_stock(request.data[field])
                    except ValueError as error:
                        raise ValidationError({field: str(error)}) from error
        self.service = VariantService(tienda_id=tienda_id)


class ProductVariantsView(VariantTenantMixin, APIView):

    """

    """

    permission_classes = [AllowAny]


    def get_permissions(self):
        if self.request.method in ('POST', 'PUT', 'PATCH', 'DELETE'):
            return [IsAuthenticated(), IsStoreOwner()]
        return super().get_permissions()

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

class VariantPurchaseView(VariantTenantMixin, APIView):

    """

    Endpoint para procesar compras de variantes y validar stock atómico.

    """

    permission_classes = [IsAuthenticated]


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


class IniciarPagoTransbankView(APIView):
    """
    Inicia la transacción contra Transbank para el checkout.
    POST /api/catalog/pagos/transbank/iniciar/
    """
    permission_classes = [AllowAny]

    def post(self, request):
        resolver_tienda(request)
        serializer = IniciarPagoTransbankSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "exito": False,
                    "mensaje": "Parámetros de pago inválidos.",
                    "error": {"codigo": "DATOS_INVALIDOS", "detalles": serializer.errors},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        dto = IniciarPagoTransbankDTO(
            id_tienda=serializer.validated_data["id_tienda"],
            orden_compra=serializer.validated_data["orden_compra"],
            monto=serializer.validated_data["monto"],
            session_id=serializer.validated_data["session_id"],
            return_url=serializer.validated_data["return_url"],
            email=serializer.validated_data["email"],
        )

        use_case = IniciarPagoTransbankUseCase()
        try:
            resultado = use_case.execute(dto)
            return Response(
                {
                    "exito": True,
                    "mensaje": "Transacción Webpay iniciada.",
                    "data": resultado,
                },
                status=status.HTTP_200_OK,
            )
        except ConfiguracionPagoInvalidaException as e:
            return error_response(mensaje=str(e), codigo="DATOS_INVALIDOS", status=status.HTTP_400_BAD_REQUEST)
        except TransbankConfiguracionFaltanteException as e:
            return Response(
                {"exito": False, "mensaje": str(e), "error": {"codigo": "PASARELA_NO_DISPONIBLE", "detalles": None}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except TransbankTransaccionException as e:
            return Response(
                {"exito": False, "mensaje": str(e), "error": {"codigo": "ERROR_TRANSBANK", "detalles": None}},
                status=status.HTTP_502_BAD_GATEWAY,
            )


class ConfirmarPagoTransbankView(APIView):
    """
    Valida y confirma la transacción tras el retorno desde Webpay.
    POST /api/catalog/pagos/transbank/confirmar/
    """
    permission_classes = [AllowAny]

    def post(self, request):
        resolver_tienda(request)
        serializer = ConfirmarPagoTransbankSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "exito": False,
                    "mensaje": "Token o parámetros de confirmación inválidos.",
                    "error": {"codigo": "DATOS_INVALIDOS", "detalles": serializer.errors},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        use_case = ConfirmarPagoTransbankUseCase()
        try:
            resultado = use_case.execute(
                id_tienda=serializer.validated_data["id_tienda"],
                token_ws=serializer.validated_data["token_ws"],
            )
            return Response(
                {
                    "exito": True,
                    "mensaje": "Pago aprobado con éxito.",
                    "data": resultado,
                },
                status=status.HTTP_200_OK,
            )
        except TransbankRechazoException as e:
            return Response(
                {"exito": False, "mensaje": str(e), "error": {"codigo": "PAGO_RECHAZADO", "detalles": None}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except (TransbankConfiguracionFaltanteException, TransbankTransaccionException) as e:
            return Response(
                {"exito": False, "mensaje": str(e), "error": {"codigo": "ERROR_TRANSBANK", "detalles": None}},
                status=status.HTTP_502_BAD_GATEWAY,
            )

class ProductoAdminListView(APIView):
    permission_classes = [IsAuthenticated, IsStoreOwner]

    def get(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        repo = ProductRepository()

        productos = Producto.objects.filter(id_tienda=tienda).order_by('-fecha_creacion')
        resultado = []

        for producto in productos:
            doc_mongo = repo.get_by_id(str(tienda.pk), str(producto.id_producto)) or {}
            resultado.append({
                'id_producto': producto.id_producto,
                'nombre': producto.nombre,
                'descripcion': doc_mongo.get('descripcion', ''),
                'categoria': doc_mongo.get('categoria', ''),
                'imagenes': doc_mongo.get('imagenes', []),
                'activo': producto.activo,
                'variantes': doc_mongo.get('variantes', []),
                'seo': doc_mongo.get('seo', {}),
            })

        return Response(
            {'mensaje': 'Listado obtenido correctamente', 'productos': resultado},
            status=status.HTTP_200_OK,
        )
