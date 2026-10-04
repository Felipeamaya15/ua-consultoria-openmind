# Vistas del módulo Core (PostgreSQL)
# La lógica de variantes y catálogo fue migrada a apps/catalog (MongoDB)
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
