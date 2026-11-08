"""Vigencia del token de Webpay y expiracion de pedidos pendientes .
"""
import logging
from collections import Counter
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

logger = logging.getLogger(__name__)

# Pasarela en linea: el comprador paga en minutos y Webpay avisa del resultado, asi que el plazo es corto.
MEDIOS_EN_LINEA = ('Transbank',)
# Pago manual: el comprador necesita tiempo para transferir y el aviso depende de la tienda o de Linkify.
MEDIOS_MANUALES = ('Transferencia', 'Linkify')
MEDIOS_EXTERNOS = ('PayPal', 'MercadoPago')
MEDIOS_EXPIRABLES = MEDIOS_EN_LINEA + MEDIOS_EXTERNOS + MEDIOS_MANUALES
MOTIVO_PLAZO_VENCIDO = 'plazo_vencido' 


def vigencia_token():
    return timedelta(minutes=int(getattr(settings, 'WEBPAY_TOKEN_VIGENCIA_MINUTOS', 30)))


def plazo_pedido_pendiente(pedido):
    """Plazo de espera del pedido: el de su tienda, segun sea pago en linea o manual.

    Devuelve None si no expira nunca (pago manual con 0 horas).
    """
    tienda = pedido.tienda
    if pedido.medio_pago in MEDIOS_MANUALES:
        horas = getattr(tienda, 'horas_expiracion_pedido_manual', 48)
        if horas == 0:
            return None
    else:
        horas = getattr(tienda, 'horas_expiracion_pedido_en_linea', 2)
    return timedelta(hours=horas)


def vence_en(pedido):
    if pedido.estado != 'pendiente' or pedido.medio_pago not in MEDIOS_EXPIRABLES or not pedido.fecha_creacion:
        return None
    plazo = plazo_pedido_pendiente(pedido)
    return pedido.fecha_creacion + plazo if plazo is not None else None


def token_webpay_vigente(pedido, ahora=None):
    if not (pedido.webpay_token and pedido.webpay_url):
        return False
    inicio = pedido.webpay_iniciado_en or pedido.fecha_creacion  
    return (ahora or timezone.now()) - inicio < vigencia_token()


def margen_pasarela():
    return timedelta(minutes=int(getattr(settings, 'PAGOS_EXTERNOS_MARGEN_MINUTOS', 10)))


def plazo_vencido(pedido, ahora=None):
    limite = vence_en(pedido)
    return limite is not None and (ahora or timezone.now()) >= limite


def pedido_expirado(pedido, ahora=None):
    limite = vence_en(pedido)
    if limite is not None and pedido.medio_pago in MEDIOS_EXTERNOS:
        limite += margen_pasarela()
    return limite is not None and (ahora or timezone.now()) >= limite


def _lineas_del_pedido(pedido):
    from apps.core.models import ItemPedido

    return list(ItemPedido.objects.filter(id_pedido=pedido).values(
        'producto_mongo_id', 'sku', 'cantidad', 'id_producto_id'))


def _devolver_stock(pedido_pk, tienda_id, lineas):
    from apps.catalog.infrastructure.repositories import ProductRepository
    from apps.core.models import Producto

    repositorio = ProductRepository()
    for linea in lineas:
        if not linea['producto_mongo_id']:
            continue 
        try:
            if not repositorio.restore_stock(tienda_id, linea['producto_mongo_id'], linea['sku'], linea['cantidad']):
                raise RuntimeError('No se encontro la reserva a restituir.')
            if linea['id_producto_id']:
                actual = repositorio.get_by_id(tienda_id, linea['producto_mongo_id'])
                Producto.objects.filter(pk=linea['id_producto_id'], id_tienda_id=tienda_id).update(
                    stock=sum(v.get('stock', 0) for v in (actual or {}).get('variantes', [])))
        except Exception:
            logger.exception('No se pudo devolver stock del pedido %s, SKU %s', pedido_pk, linea['sku'])


def devolver_stock_de_pedido_cancelado(pedido):
    from apps.core.models import Pedido

    with transaction.atomic():
        bloqueado = Pedido.objects.select_for_update().filter(pk=pedido.pk).first()
        if not bloqueado or bloqueado.estado != 'cancelado' or bloqueado.stock_devuelto:
            return False
        bloqueado.stock_devuelto = True
        bloqueado.save(update_fields=['stock_devuelto'])
        pedido.stock_devuelto = True
        lineas = _lineas_del_pedido(bloqueado)
        tienda_id = str(bloqueado.tienda_id)
        transaction.on_commit(lambda: _devolver_stock(bloqueado.pk, tienda_id, lineas))
    return True


