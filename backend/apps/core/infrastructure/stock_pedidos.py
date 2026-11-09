import logging

from django.db import transaction

logger = logging.getLogger(__name__)


def cantidad_apartada(tienda_pk, producto_mongo_id, sku):
    from django.db.models import Sum

    from apps.core.models import ItemPedido

    return ItemPedido.objects.filter(
        id_pedido__tienda_id=tienda_pk, id_pedido__estado='pendiente',
        producto_mongo_id=producto_mongo_id, sku=sku,
    ).aggregate(total=Sum('cantidad'))['total'] or 0


def descontar_stock_de_pedido(pedido_pk):
    from apps.catalog.infrastructure.repositories import ProductRepository
    from apps.core.models import ItemPedido, Pedido, Producto

    with transaction.atomic():
        pedido = Pedido.objects.select_for_update().filter(pk=pedido_pk).first()
        if not pedido or pedido.estado not in Pedido.ESTADOS_PAGADOS or pedido.stock_descontado:
            return False
        tienda_id = str(pedido.tienda_id)
        repositorio = ProductRepository()
        lineas = list(ItemPedido.objects.filter(id_pedido=pedido).values(
            'producto_mongo_id', 'sku', 'cantidad', 'id_producto_id'))
        descontadas = []
        try:
            for linea in lineas:
                if not repositorio.decrease_stock(tienda_id, linea['sku'], linea['cantidad']):
                    raise ValueError(f"Stock insuficiente para {linea['sku']}.")
                descontadas.append(linea)
        except Exception:
            for linea in reversed(descontadas):
                try:
                    repositorio.restore_stock(tienda_id, linea['producto_mongo_id'], linea['sku'], linea['cantidad'])
                except Exception:
                    logger.exception('No se pudo restituir stock del pedido %s, SKU %s', pedido.pk, linea['sku'])
            logger.critical('PAGO_SIN_STOCK pedido=%s tienda=%s medio=%s', pedido.pk, tienda_id, pedido.medio_pago)
            return False
        for linea in lineas:
            if linea['id_producto_id']:
                actual = repositorio.get_by_id(tienda_id, linea['producto_mongo_id'])
                Producto.objects.filter(pk=linea['id_producto_id'], id_tienda_id=tienda_id).update(
                    stock=sum(v.get('stock', 0) for v in (actual or {}).get('variantes', [])))
        pedido.stock_descontado = True
        pedido.save(update_fields=['stock_descontado'])
    return True
