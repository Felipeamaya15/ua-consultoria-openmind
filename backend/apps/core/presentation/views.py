# Vistas del módulo Core (PostgreSQL)
# La lógica de variantes y catálogo fue migrada a apps/catalog (MongoDB)

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from apps.core.infrastructure.tenant import resolver_tienda, resolver_tienda_id
from apps.core.presentation.serializers import ConfiguracionPagoSerializer
class RegistrarCompraView(APIView):
    """
    Procesa una compra (de un invitado o de un usuario registrado) utilizando
    las variantes almacenadas en MongoDB como fuente de verdad del stock.

from apps.core.models import (
    ConfiguracionPago,
    ConfiguracionTransbank,
    ConfiguracionPayPal,
    ConfiguracionMercadoPago,
)
from apps.core.presentation.responses import success_response, error_response
from apps.core.presentation.checkout import GuestCheckoutOrderAPIView
from apps.core.presentation.serializers import ConfiguracionPagoSerializer
from apps.core.infrastructure.tenant import resolver_tienda, resolver_tienda_id

    permission_classes = [AllowAny]
    authentication_classes = []

class RegistrarCompraView(GuestCheckoutOrderAPIView):
    """Compatibilidad SCRUM-289: reutiliza la creación y seguridad de SCRUM-291."""


class TiendaPagoActualAPIView(APIView):
    """Entrega al panel admin la tienda resuelta por el backend; nunca acepta elegir otra."""

# =================================================================
        # 1. LÓGICA DE COMPRA (Pertenece al método POST - Rama develop)
        # =================================================================
        datos = serializer.validated_data
        id_usuario = datos.get('id_usuario')
        items = datos['items']

        usuario = None
        if id_usuario:
            try:
                usuario = Usuario.objects.get(id_usuario=id_usuario)
            except Usuario.DoesNotExist:
                return Response(
                    {"error": f"El usuario con ID {id_usuario} no existe."},
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
                    producto_mongo = repository.get_by_sku(str(tienda.id_tienda), sku)

                    if not producto_mongo:
                        raise ValueError(f"La variante '{sku}' no existe en la tienda.")

                    # Buscar la variante concreta dentro del producto
                    variante = next(
                        (v for v in producto_mongo.get('variantes', []) if v.get('sku') == sku),
                        None
                    )

                    if not variante:
                        raise ValueError(f"La variante '{sku}' no existe en la tienda.")

                    stock = variante.get('stock', 0)

                    if stock <= 0:
                        raise ValueError(f"Operación rechazada: La variante '{sku}' tiene stock 0.")

                    if stock < cantidad:
                        raise ValueError(f"Stock insuficiente para '{sku}'. Disponible: {stock}, Solicitado: {cantidad}.")

                    precio = variante.get('precio')

                    if precio is None:
                        raise ValueError(f"La variante '{sku}' no tiene un precio válido.")

                    # Descontar stock atómicamente en MongoDB
                    actualizado = repository.decrease_stock(str(tienda.id_tienda), sku, cantidad)

                    if not actualizado:
                        raise ValueError(f"El stock de la variante '{sku}' cambió mientras se procesaba la compra.")

                    subtotal = float(precio) * cantidad
                    monto_acumulado += subtotal

                    # Producto equivalente en PostgreSQL
                    id_producto_postgres = producto_mongo.get('id_producto')

                    try:
                        producto_postgres = Producto.objects.get(
                            id_tienda=tienda,
                            id_producto=id_producto_postgres,
                        )
                    except Producto.DoesNotExist:
                        raise ValueError(f"No se encontró en PostgreSQL el producto asociado a la variante '{sku}'.")

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
            
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": f"Error interno: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


    # =================================================================
    # 2. NUEVO MÉTODO GET (Rama feature - Debe quedar a nivel de la clase)
    # =================================================================
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tienda = resolver_tienda(request, exigir_propietario=True)
            return success_response(
                data={
                    "id_tienda": tienda.pk,
                    "nombre": tienda.nombre,
                }
            )
        except Exception as e:
            return error_response(
                mensaje=str(e),
                codigo="ERROR_TIENDA",
                status=getattr(e, "status_code", 400),
            )
            )


class ConfiguracionPagoAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tienda = resolver_tienda(request, exigir_propietario=True)
            config_pago, _ = ConfiguracionPago.objects.get_or_create(tienda=tienda)
            return success_response(data=config_pago.datos or {})
        except Exception as e:
            return error_response(
                mensaje=str(e),
                codigo="ERROR_PAGO",
                status=getattr(e, "status_code", 400),
            )

    def put(self, request):
        try:
            tienda = resolver_tienda(request, exigir_propietario=True)

            serializer = ConfiguracionPagoSerializer(data=request.data)
            if not serializer.is_valid():
                return error_response(
                    mensaje=(
                        "Datos requeridos incompletos para habilitar "
                        "un medio de pago."
                    ),
                    codigo="ERROR_VALIDACION_PAGO",
                    detalles=serializer.errors,
                    status=400,
                )

            config_pago, _ = ConfiguracionPago.objects.get_or_create(tienda=tienda)
            config_pago.datos = serializer.validated_data
            config_pago.save()

            return success_response(
                mensaje="Métodos de pago guardados exitosamente.",
                data=config_pago.datos,
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
            return error_response(
                mensaje=str(e),
                codigo="ERROR_PAGO",
                status=getattr(e, "status_code", 400),
            )

    def patch(self, request):
        return self.put(request)


class MetodosPagoActivosAPIView(APIView):
    """
    Endpoint público para checkout.

    Los medios habilitados se derivan de la configuración REAL de la tienda:
    - Transbank, PayPal y Mercado Pago: sus modelos de configuración propios.
    - Transferencia: ConfiguracionPago.datos.
    Linkify no se expone como medio de pago; es un complemento de verificación.

    Nunca se publican secretos de pasarelas.
    """

    permission_classes = [AllowAny]

    TRANSFER_PUBLIC_FIELDS = {
        "bank_name",
        "account_type",
        "account_number",
        "holder_rut",
        "holder_name",
        "confirmation_email",
    }

    def get(self, request):
        try:
            tienda_id = resolver_tienda_id(request)
            metodos_activos = {}

            if ConfiguracionTransbank.objects.filter(
                id_tienda_id=tienda_id,
                activo=True,
            ).exists():
                metodos_activos["transbank"] = {"enabled": True}

            if ConfiguracionPayPal.objects.filter(
                id_tienda_id=tienda_id,
                activo=True,
            ).exists():
                metodos_activos["paypal"] = {"enabled": True}

            if ConfiguracionMercadoPago.objects.filter(
                id_tienda_id=tienda_id,
                activo=True,
            ).exists():
                metodos_activos["mercadopago"] = {"enabled": True}

            try:
                config_pago = ConfiguracionPago.objects.get(tienda_id=tienda_id)
                transferencia = (config_pago.datos or {}).get("transfer", {})
            except ConfiguracionPago.DoesNotExist:
                transferencia = {}

            if isinstance(transferencia, dict) and transferencia.get("enabled") is True:
                fields = transferencia.get("fields", {})
                if not isinstance(fields, dict):
                    fields = {}

                metodos_activos["transfer"] = {
                    "enabled": True,
                    "fields": {
                        field: fields.get(field, "")
                        for field in self.TRANSFER_PUBLIC_FIELDS
                    },
                }

            return success_response(data=metodos_activos)

        except Exception as e:
            return error_response(
                mensaje=str(e),
                codigo="ERROR_METODOS_PAGO",
                status=getattr(e, "status_code", 400),
            )