def expirar_pedido_pendiente(pedido_pk, consultar_pasarela=True):
    return _procesar_pedido(pedido_pk, consultar_pasarela) == RESULTADO_CANCELADO


RESULTADO_CANCELADO = 'cancelado'
RESULTADO_PAGADO = 'pagado'
RESULTADO_ESPERA = 'espera'
RESULTADO_INDETERMINADO = 'indeterminado'
RESULTADO_OMITIDO = 'omitido'


def _procesar_pedido(pedido_pk, consultar_pasarela=True):
    from apps.core.infrastructure.conciliacion_pagos import Veredicto, marcar_pedido_pagado, veredicto_de_pasarela
    from apps.core.models import Pedido

    if consultar_pasarela:
        candidato = Pedido.objects.select_related('tienda').filter(pk=pedido_pk).first()
        if (candidato and candidato.medio_pago in MEDIOS_EXTERNOS and candidato.estado == 'pendiente'
                and pedido_expirado(candidato)):
            veredicto = veredicto_de_pasarela(candidato)
            if veredicto is Veredicto.PAGADO:
                marcar_pedido_pagado(candidato.pk)
                logger.info('Pedido %s conciliado como pagado (%s).', candidato.pk, candidato.medio_pago)
                return RESULTADO_PAGADO
            if veredicto is Veredicto.ESPERAR:
                return RESULTADO_ESPERA
            if veredicto is Veredicto.INDETERMINADO:
                return RESULTADO_INDETERMINADO

    with transaction.atomic():
        pedido = Pedido.objects.select_for_update().filter(pk=pedido_pk).first()
        ahora = timezone.now()
        if (not pedido or pedido.medio_pago not in MEDIOS_EXPIRABLES or not pedido_expirado(pedido, ahora)
                or token_webpay_vigente(pedido, ahora)):
            return RESULTADO_OMITIDO
        if pedido.medio_pago in MEDIOS_EXTERNOS and not consultar_pasarela:
            return RESULTADO_OMITIDO
        entrega = dict(pedido.entrega or {})
        entrega['motivo_cancelacion'] = MOTIVO_PLAZO_VENCIDO
        pedido.estado = 'cancelado'
        pedido.webpay_token = ''
        pedido.webpay_url = ''
        pedido.entrega = entrega
        pedido.save(update_fields=['estado', 'webpay_token', 'webpay_url', 'entrega'])
        devolver_stock_de_pedido_cancelado(pedido)
        transaction.on_commit(lambda: _avisar_cancelacion(pedido))
    return RESULTADO_CANCELADO


def _avisar_cancelacion(pedido):
    from apps.core.infrastructure.notificaciones_pedido import notificar_cambio_de_estado

    notificar_cambio_de_estado(pedido, 'pendiente')  # nunca lanza


def _candidatos(limite=None, externos=True, **filtros):
    from apps.core.models import Pedido

    nunca = Q(medio_pago__in=MEDIOS_MANUALES, tienda__horas_expiracion_pedido_manual=0)
    consulta = Pedido.objects.filter(
        estado='pendiente', medio_pago__in=MEDIOS_EXPIRABLES,
        fecha_creacion__lte=timezone.now() - timedelta(hours=1), **filtros,
    ).exclude(nunca).order_by('fecha_creacion', 'pk').values_list('pk', flat=True)
    if not externos:
        consulta = consulta.exclude(medio_pago__in=MEDIOS_EXTERNOS)
    return consulta[:limite] if limite else consulta


def ejecutar_ciclo_de_expiracion(limite=500):
    """
    resumen = Counter()
    for pk in list(_candidatos(limite)):
        try:
            resumen[_procesar_pedido(pk, consultar_pasarela=True)] += 1
        except Exception:
            logger.exception('No se pudo procesar la expiracion del pedido %s.', pk)
            resumen['error'] += 1
    return resumen


def expirar_pedidos_pendientes():
    return ejecutar_ciclo_de_expiracion(limite=None)[RESULTADO_CANCELADO]


def liberar_vencidos_de_tienda(tienda_pk):
    try:
        return sum(1 for pk in list(_candidatos(externos=False, tienda_id=tienda_pk))
                   if expirar_pedido_pendiente(pk, consultar_pasarela=False))
    except Exception:
        logger.exception('No se pudieron liberar los pedidos vencidos de la tienda %s', tienda_pk)
        return 0
