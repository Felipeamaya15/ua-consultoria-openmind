# Vistas del módulo Core (PostgreSQL)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from apps.core.infrastructure.tenant import resolver_tienda, resolver_tienda_id
from apps.core.models import (
    ConfiguracionMercadoPago,
    ConfiguracionPago,
    ConfiguracionPayPal,
    ConfiguracionTransbank,
)
from apps.core.presentation.checkout import GuestCheckoutOrderAPIView
from apps.core.presentation.responses import error_response, success_response
from apps.core.presentation.serializers import ConfiguracionPagoSerializer


class RegistrarCompraView(GuestCheckoutOrderAPIView):
    """Compatibilidad SCRUM-289: reutiliza la creación y seguridad de SCRUM-291."""

class TiendaPagoActualAPIView(APIView):
    """Entrega al panel admin la tienda resuelta por el backend; nunca acepta elegir otra."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tienda = resolver_tienda(request, exigir_propietario=True)
            return success_response(data={"id_tienda": tienda.pk, "nombre": tienda.nombre})
        except Exception as e:
            return error_response(mensaje=str(e), codigo="ERROR_TIENDA", status=getattr(e, "status_code", 400))

class ConfiguracionPagoAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tienda = resolver_tienda(request, exigir_propietario=True)
            config_pago, _ = ConfiguracionPago.objects.get_or_create(tienda=tienda)
            return success_response(data=config_pago.datos or {})
        except Exception as e:
            return error_response(mensaje=str(e), codigo="ERROR_PAGO", status=getattr(e, "status_code", 400))

    def put(self, request):
        try:
            tienda = resolver_tienda(request, exigir_propietario=True)
            serializer = ConfiguracionPagoSerializer(data=request.data)
            if not serializer.is_valid():
                return error_response(mensaje="Datos incompletos.", codigo="ERROR_VALIDACION", detalles=serializer.errors, status=400)

            config_pago, _ = ConfiguracionPago.objects.get_or_create(tienda=tienda)
            config_pago.datos = serializer.validated_data
            config_pago.save()

            return success_response(mensaje="Métodos guardados.", data=config_pago.datos)
        except Exception as e:
            return error_response(mensaje=str(e), codigo="ERROR_PAGO", status=getattr(e, "status_code", 400))

    def patch(self, request):
        return self.put(request)

class MetodosPagoActivosAPIView(APIView):
    """Endpoint público para checkout."""
    permission_classes = [AllowAny]
    TRANSFER_PUBLIC_FIELDS = {"bank_name", "account_type", "account_number", "holder_rut", "holder_name", "confirmation_email"}

    def get(self, request):
        try:
            tienda_id = resolver_tienda_id(request)
            metodos_activos = {}

            if ConfiguracionTransbank.objects.filter(id_tienda_id=tienda_id, activo=True).exists():
                metodos_activos["transbank"] = {"enabled": True}

            if ConfiguracionPayPal.objects.filter(id_tienda_id=tienda_id, activo=True).exists():
                metodos_activos["paypal"] = {"enabled": True}

            if ConfiguracionMercadoPago.objects.filter(id_tienda_id=tienda_id, activo=True).exists():
                metodos_activos["mercadopago"] = {"enabled": True}

            try:
                config_pago = ConfiguracionPago.objects.get(tienda_id=tienda_id)
                transferencia = (config_pago.datos or {}).get("transfer", {})
            except ConfiguracionPago.DoesNotExist:
                transferencia = {}

            if isinstance(transferencia, dict) and transferencia.get("enabled") is True:
                fields = transferencia.get("fields", {})
                metodos_activos["transfer"] = {
                    "enabled": True,
                    "fields": {f: fields.get(f, "") for f in self.TRANSFER_PUBLIC_FIELDS}
                }

            return success_response(data=metodos_activos)
        except Exception as e:
            return error_response(mensaje=str(e), codigo="ERROR_METODOS_PAGO", status=getattr(e, "status_code", 400))

class IniciarPagoPayPalView(APIView):
    """Inicia una transacción en PayPal."""
    permission_classes = [AllowAny]

    def post(self, request):
        tienda_id = request.data.get('tienda_id')
        order_number = request.data.get('order_number')
        amount = request.data.get('amount')
        return_url = request.data.get('return_url')
        cancel_url = request.data.get('cancel_url')

        try:
            # Importación LAZY para evitar caídas de servidor al arrancar
            from apps.catalog.infrastructure.adapters.paypal_adapter import PayPalAdapter
            
            config = ConfiguracionPayPal.objects.get(id_tienda_id=tienda_id, activo=True)
            adapter = PayPalAdapter(client_id=config.client_id, client_secret=config.client_secret, ambiente=config.ambiente)
            
            resultado = adapter.create_order(
                amount=float(amount), currency='USD', return_url=return_url, 
                cancel_url=cancel_url, reference_id=order_number
            )
            return success_response(data=resultado)
            
        except ConfiguracionPayPal.DoesNotExist:
            return error_response(mensaje="PayPal no configurado para esta tienda.", status=400)
        except Exception as e:
            return error_response(mensaje=f"Error conectando con PayPal: {str(e)}", status=500)

class CapturarPagoPayPalView(APIView):
    """Captura los fondos."""
    permission_classes = [AllowAny]

    def post(self, request):
        tienda_id = request.data.get('tienda_id')
        order_id = request.data.get('order_id')

        try:
            # Importación LAZY
            from apps.catalog.infrastructure.adapters.paypal_adapter import PayPalAdapter
            
            config = ConfiguracionPayPal.objects.get(id_tienda_id=tienda_id, activo=True)
            adapter = PayPalAdapter(client_id=config.client_id, client_secret=config.client_secret, ambiente=config.ambiente)
            
            resultado = adapter.capture_order(order_id)
            if resultado.get("exito"):
                return success_response(mensaje="Pago capturado", data=resultado)
            else:
                return error_response(mensaje="No se pudo capturar el pago", status=400)
                
        except Exception as e:
            return error_response(mensaje=f"Error capturando PayPal: {str(e)}", status=500)