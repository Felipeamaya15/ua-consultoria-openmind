# Vistas del módulo Core (PostgreSQL)
# La lógica de variantes y catálogo fue migrada a apps/catalog (MongoDB)
from django.db import transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.core.models import ConfiguracionPago
from apps.core.presentation.responses import success_response, error_response
from apps.core.models import ItemPedido, Pedido, Producto, Usuario
from apps.catalog.infrastructure.repositories import ProductRepository
from .serializers import RegistrarCompraSerializer
from rest_framework.permissions import IsAuthenticated, AllowAny
from apps.core.infrastructure.tenant import resolver_tienda, resolver_tienda_id
from apps.core.presentation.serializers import ConfiguracionPagoSerializer
class RegistrarCompraView(APIView):
    """
    Procesa una compra (de un invitado o de un usuario registrado) utilizando
    las variantes almacenadas en MongoDB como fuente de verdad del stock.

    Cada item debe contener:
    - sku
    - cantidad
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        tienda = resolver_tienda(request)

        serializer = RegistrarCompraSerializer(
            data=request.data,
            context={'tienda': tienda}
        )

        if not serializer.is_valid():
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )

        datos = serializer.validated_data
        id_usuario = datos.get('id_usuario')
        items = datos['items']

        usuario = None
        if id_usuario:
            try:
                usuario = Usuario.objects.get(id_usuario=id_usuario)
            except Usuario.DoesNotExist:
                return Response(
                    {
                        "error": f"El usuario con ID {id_usuario} no existe."
                    },
                    status=status.HTTP_404_NOT_FOUND
                )

        repository = ProductRepository()

        try:
            with transaction.atomic():

                pedido = Pedido.objects.create(
                    id_usuario=usuario,
                    nombre_contacto=datos.get('nombre_contacto', '') or (usuario.nombre if usuario else ''),
                    correo_contacto=datos.get('correo_contacto', '') or (usuario.correo if usuario else ''),
                    telefono_contacto=datos.get('telefono_contacto', ''),
                    metodo_pago=datos['metodo_pago'],
                    monto_total=0,
                    estado='pagado'
                )

                monto_acumulado = 0

                for item in items:

                    sku = item['sku'].strip().upper()
                    cantidad = item['cantidad']

                    # Buscar en MongoDB el producto que contiene el SKU
                    producto_mongo = repository.get_by_sku(
                        str(tienda.id_tienda),
                        sku
                    )

                    if not producto_mongo:
                        raise ValueError(
                            f"La variante '{sku}' no existe en la tienda."
                        )

                    # Buscar la variante concreta dentro del producto
                    variante = next(
                        (
                            v for v in producto_mongo.get('variantes', [])
                            if v.get('sku') == sku
                        ),
                        None
                    )

                    if not variante:
                        raise ValueError(
                            f"La variante '{sku}' no existe en la tienda."
                        )

                    stock = variante.get('stock', 0)

                    if stock <= 0:
                        raise ValueError(
                            f"Operación rechazada: "
                            f"La variante '{sku}' tiene stock 0."
                        )

                    if stock < cantidad:
                        raise ValueError(
                            f"Stock insuficiente para '{sku}'. "
                            f"Disponible: {stock}, "
                            f"Solicitado: {cantidad}."
                        )

                    precio = variante.get('precio')

                    if precio is None:
                        raise ValueError(
                            f"La variante '{sku}' no tiene un precio válido."
                        )

                    # Descontar stock atómicamente en MongoDB
                    actualizado = repository.decrease_stock(
                        str(tienda.id_tienda),
                        sku,
                        cantidad
                    )

                    if not actualizado:
                        raise ValueError(
                            f"El stock de la variante '{sku}' "
                            f"cambió mientras se procesaba la compra."
                        )

                    subtotal = float(precio) * cantidad
                    monto_acumulado += subtotal

                    # Producto equivalente en PostgreSQL: se vincula por
                    # id_producto (clave compartida entre Mongo y Postgres),
                    # no por nombre, que puede repetirse o cambiar.
                    id_producto_postgres = producto_mongo.get('id_producto')

                    try:
                        producto_postgres = Producto.objects.get(
                            id_tienda=tienda,
                            id_producto=id_producto_postgres,
                        )
                    except Producto.DoesNotExist:
                        raise ValueError(
                            f"No se encontró en PostgreSQL "
                            f"el producto asociado a la variante '{sku}'."
                        )

                    ItemPedido.objects.create(
                        id_pedido=pedido,
                        id_producto=producto_postgres,
                        sku=sku,
                        atributos={
                            a.get('etiqueta', a.get('clave')): a.get('valor')
                            for a in variante.get('atributos_variante', [])
                        },
                        cantidad=cantidad,
                        precio_unitario=precio
                    )

                pedido.monto_total = monto_acumulado
                pedido.save()

            return Response(
                {
                    "mensaje": "Compra procesada exitosamente.",
                    "id_pedido": pedido.id_pedido,
                    "monto_total": str(pedido.monto_total),
                    "estado": pedido.estado
                },
                status=status.HTTP_201_CREATED
            )

        except ValueError as err:
            return Response(
                {
                    "error": "COMPRA_RECHAZADA",
                    "detalle": str(err)
                },
                status=status.HTTP_400_BAD_REQUEST
            )
class ConfiguracionPagoAPIView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        try:
            tienda = resolver_tienda(request, exigir_propietario=True)
            config_pago, _ = ConfiguracionPago.objects.get_or_create(id_tienda=tienda)
            return success_response(data=config_pago.configuracion)
        except Exception as e:
            return error_response(mensaje=str(e), codigo="ERROR_PAGO", status=400)

    def put(self, request):
        try:
            tienda = resolver_tienda(request, exigir_propietario=True)
            config_pago, _ = ConfiguracionPago.objects.get_or_create(id_tienda=tienda)
            config_pago.configuracion = request.data
            config_pago.save()
            return success_response(
                mensaje="Métodos de pago guardados exitosamente.",
                data=config_pago.configuracion
            )
            
            #SCRUM-306: Impedir guardado si faltan datos requeridos
            serializer = ConfiguracionPagoSerializer(data=request.data)
            if not serializer.is_valid():
                return error_response(
                    mensaje="Datos requeridos incompletos para habilitar un medio de pago.", 
                    codigo="ERROR_VALIDACION_PAGO", 
                    detalles=serializer.errors,
                    status=400
                )

            config, _ = ConfiguracionPago.objects.get_or_create(tienda=tienda)
            config.datos = serializer.validated_data
            config.save()
            return success_response(mensaje="Métodos de pago guardados exitosamente.", data=config.datos)
        except Exception as e:
            return error_response(mensaje=str(e), codigo="ERROR_PAGO", status=400)
class MetodosPagoActivosAPIView(APIView):
    """ Endpoint público para el Checkout: devuelve SOLO los métodos habilitados """
    permission_classes = [AllowAny]

    def get(self, request):
        try:
            tienda_id = resolver_tienda_id(request)
            config = ConfiguracionPago.objects.get(tienda_id=tienda_id)

            # Filtramos para enviar al checkout solo los activos (enabled: true)
            metodos_activos = {
                key: method_data
                for key, method_data in config.datos.items()
                if isinstance(method_data, dict) and method_data.get('enabled', False)
            }
            return success_response(data=metodos_activos)
        except ConfiguracionPago.DoesNotExist:
            return success_response(data={})
        except Exception as e:
            return error_response(mensaje=str(e), codigo="ERROR_METODOS_PAGO", status=400)