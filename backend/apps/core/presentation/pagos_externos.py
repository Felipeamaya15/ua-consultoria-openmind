"""Cobro y confirmación de Mercado Pago y PayPal.
"""
import logging
from decimal import Decimal

from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.catalog.domain.exceptions import PagoGatewayException
from apps.catalog.domain.ports.payment_gateway import EstadoPago
from apps.catalog.infrastructure.adapters.mercadopago_adapter import MercadoPagoAdapter
from apps.catalog.infrastructure.adapters.paypal_adapter import PayPalAdapter
from apps.catalog.presentation.serializers import IniciarPagoTransbankSerializer
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.infrastructure.tipo_cambio import tipo_cambio_vigente
from apps.core.infrastructure.conciliacion_pagos import marcar_pedido_pagado
from apps.core.infrastructure.expiracion_pedidos import vence_en
from apps.core.models import ConfiguracionMercadoPago, ConfiguracionPayPal, Pedido
from apps.core.presentation.pago_pedido_pendiente import ErrorPago, url_retorno_pedido
from apps.core.presentation.responses import error_response, success_response

logger = logging.getLogger(__name__)


class _IniciarSerializer(serializers.Serializer):
    order_number = serializers.CharField(max_length=64)
    return_url = serializers.URLField()
    cancel_url = serializers.URLField(required=False)

    def validate_return_url(self, value):
        return IniciarPagoTransbankSerializer().validate_return_url(value)

    def validate_cancel_url(self, value):
        return IniciarPagoTransbankSerializer().validate_return_url(value)


def _pedido_pendiente(tienda, order_number, medio_pago):
    pedido = Pedido.objects.filter(tienda=tienda, identificador=order_number, medio_pago=medio_pago).first()
    if not pedido:
        return None, error_response('El pedido no corresponde a este medio de pago.', 'PEDIDO_NO_ENCONTRADO', status=404)
    if pedido.estado != 'pendiente':
        return None, error_response('El pedido ya no admite un nuevo cobro.', 'PEDIDO_NO_DISPONIBLE', status=409)
    return pedido, None


def _marcar_pagado(pedido_pk):
    """Pasa a Pagado de forma atómica e idempotente y envía el correo de pago exitoso."""
    return marcar_pedido_pagado(pedido_pk)


def _pago_sobre_pedido_cancelado(pedido, detalle):
    logger.critical('PAGO_SOBRE_PEDIDO_CANCELADO pedido=%s tienda=%s medio=%s %s',
                    pedido.pk, pedido.tienda_id, pedido.medio_pago, detalle)
    return error_response(
        'Recibimos tu pago, pero el pedido ya había expirado. Contacta a la tienda con el número de pedido '
        f'{pedido.identificador} para regularizarlo.', 'PAGO_SOBRE_PEDIDO_CANCELADO', status=409)


