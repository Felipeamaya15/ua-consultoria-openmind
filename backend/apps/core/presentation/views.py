# Vistas del módulo Core (PostgreSQL)
# La lógica de variantes y catálogo fue migrada a apps/catalog (MongoDB)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.db import transaction

from apps.core.infrastructure.tenant import resolver_tienda, resolver_tienda_id
from apps.core.models import (
    ConfiguracionMercadoPago,
    ConfiguracionPago,
    ConfiguracionPayPal,
    ConfiguracionTransbank,
    Pedido,
    ItemPedido,
    Producto,
)
from apps.core.presentation.checkout import GuestCheckoutOrderAPIView
from apps.core.presentation.responses import error_response, success_response
from apps.core.presentation.serializers import ConfiguracionPagoSerializer, RegistrarCompraSerializer
from apps.catalog.infrastructure.repositories import ProductRepository


class RegistrarCompraView(APIView):
    """
    Registra productos, cantidades, precios y totales en la orden.
    Integra PostgreSQL (Orden) y MongoDB (Catálogo/Stock).
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        try:
            tienda = resolver_tienda(request, exigir_propietario=False)
        except Exception as e:
            return error_response(mensaje=str(e), codigo="ERROR_TIENDA", status=400)

        serializer = RegistrarCompraSerializer(data=request.data, context={'tienda': tienda.id_tienda})
        if not serializer.is_valid():
            return error_response(
                mensaje="Datos de compra inválidos.", 
                codigo="ERROR_VALIDACION_COMPRA", 
                detalles=serializer.errors, 
                status=400
            )

        datos = serializer.validated_data
        items = datos.get('items', [])
        usuario = request.user if request.user.is_authenticated else None

        repository = ProductRepository()

        try:
            with transaction.atomic():
                pedido = Pedido.objects.create(
                    tienda=tienda,
                    id_usuario=usuario,
                    comprador=usuario,
                    nombre_contacto=datos.get('nombre_contacto', '') or (usuario.nombre if usuario else ''),
                    correo_contacto=datos.get('correo_contacto', '') or (usuario.correo if usuario else ''),
                    telefono_contacto=datos.get('telefono_contacto', ''),
                    metodo_pago=datos.get('metodo_pago', ''),
                    monto_total=0,
                    estado='pendiente' 
                )

                monto_acumulado = 0

                for item in items:
                    sku = item['sku'].strip().upper()
                    cantidad = item['cantidad']

                    producto_mongo = repository.get_by_sku(str(tienda.id_tienda), sku)
                    
                    if not producto_mongo:
                        raise ValueError(f"La variante '{sku}' no existe en la tienda.")

                    variante = next(
                        (v for v in producto_mongo.get('variantes', []) if v.get('sku') == sku),
                        None
                    )

                    if not variante:
                        raise ValueError(f"La variante '{sku}' no se encontró en el catálogo.")

                    stock = variante.get('stock', 0)
                    if stock < cantidad:
                        raise ValueError(f"Stock insuficiente para '{sku}'. Disponible: {stock}, Solicitado: {cantidad}.")

                    precio = variante.get('precio')
                    if precio is None:
                        raise ValueError(f"La variante '{sku}' no tiene un precio válido.")

                    actualizado = repository.decrease_stock(str(tienda.id_tienda), sku, cantidad)
                    if not actualizado:
                        raise ValueError(f"El stock de '{sku}' cambió mientras se procesaba la compra. Intenta nuevamente.")

                    subtotal = float(precio) * cantidad
                    monto_acumulado += subtotal

                    id_producto_postgres = producto_mongo.get('id_producto')
                    try:
                        producto_postgres = Producto.objects.get(
                            id_tienda=tienda,
                            id_producto=id_producto_postgres,
                        )
                    except Producto.DoesNotExist:
                        raise ValueError(f"Inconsistencia: No se encontró en PostgreSQL el producto '{sku}'.")

                    ItemPedido.objects.create(
                        id_pedido=pedido,
                        id_producto=producto_postgres,
                        nombre_producto=producto_mongo.get('nombre', producto_postgres.nombre),
                        sku=sku,
                        atributos={
                            a.get('etiqueta', a.get('clave', '')): a.get('valor', '')
                            for a in variante.get('atributos_variante', [])
                        },
                        cantidad=cantidad,
                        precio_unitario=precio
                    )

                pedido.monto_total = monto_acumulado
                pedido.save()

            return success_response(
                mensaje="Orden registrada con productos y totales exitosamente.",
                data={
                    "id_pedido": pedido.id_pedido,
                    "identificador": pedido.identificador,
                    "monto_total": str(pedido.monto_total),
                    "estado": pedido.estado
                },
                status=201
            )

        except ValueError as e:
            return error_response(mensaje=str(e), codigo="ERROR_REGISTRO_ITEMS", status=400)
        except Exception as e:
            return error_response(mensaje=f"Error interno: {str(e)}", codigo="ERROR_INTERNO", status=500)


class TiendaPagoActualAPIView(APIView):
    """Entrega al panel admin la tienda resuelta por el backend; nunca acepta elegir otra."""
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
