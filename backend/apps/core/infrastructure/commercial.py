"""Consultas comerciales compartidas por históricos y exportaciones privadas."""
from decimal import Decimal

from django.db.models import Q, Count, Sum, F, DecimalField, ExpressionWrapper, Exists, OuterRef
from django.utils import timezone

from apps.core.domain import historial as reglas
from apps.core.domain.periodos import ZONA_COMERCIAL
from apps.core.models import Pedido, ItemPedido
from apps.core.infrastructure.reports import NOTA_FECHAS

ZERO = Decimal('0')
FILTERS = {'fecha_desde', 'fecha_hasta', 'q', 'estado', 'entrega', 'pago', 'metodo_pago',
           'orden', 'pagina', 'tamano', 'agrupacion', 'tienda_id', 'id_tienda'}
MAX_ORDERS = 50000
MAX_LINES = 250000


def validate_params(params, allowed=FILTERS):
    if set(params) - allowed:
        raise reglas.ParametroInvalido('Hay filtros no admitidos en esta consulta.', 'FILTRO_INVALIDO')
    if hasattr(params, 'getlist') and any(len(params.getlist(k)) != 1 for k in params):
        raise reglas.ParametroInvalido('Los filtros no pueden estar repetidos.', 'FILTRO_INVALIDO')


def order_query(store, params, *, sales=False):
    validate_params(params)
    date_range = reglas.leer_rango(params)
    reglas.leer_pagina(params)
    order = reglas.leer_orden(params)
    text = reglas.leer_busqueda(params)
    state = reglas.leer_estado(params, {s for s, _ in Pedido.ESTADO_CHOICES} | {'confirmed', 'dispatch'})
    query = date_range.aplicar(Pedido.objects.filter(tienda=store))
    if sales:
        query = query.filter(estado__in=Pedido.ESTADOS_PAGADOS)
    if state == 'confirmed':
        query = query.filter(estado__in=Pedido.ESTADOS_PAGADOS)
    elif state == 'dispatch':
        query = query.filter(estado__in=('pendiente', 'pagado', 'preparando', 'en_origen'))
    elif state:
        query = query.filter(estado=state)
    payment = params.get('pago', '')
    if payment not in ('', 'confirmado', 'pendiente', 'cancelado'):
        raise reglas.ParametroInvalido('Selecciona un estado de pago válido.', 'PAGO_INVALIDO')
    if payment:
        query = query.filter(estado__in=Pedido.ESTADOS_PAGADOS) if payment == 'confirmado' else query.filter(estado=payment)
    delivery = params.get('entrega', '')
    if delivery not in ('', 'retiro', 'envio'):
        raise reglas.ParametroInvalido('Selecciona retiro o envío.', 'ENTREGA_INVALIDA')
    if delivery:
        # El checkout conserva exactamente estos valores en el snapshot.
        query = query.filter(entrega__metodo='Retiro') if delivery == 'retiro' else query.filter(entrega__metodo__in=('Chilexpress', 'Starken'))
    method = params.get('metodo_pago', '').strip()
    if len(method) > 50:
        raise reglas.ParametroInvalido('El método de pago admite hasta 50 caracteres.', 'METODO_INVALIDO')
    if method:
        query = query.filter(Q(metodo_pago__iexact=method) | Q(metodo_pago='', medio_pago__iexact=method))
    if text:
        matches = ItemPedido.objects.filter(id_pedido_id=OuterRef('pk')).filter(
            Q(nombre_producto__icontains=text) | Q(sku__icontains=text))
        query = query.alias(matches_items=Exists(matches)).filter(
            Q(identificador__icontains=text) | Q(nombre_contacto__icontains=text) | Q(matches_items=True))
    return query.order_by(*order), date_range


def payment_status(order):
    return 'confirmado' if order.estado in Pedido.ESTADOS_PAGADOS else ('cancelado' if order.estado == 'cancelado' else 'pendiente')


def amounts(order):
    return {'bruto_productos': order.monto_total + order.descuento - order.costo_envio,
            'descuento': order.descuento, 'neto_productos': order.monto_total - order.costo_envio,
            'envio': order.costo_envio, 'total': order.monto_total,
            'confirmado': order.monto_total if order.estado in Pedido.ESTADOS_PAGADOS else ZERO}


def serialize_order(order):
    lines = [{'id_item_pedido': line.pk, 'nombre_producto': line.nombre_producto,
              'sku': line.sku, 'atributos': line.atributos, 'atributos_variante': line.atributos_variante,
              'cantidad': line.cantidad, 'precio_unitario': format(line.precio_unitario, '.2f'),
              'total_linea': format(line.precio_unitario * line.cantidad, '.2f'), 'descuento_linea': None}
             for line in order.itempedido_set.all()]
    return {'id_pedido': order.pk, 'identificador': order.identificador,
            'nombre_contacto': order.nombre_contacto, 'correo_contacto': order.correo_contacto,
            'estado': order.estado, 'estado_etiqueta': order.get_estado_display(),
            'medio_pago': order.medio_pago, 'metodo_pago': order.metodo_pago or order.medio_pago,
            'pago_estado': payment_status(order), 'monto_total': format(order.monto_total, '.2f'),
            'fecha_creacion': order.fecha_creacion.isoformat(), 'moneda': 'CLP',
            'descuento': format(order.descuento, '.2f'), 'costo_envio': format(order.costo_envio, '.2f'),
            'entrega': order.entrega, 'items': lines,
            'importes': {key: format(value, '.2f') for key, value in amounts(order).items()}}


def paid_summary(query):
    paid = query.filter(estado__in=Pedido.ESTADOS_PAGADOS)
    row = paid.aggregate(pedidos=Count('pk'), total=Sum('monto_total'), descuento=Sum('descuento'), envio=Sum('costo_envio'))
    total, discount, shipping = (row[k] or ZERO for k in ('total', 'descuento', 'envio'))
    missing = paid.annotate(line_count=Count('itempedido')).filter(line_count=0).count()
    return {'pedidos_confirmados': row['pedidos'], 'bruto_productos': format(total + discount - shipping, '.2f'),
            'descuentos': format(discount, '.2f'), 'neto_productos': format(total - shipping, '.2f'),
            'envio': format(shipping, '.2f'), 'importe_confirmado': format(total, '.2f'),
            'pedidos_sin_lineas': missing, 'moneda': 'CLP', 'nota_fechas': NOTA_FECHAS,
            'nota_descuentos': 'El descuento se registra por pedido. No existe un descuento histórico por línea.'}


def export_check(query):
    # Primero se comprueba el tamaño; nunca se devuelve un archivo parcial.
    if query.count() > MAX_ORDERS or ItemPedido.objects.filter(id_pedido__in=query.values('pk')).count() > MAX_LINES:
        raise reglas.ParametroInvalido(f'Reduce el período: máximo {MAX_ORDERS:,} pedidos y {MAX_LINES:,} líneas por exportación.', 'EXPORTACION_DEMASIADO_GRANDE')


def product_totals(query):
    value = ExpressionWrapper(F('cantidad') * F('precio_unitario'), output_field=DecimalField(max_digits=24, decimal_places=2))
    return (ItemPedido.objects.filter(id_pedido__in=query.filter(estado__in=Pedido.ESTADOS_PAGADOS).values('pk'))
            .values('producto_mongo_id', 'id_producto_id', 'nombre_producto', 'sku')
            .annotate(unidades=Sum('cantidad'), bruto_lineas=Sum(value)).order_by('nombre_producto', 'sku'))


def local_date(value):
    return timezone.localtime(value, ZONA_COMERCIAL).replace(tzinfo=None)
