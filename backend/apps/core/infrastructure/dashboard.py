"""Dashboard comercial: agregación acotada por fecha/estado, sin joins a pagos o ítems."""
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Count, Sum
from django.db.models.functions import TruncDate
from apps.core.models import Pedido
from apps.core.domain.periodos import limites_rango


def _variation(current, previous):
    if not previous:
        return None
    return format(((Decimal(current) - Decimal(previous)) * 100 / Decimal(previous)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP), '.2f')


def consultar_dashboard(tienda, inicio, fin, zona):
    days = (fin - inicio).days + 1
    previous_start = date.fromordinal(max(1, inicio.toordinal() - days))
    previous_end = inicio - timedelta(days=1) if inicio > date.min else None
    desde, hasta = limites_rango(previous_start, fin, zona)
    rows = (Pedido.objects.filter(tienda=tienda, fecha_creacion__gte=desde, fecha_creacion__lt=hasta)
        .annotate(fecha=TruncDate('fecha_creacion', tzinfo=zona)).values('fecha', 'estado')
        .annotate(pedidos=Count('pk'), monto=Sum('monto_total')).order_by('fecha', 'estado'))
    by_day = {}
    distribution = {state: {'estado': state, 'etiqueta': label, 'pedidos': 0} for state, label in Pedido.ESTADO_CHOICES}
    sales = previous_sales = Decimal('0.00')
    orders = confirmed = pending = previous_orders = 0
    for row in rows:
        paid = row['estado'] in Pedido.ESTADOS_PAGADOS
        amount = row['monto'] if paid else Decimal('0.00')
        if row['fecha'] < inicio:
            previous_sales += amount
            previous_orders += row['pedidos']
            continue
        sales += amount
        orders += row['pedidos']
        confirmed += row['pedidos'] if paid else 0
        pending += row['pedidos'] if row['estado'] in ('pendiente', 'pagado', 'preparando', 'en_origen') else 0
        day = by_day.setdefault(row['fecha'], {'ventas': Decimal('0.00'), 'pedidos': 0})
        day['ventas'] += amount
        day['pedidos'] += row['pedidos']
        state = distribution.setdefault(row['estado'], {'estado': row['estado'], 'etiqueta': row['estado'], 'pedidos': 0})
        state['pedidos'] += row['pedidos']
    history = []
    current = inicio
    while current <= fin:
        day = by_day.get(current, {'ventas': Decimal('0.00'), 'pedidos': 0})
        history.append({'fecha': current.isoformat(), 'ventas': format(day['ventas'], '.2f'), 'pedidos': day['pedidos']})
        current += timedelta(days=1)
    comparable = previous_end is not None and (previous_end - previous_start).days + 1 == days
    return {
        'fecha_desde': inicio.isoformat(), 'fecha_hasta': fin.isoformat(), 'zona_horaria': str(zona), 'moneda': 'CLP',
        'total_ventas': format(sales, '.2f'), 'total_pedidos': orders, 'por_despachar': pending, 'historico': history,
        'pedidos_pagados': confirmed,
        'ticket_promedio': format((sales / confirmed).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP), '.2f') if confirmed else None,
        'distribucion_estados': list(distribution.values()),
        'comparacion': {
            'fecha_desde': previous_start.isoformat(), 'fecha_hasta': previous_end.isoformat() if previous_end else None,
            'total_ventas': format(previous_sales, '.2f'), 'total_pedidos': previous_orders,
            'variacion_ventas': _variation(sales, previous_sales) if comparable else None,
            'variacion_pedidos': _variation(orders, previous_orders) if comparable else None,
        },
    }
