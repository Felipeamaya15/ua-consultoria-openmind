"""Conciliacion con PayPal y Mercado Pago de los pedidos.

"""
import logging
from datetime import timedelta
from decimal import Decimal, InvalidOperation
from enum import Enum

from django.db import transaction

from apps.catalog.domain.exceptions import PagoGatewayException
from apps.catalog.domain.ports.payment_gateway import EstadoPago

logger = logging.getLogger(__name__)

# Una orden de PayPal aprobada que nadie capturo no puede cobrarse sola (la captura la hace este servidor y solo
# mientras el pedido siga pendiente). Se le da este tiempo extra al comprador antes de darla por abandonada.
ESPERA_MAXIMA_ORDEN_APROBADA = timedelta(hours=24)


class Veredicto(str, Enum):
    PAGADO = 'pagado'
    ESPERAR = 'espera'
    CANCELAR = 'cancelar'
    INDETERMINADO = 'indeterminado'


def marcar_pedido_pagado(pedido_pk):
    """Pasa a Pagado de forma atomica e idempotente y envia el correo de pago exitoso. Devuelve el pedido."""
    from apps.core.models import Pedido

    with transaction.atomic():
        pedido = Pedido.objects.select_for_update().get(pk=pedido_pk)
        pasa_a_pagado = pedido.estado == 'pendiente'
        if pasa_a_pagado:
            pedido.estado = 'pagado'
            pedido.save(update_fields=['estado'])
    if pasa_a_pagado:
        try:
            from apps.core.infrastructure.notificaciones_pedido import notificar_cambio_de_estado
            notificar_cambio_de_estado(pedido, 'pendiente')
        except Exception:
            logger.exception('No se pudo notificar el pago del pedido %s.', pedido.pk)
    return pedido


def veredicto_de_pasarela(pedido, ahora=None):
    """Que hacer con un pedido vencido de PayPal o Mercado Pago segun lo que diga la pasarela. Nunca lanza."""
    try:
        if pedido.medio_pago == 'MercadoPago':
            return _veredicto_mercadopago(pedido)
        if pedido.medio_pago == 'PayPal':
            return _veredicto_paypal(pedido, ahora)
    except PagoGatewayException as error:
        logger.warning('No se pudo conciliar el pedido %s con %s: %s', pedido.pk, pedido.medio_pago, error)
    except Exception:
        logger.exception('Error inesperado al conciliar el pedido %s con %s.', pedido.pk, pedido.medio_pago)
    return Veredicto.INDETERMINADO


def _veredicto_mercadopago(pedido):
    from apps.core.presentation.pagos_externos import _adaptador_mp

    adaptador = _adaptador_mp(pedido.tienda)
    if not adaptador:
        logger.warning('Pedido %s: Mercado Pago ya no esta configurado, no se puede verificar el pago.', pedido.pk)
        return Veredicto.INDETERMINADO
    pagos = [p for p in adaptador.buscar_pagos_por_referencia(pedido.identificador)
             if p.orden_compra == pedido.identificador]
    aprobados = [p for p in pagos if p.estado == EstadoPago.APROBADO]
    if aprobados:
        if any(p.monto == pedido.monto_total for p in aprobados):
            return Veredicto.PAGADO
        logger.error('Pedido %s: Mercado Pago aprobo un pago con un monto distinto al del pedido (%s).',
                     pedido.pk, [str(p.monto) for p in aprobados])
        return Veredicto.INDETERMINADO
    if any(p.estado == EstadoPago.PENDIENTE for p in pagos):
        return Veredicto.ESPERAR  # Mercado Pago vence solo sus pagos pendientes; entonces el pedido se cancela
    return Veredicto.CANCELAR  # sin pagos, o todos rechazados, cancelados o devueltos


def _veredicto_paypal(pedido, ahora):
    from django.utils import timezone

    from apps.core.infrastructure.expiracion_pedidos import vence_en
    from apps.core.presentation.pagos_externos import _adaptador_paypal

    fx = pedido.pago_fx if isinstance(pedido.pago_fx, dict) else {}
    orden_id = str(fx.get('paypal_order_id') or '').strip()
    if not orden_id:
        return Veredicto.CANCELAR  # nunca se creo una orden en PayPal: no hay nada que cobrar
    adaptador = _adaptador_paypal(pedido.tienda)
    if not adaptador:
        return Veredicto.CANCELAR
    resultado = adaptador.consultar_pago(orden_id)
    if resultado.estado == EstadoPago.APROBADO:  # COMPLETED: el cobro ya se hizo
        try:
            esperado = Decimal(str(fx['monto_usd']))
        except (KeyError, InvalidOperation):
            esperado = None
        if resultado.orden_compra == pedido.identificador and esperado is not None and resultado.monto == esperado:
            return Veredicto.PAGADO
        logger.error('Pedido %s: la orden de PayPal %s esta completada pero no coincide con el pedido.',
                     pedido.pk, orden_id)
        return Veredicto.INDETERMINADO
    if resultado.detalle_estado == 'APPROVED':
        limite = vence_en(pedido)
        ahora = ahora or timezone.now()
        if limite is not None and ahora < limite + ESPERA_MAXIMA_ORDEN_APROBADA:
            return Veredicto.ESPERAR  # aprobada y sin capturar: el comprador puede estar volviendo a la tienda
    return Veredicto.CANCELAR
