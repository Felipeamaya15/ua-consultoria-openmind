"""Volver a pagar un pedido pendiente desde Seguimiento o Mis pedidos (SCRUM-509).
"""
import logging
import uuid
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from rest_framework import serializers
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import Pedido
from apps.core.presentation.responses import error_response, success_response
from apps.core.presentation.tracking_guard import TrackingAttemptGuard, tracking_exception_handler

logger = logging.getLogger(__name__)


class ErrorPago(Exception):
    def __init__(self, mensaje, codigo, status=400):
        super().__init__(mensaje)
        self.mensaje, self.codigo, self.status = mensaje, codigo, status


def url_retorno_pedido(pedido, return_url, **extra):
    """URL de la tienda a la que vuelve el comprador: el servidor fija el pedido y la tienda."""
    partes = urlsplit(return_url)
    consulta = [par for par in parse_qsl(partes.query) if par[0] not in ('orderNumber', 'tienda', 'gateway')]
    consulta += [('orderNumber', pedido.identificador), ('tienda', str(pedido.tienda_id))] + list(extra.items())
    return urlunsplit((partes.scheme, partes.netloc, partes.path, urlencode(consulta), ''))


def _iniciar_webpay(request, pedido, return_url):
    from apps.catalog.application.use_cases import IniciarPagoTransbankUseCase
    from apps.catalog.domain.exceptions import (
        ConfiguracionPagoInvalidaException, TransbankConfiguracionFaltanteException,
        TransbankServicioNoDisponibleException, TransbankTransaccionException)
    from apps.catalog.presentation.views import url_retorno_webpay

    try:
        # El caso de uso vuelve a validar pedido, correo y estado, y toma el monto del pedido.
        resultado = IniciarPagoTransbankUseCase().execute({
            'id_tienda': pedido.tienda_id, 'orden_compra': pedido.identificador,
            'email': pedido.correo_contacto, 'monto': int(pedido.monto_total),
            'session_id': f'SES-{uuid.uuid4().hex[:24]}',
            'return_url': url_retorno_webpay(request, url_retorno_pedido(pedido, return_url)),
        })
    except ConfiguracionPagoInvalidaException as error:
        raise ErrorPago(str(error), 'DATOS_INVALIDOS', 400) from error
    except TransbankConfiguracionFaltanteException as error:
        raise ErrorPago(str(error), 'PASARELA_NO_DISPONIBLE', 400) from error
    except TransbankServicioNoDisponibleException as error:
        raise ErrorPago(str(error), 'PASARELA_TEMPORALMENTE_NO_DISPONIBLE', 503) from error
    except TransbankTransaccionException as error:
        raise ErrorPago(str(error), 'ERROR_TRANSBANK', 502) from error
    return {'metodo': 'Transbank', 'accion': 'formulario', 'url': resultado['url'], 'token': resultado['token']}


# Medio de pago del pedido -> funcion que inicia un cobro nuevo y devuelve a donde llevar al comprador.
PASARELAS = {'Transbank': _iniciar_webpay}


class _Entrada(serializers.Serializer):
    order_number = serializers.CharField(max_length=64)
    email = serializers.EmailField(required=False, allow_blank=True, max_length=320)
    return_url = serializers.URLField()

    def validate_return_url(self, value):
        # Solo se vuelve a la tienda configurada (la misma regla que el inicio de pago de Webpay).
        from apps.catalog.presentation.serializers import IniciarPagoTransbankSerializer
        return IniciarPagoTransbankSerializer().validate_return_url(value)


class PagarPedidoPendienteView(APIView):
    """POST {order_number, email?, return_url} -> a donde llevar al comprador para pagar ese pedido."""
    authentication_classes = [TokenAuthentication]
    permission_classes = [AllowAny]

    def get_exception_handler(self):
        return tracking_exception_handler

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response['Cache-Control'] = 'no-store'
        return response

    def post(self, request):
        entrada = _Entrada(data=request.data)
        entrada.is_valid(raise_exception=True)
        numero = entrada.validated_data['order_number'].strip()
        correo = (entrada.validated_data.get('email') or '').strip()
        tienda = resolver_tienda(request)
        pedido = Pedido.objects.filter(tienda=tienda, identificador__iexact=numero).first()

        guard = None
        if request.user.is_authenticated:
            autorizado = bool(pedido and pedido.comprador_id == request.user.pk)
        else:
            if not correo:
                return error_response('Indica el correo con el que hiciste la compra.', 'DATOS_INVALIDOS', status=400)
            guard = TrackingAttemptGuard(numero, correo)
            guard.check()
            autorizado = bool(pedido and (pedido.correo_contacto or '').lower() == correo.lower())
        if not autorizado:
            if guard:
                guard.register_failure()
            raise NotFound('No encontramos un pedido con ese número y correo.')
        if guard:
            guard.register_success()

        if pedido.estado != 'pendiente':
            return error_response('Este pedido ya no está pendiente de pago.', 'PEDIDO_NO_DISPONIBLE', status=409)
        iniciar = PASARELAS.get(pedido.medio_pago)
        if not iniciar:
            return error_response('Este pedido no se puede pagar en línea.', 'MEDIO_NO_DISPONIBLE', status=409)
        try:
            destino = iniciar(request, pedido, entrada.validated_data['return_url'])
        except ErrorPago as error:
            respuesta = error_response(error.mensaje, error.codigo, status=error.status)
            if error.status == 503:
                respuesta['Retry-After'] = '30'
            return respuesta
        return success_response(data=destino, mensaje='Pago iniciado.')
