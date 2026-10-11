import logging

from rest_framework import serializers
from rest_framework.exceptions import APIException
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.authentication.presentation.profile import StrictSerializer
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.presentation.responses import error_response, success_response
from apps.core.shipping import ErrorCotizacion, issue_quote

logger = logging.getLogger(__name__)


class ErroresDeCotizacionMixin:
    """Responde los ErrorCotizacion con el formato estandar {exito, mensaje, error{codigo, detalles}}.

    Se aplica solo a las vistas donde importa (cotizar y confirmar el pedido): el manejador
    global de errores no esta activado en settings y activarlo cambiaria toda la API.
    """

    def handle_exception(self, exc):
        if isinstance(exc, ErrorCotizacion):
            return error_response(exc.mensaje_error, exc.codigo_error, exc.detail)
        return super().handle_exception(exc)


class ShippingQuoteSerializer(StrictSerializer):
    operador = serializers.ChoiceField(choices=['Chilexpress', 'Starken'])
    region = serializers.CharField(max_length=100)
    comuna = serializers.CharField(max_length=100)


class ShippingQuoteAPIView(ErroresDeCotizacionMixin, APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        tienda = resolver_tienda(request)
        serializer = ShippingQuoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            quote = issue_quote(tienda, **serializer.validated_data)
        except ErrorCotizacion as error:
            # Queda registrado: un TARIFA_NO_DISPONIBLE repetido indica comunas sin tarifa en la tienda.
            logger.info('Cotizacion de envio rechazada (%s): tienda=%s datos=%s',
                        error.codigo_error, tienda.pk, dict(serializer.validated_data))
            raise
        except APIException:
            raise
        except Exception:  # noqa: BLE001 - el comprador nunca debe ver un error tecnico
            logger.exception('Cotizacion de envio: error inesperado (tienda=%s)', tienda.pk)
            return error_response('No pudimos obtener la tarifa de envío en este momento. Intenta nuevamente.',
                                  'ERROR_COTIZACION', status=500)
        return success_response(data={'tarifas': [quote]})