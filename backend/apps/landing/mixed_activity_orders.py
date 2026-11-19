"""Mixed commercial stock effects. Caller holds the SQL order lock.
A marker is written in the same atomic Mongo update as each stock decrement.
A SQL rollback or network timeout cannot repeat a completed stock decrement.
No purchase is marked paid if any required stock operation remains unverified.
"""
import os
from decimal import Decimal
from bson import ObjectId
from apps.core.models import Producto
from apps.catalog.infrastructure.repositories import ProductRepository
from apps.catalog.domain.exceptions import TransbankTransaccionException

OPS='actividad_stock_operaciones_v1'

def mixed_enabled():
    return os.environ.get('PAID_ACTIVITY_MIXED_ENABLED')=='1'

def physical_lines(order):
    return list(order.itempedido_set.exclude(producto_mongo_id='').order_by('pk'))

def physical_total(lines):
    return sum((Decimal(line.precio_unitario)*line.cantidad for line in lines),Decimal(0))

def validate_total(order,rows,lines):
    expected=sum((Decimal(r.precio_unitario)*r.cantidad for r in rows),Decimal(0))+physical_total(lines)+order.costo_envio
    if order.descuento or expected!=order.monto_total or order.costo_envio<0:
        raise TransbankTransaccionException('El total de productos, inscripciones y despacho no coincide con el pedido.')
    return expected

def marker(order,line):
    if not order.clave_checkout or not line.pk:
        raise TransbankTransaccionException('El inventario requiere revisión.')
    return f'{order.clave_checkout.hex}:{line.pk}'

def base_query(order,line):
    if not ObjectId.is_valid(str(line.producto_mongo_id)) or not line.sku or line.cantidad<=0:
        raise TransbankTransaccionException('Artículo físico inválido. Revisa el inventario de este pedido.')
    return {'_id':ObjectId(str(line.producto_mongo_id)), 'tienda_id':str(order.tienda_id)}

def deduct_locked(order,lines):
    if not lines or order.stock_descontado:return
    repo=ProductRepository()
    try:
        for line in lines:
            base=base_query(order,line);operation=marker(order,line)
            from pymongo.write_concern import WriteConcern
            collection=repo.collection.with_options(write_concern=WriteConcern(w='majority',j=True))
            result=collection.update_one({**base,OPS:{'$ne':operation},'variantes':{'$elemMatch':{'sku':line.sku,'stock':{'$gte':line.cantidad}}}},
                {'$inc':{'variantes.$.stock':-line.cantidad},'$addToSet':{OPS:operation}})
            if result.modified_count!=1 and not collection.find_one({**base,OPS:operation},{'_id':1}):
                raise ValueError('No se verificó el descuento.')
            if line.id_producto_id:
                product=collection.find_one(base,{'variantes':1})
                if not product:raise ValueError('Producto no encontrado.')
                Producto.objects.filter(pk=line.id_producto_id,id_tienda_id=order.tienda_id).update(stock=sum(v.get('stock',0) for v in product.get('variantes',[])))
        order.stock_descontado=True
        order.save(update_fields=['stock_descontado'])
    except Exception:
        raise TransbankTransaccionException('El pago puede estar autorizado. El inventario está en revisión; no vuelvas a pagar.') from None

def has_stock_effects(order):
    lines=physical_lines(order)
    if not lines:return False
    if order.stock_descontado:return True
    repo=ProductRepository()
    for line in lines:
        doc=repo.collection.find_one(base_query(order,line),{OPS:1})
        if doc is None:raise TransbankTransaccionException('El producto ya no existe. Revisa el pedido manualmente.')
        if marker(order,line) in doc.get(OPS,[]):return True
    return False
