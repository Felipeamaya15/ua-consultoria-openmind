# Vistas del módulo Core (PostgreSQL)
# La lógica de variantes y catálogo fue migrada a apps/catalog (MongoDB)

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny

from apps.core.models import ConfiguracionPago
from apps.core.presentation.responses import success_response, error_response
from apps.core.presentation.checkout import GuestCheckoutOrderAPIView
from apps.core.presentation.serializers import ConfiguracionPagoSerializer
from apps.core.infrastructure.tenant import resolver_tienda, resolver_tienda_id


class RegistrarCompraView(GuestCheckoutOrderAPIView):
    """Compatibilidad SCRUM-289: reutiliza la creación y seguridad de SCRUM-291."""


class ConfiguracionPagoAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            tienda = resolver_tienda(
                request,
                exigir_propietario=True,
            )

            config_pago, _ = ConfiguracionPago.objects.get_or_create(
                tienda=tienda,
            )

            return success_response(
                data=config_pago.datos or {},
            )

        except Exception as e:
            return error_response(
                mensaje=str(e),
                codigo="ERROR_PAGO",
                status=400,
            )

    def put(self, request):
        try:
            tienda = resolver_tienda(
                request,
                exigir_propietario=True,
            )

            serializer = ConfiguracionPagoSerializer(
                data=request.data,
            )

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

            config_pago, _ = ConfiguracionPago.objects.get_or_create(
                tienda=tienda,
            )

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
                status=400,
            )

    def patch(self, request):
        return self.put(request)


class MetodosPagoActivosAPIView(APIView):
    """
    Endpoint público utilizado por checkout.

    Devuelve únicamente los medios de pago habilitados
    para la tienda correspondiente.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        try:
            tienda_id = resolver_tienda_id(request)

            config_pago = ConfiguracionPago.objects.get(
                tienda_id=tienda_id,
            )

            configuracion = config_pago.datos or {}

            metodos_activos = {
                key: method_data
                for key, method_data in configuracion.items()
                if (
                    isinstance(method_data, dict)
                    and method_data.get("enabled", False)
                )
            }

            return success_response(
                data=metodos_activos,
            )

        except ConfiguracionPago.DoesNotExist:
            return success_response(data={})

        except Exception as e:
            return error_response(
                mensaje=str(e),
                codigo="ERROR_METODOS_PAGO",
                status=400,
            )