class _PagoExternoBase(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []


# Mercado Pago

def _adaptador_mp(tienda):
    config = ConfiguracionMercadoPago.objects.filter(id_tienda=tienda, activo=True).first()
    if not config or not str(config.access_token or '').strip():
        return None
    return MercadoPagoAdapter(config.access_token, config.ambiente)


def _crear_pago_mercadopago(adaptador, pedido, return_url):
    """Preferencia de pago nueva para el pedido (monto del pedido). Lo usan el checkout y 'Pagar ahora'."""
    try:
        # El enlace de pago vence junto con el pedido: despues de cancelarlo ya no se puede pagar.
        pago = adaptador.iniciar_pago(pedido.identificador, pedido.monto_total, f'Pedido {pedido.identificador}',
                                      return_url, expira_en=vence_en(pedido))
    except PagoGatewayException:
        logger.exception('No se pudo iniciar Mercado Pago del pedido %s.', pedido.pk)
        raise ErrorPago('No pudimos iniciar el pago con Mercado Pago. Intenta nuevamente.',
                        'MERCADOPAGO_NO_DISPONIBLE', 503) from None
    return {'url': pago.url_pago, 'referencia': pago.referencia}


class IniciarPagoMercadoPagoView(_PagoExternoBase):
    def post(self, request):
        tienda = resolver_tienda(request)
        adaptador = _adaptador_mp(tienda)
        if not adaptador:
            return error_response('Mercado Pago no configurado para esta tienda.', 'MERCADOPAGO_NO_CONFIGURADO', status=400)
        serializer = _IniciarSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        pedido, error = _pedido_pendiente(tienda, serializer.validated_data['order_number'], 'MercadoPago')
        if error:
            return error
        try:
            datos = _crear_pago_mercadopago(adaptador, pedido, serializer.validated_data['return_url'])
        except ErrorPago as error:
            return error_response(error.mensaje, error.codigo, status=error.status)
        return success_response(data=datos)


class ConfirmarPagoMercadoPagoView(_PagoExternoBase):
    def post(self, request):
        tienda = resolver_tienda(request)
        adaptador = _adaptador_mp(tienda)
        if not adaptador:
            return error_response('Mercado Pago no configurado para esta tienda.', 'MERCADOPAGO_NO_CONFIGURADO', status=400)
        order_number = str(request.data.get('order_number') or '')
        payment_id = str(request.data.get('payment_id') or '').strip()
        if not payment_id.isdigit():
            return error_response('Falta el identificador del pago.', 'DATOS_INVALIDOS', status=400)
        pedido = Pedido.objects.filter(tienda=tienda, identificador=order_number, medio_pago='MercadoPago').first()
        if not pedido:
            return error_response('El pedido no corresponde a este medio de pago.', 'PEDIDO_NO_ENCONTRADO', status=404)
        try:
            resultado = adaptador.consultar_pago(payment_id)
        except PagoGatewayException:
            logger.exception('No se pudo consultar Mercado Pago del pedido %s.', pedido.pk)
            return error_response('No pudimos confirmar el pago con Mercado Pago. Intenta nuevamente.',
                                  'MERCADOPAGO_NO_DISPONIBLE', status=503)
        if resultado.orden_compra != pedido.identificador or resultado.monto != pedido.monto_total:
            logger.error('Pago Mercado Pago no coincide con el pedido %s.', pedido.pk)
            return error_response('El pago no corresponde a este pedido.', 'PAGO_NO_COINCIDE', status=409)
        if resultado.estado == EstadoPago.RECHAZADO:
            return error_response('Mercado Pago rechazó el pago.', 'PAGO_RECHAZADO', status=402)
        if resultado.estado != EstadoPago.APROBADO:
            return error_response('El pago sigue pendiente en Mercado Pago.', 'PAGO_PENDIENTE', status=202)
        if _marcar_pagado(pedido.pk).estado == 'cancelado':
            return _pago_sobre_pedido_cancelado(pedido, f'mercadopago_payment_id={payment_id}')
        return success_response(mensaje='Pago aprobado.', data={
            'orden_compra': pedido.identificador, 'monto': str(pedido.monto_total)})


#PayPal 

def _adaptador_paypal(tienda):
    config = ConfiguracionPayPal.objects.filter(id_tienda=tienda, activo=True).first()
    if not config or not str(config.client_id or '').strip() or not str(config.client_secret or '').strip():
        return None
    return PayPalAdapter(config.client_id, config.client_secret, config.ambiente)


def _crear_orden_paypal(adaptador, tipo, pedido, return_url, cancel_url):
    """Orden de PayPal nueva en USD: fija y guarda la conversion en el pedido (la ultima orden es la unica valida)."""
    monto_usd = tipo.clp_a_usd(pedido.monto_total)
    try:
        orden = adaptador.create_order(
            amount=float(monto_usd), currency='USD', return_url=return_url, cancel_url=cancel_url,
            reference_id=pedido.identificador, descripcion=f'Pedido {pedido.identificador}')
    except ValueError:
        logger.exception('No se pudo crear la orden PayPal del pedido %s.', pedido.pk)
        raise ErrorPago('No pudimos iniciar el pago con PayPal. Intenta nuevamente.', 'PAYPAL_NO_DISPONIBLE', 503) from None
    if not orden.get('approve_url') or not orden.get('id'):
        raise ErrorPago('PayPal no devolvió la orden de pago esperada.', 'PAYPAL_NO_DISPONIBLE', 503)
    fx = {
        'moneda': 'USD', 'monto_usd': str(monto_usd), 'monto_clp': str(pedido.monto_total),
        'tipo_cambio_observado': str(tipo.observado), 'margen_pct': str(tipo.margen_pct),
        'tipo_cambio_aplicado': str(tipo.aplicado), 'fecha_dato': tipo.fecha_dato.isoformat(),
        'fuente': tipo.fuente, 'paypal_order_id': str(orden['id']),
    }
    Pedido.objects.filter(pk=pedido.pk, estado='pendiente').update(pago_fx=fx)
    return {'approve_url': orden['approve_url'], 'order_id': orden['id'], 'fx': fx}


class IniciarPagoPayPalView(_PagoExternoBase):
    """El pedido está en CLP y PayPal no lo admite: se cobra su equivalente en USD, fijado y guardado aquí."""

    def post(self, request):
        tienda = resolver_tienda(request)
        adaptador = _adaptador_paypal(tienda)
        if not adaptador:
            return error_response('PayPal no configurado para esta tienda.', 'PAYPAL_NO_CONFIGURADO', status=400)
        tipo = tipo_cambio_vigente()
        if not tipo:
            return error_response('PayPal no está disponible: no hay un tipo de cambio CLP/USD reciente.',
                                  'PAYPAL_NO_DISPONIBLE', status=409)
        serializer = _IniciarSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        datos = serializer.validated_data
        pedido, error = _pedido_pendiente(tienda, datos['order_number'], 'PayPal')
        if error:
            return error
        try:
            datos = _crear_orden_paypal(adaptador, tipo, pedido, datos['return_url'],
                                        datos.get('cancel_url') or datos['return_url'])
        except ErrorPago as error:
            return error_response(error.mensaje, error.codigo, status=error.status)
        return success_response(data=datos)


class CapturarPagoPayPalView(_PagoExternoBase):
    def post(self, request):
        tienda = resolver_tienda(request)
        adaptador = _adaptador_paypal(tienda)
        if not adaptador:
            return error_response('PayPal no configurado para esta tienda.', 'PAYPAL_NO_CONFIGURADO', status=400)
        order_number = str(request.data.get('order_number') or '')
        order_id = str(request.data.get('order_id') or '').strip()
        if not order_id:
            return error_response('Datos de pago incompletos.', 'DATOS_INVALIDOS', status=400)
        pedido = Pedido.objects.filter(tienda=tienda, identificador=order_number, medio_pago='PayPal').first()
        if not pedido:
            return error_response('El pedido no corresponde a este medio de pago.', 'PEDIDO_NO_ENCONTRADO', status=404)
        fx = pedido.pago_fx if isinstance(pedido.pago_fx, dict) else {}
        if pedido.estado != 'pendiente':
            if pedido.estado in Pedido.ESTADOS_PAGADOS:
                return success_response(mensaje='Pago aprobado.', data=_datos_pago_paypal(pedido))
            return error_response('El pedido ya no admite un cobro.', 'PEDIDO_NO_DISPONIBLE', status=409)
        if not fx.get('paypal_order_id') or fx['paypal_order_id'] != order_id:
            return error_response('La orden de PayPal no corresponde a este pedido.', 'PAGO_NO_COINCIDE', status=409)
        resultado = adaptador.capture_order(order_id)
        if not resultado.get('exito'):
            codigo = resultado.get('codigo')
            if codigo == 'PAYPAL_TIMEOUT':
                return error_response(resultado.get('mensaje') or 'PayPal no responde.', 'PAYPAL_NO_DISPONIBLE', status=503)
            return error_response('PayPal no pudo confirmar el pago.', 'PAGO_RECHAZADO', status=402)
        try:
            unidad = resultado['data']['purchase_units'][0]
            captura = unidad['payments']['captures'][0]
            monto = Decimal(str(captura['amount']['value']))
            moneda = captura['amount']['currency_code']
            referencia = unidad.get('reference_id')
            esperado = Decimal(fx['monto_usd'])
        except (KeyError, IndexError, TypeError, ArithmeticError, ValueError):
            return error_response('PayPal devolvió una captura inválida.', 'PAGO_NO_COINCIDE', status=409)
        if referencia != pedido.identificador or moneda != 'USD' or monto != esperado:
            logger.error('Captura PayPal no coincide con el pedido %s.', pedido.pk)
            return error_response('El pago no corresponde a este pedido.', 'PAGO_NO_COINCIDE', status=409)
        if _marcar_pagado(pedido.pk).estado == 'cancelado':
            return _pago_sobre_pedido_cancelado(pedido, f'paypal_order_id={order_id}')
        return success_response(mensaje='Pago aprobado.', data=_datos_pago_paypal(pedido))


def _datos_pago_paypal(pedido):
    fx = pedido.pago_fx if isinstance(pedido.pago_fx, dict) else {}
    return {'orden_compra': pedido.identificador, 'monto': str(pedido.monto_total),
            'monto_usd': fx.get('monto_usd'), 'tipo_cambio': fx.get('tipo_cambio_aplicado')}


# Pagar ahora desde Seguimiento o Mis pedidos.

def iniciar_paypal_pedido(request, pedido, return_url):
    tienda = pedido.tienda
    adaptador = _adaptador_paypal(tienda)
    if not adaptador:
        raise ErrorPago('PayPal no configurado para esta tienda.', 'PAYPAL_NO_CONFIGURADO', 400)
    tipo = tipo_cambio_vigente()
    if not tipo:
        raise ErrorPago('PayPal no está disponible: no hay un tipo de cambio CLP/USD reciente.', 'PAYPAL_NO_DISPONIBLE', 409)
    retorno = url_retorno_pedido(pedido, return_url, gateway='paypal')
    datos = _crear_orden_paypal(adaptador, tipo, pedido, retorno, f'{retorno}&cancelado=1')
    return {'metodo': 'PayPal', 'accion': 'redirigir', 'url': datos['approve_url']}


def iniciar_mercadopago_pedido(request, pedido, return_url):
    adaptador = _adaptador_mp(pedido.tienda)
    if not adaptador:
        raise ErrorPago('Mercado Pago no configurado para esta tienda.', 'MERCADOPAGO_NO_CONFIGURADO', 400)
    datos = _crear_pago_mercadopago(adaptador, pedido, url_retorno_pedido(pedido, return_url, gateway='mercadopago'))
    return {'metodo': 'MercadoPago', 'accion': 'redirigir', 'url': datos['url']}
