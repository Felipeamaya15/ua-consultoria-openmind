"""Agregados comerciales por mes y estado; nunca materializa pedidos individuales."""
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Count, Sum
from django.db.models.functions import ExtractMonth
from django.utils import timezone

from apps.core.models import Pedido
from apps.core.domain.periodos import inicio_dia_utc

MESES = ('Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
         'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre')
NOTA_FECHAS = ('Los importes corresponden al estado actual del pedido y se atribuyen a su fecha de creación '
               'en Chile. El modelo no registra la fecha efectiva de confirmación del pago.')


def consultar_informe(tienda, anio, mes, zona):
    base = Pedido.objects.filter(tienda=tienda)
    actual = timezone.localdate(timezone=zona).year
    anios = {d.year for d in base.datetimes('fecha_creacion', 'year', tzinfo=zona) if d.year <= actual}
    anios.add(actual)
    inicio = date(anio, mes or 1, 1)
    fin_exclusivo = date(anio + 1, 1, 1) if mes in (None, 12) else date(anio, mes + 1, 1)
    rows = (base.filter(fecha_creacion__gte=inicio_dia_utc(inicio, zona),
                        fecha_creacion__lt=inicio_dia_utc(fin_exclusivo, zona))
            .annotate(mes=ExtractMonth('fecha_creacion', tzinfo=zona)).values('mes', 'estado')
            .annotate(pedidos=Count('pk'), monto=Sum('monto_total')).order_by('mes', 'estado'))
    meses = {m: {'mes': m, 'etiqueta': MESES[m - 1], 'ventas': Decimal('0'), 'pedidos': 0, 'pagados': 0}
             for m in ([mes] if mes else range(1, 13))}
    estados = {e: {'estado': e, 'etiqueta': label, 'pedidos': 0} for e, label in Pedido.ESTADO_CHOICES}
    for row in rows:
        bucket = meses[row['mes']]
        bucket['pedidos'] += row['pedidos']
        if row['estado'] in Pedido.ESTADOS_PAGADOS:
            bucket['ventas'] += row['monto']
            bucket['pagados'] += row['pedidos']
        estados.setdefault(row['estado'], {'estado': row['estado'], 'etiqueta': row['estado'], 'pedidos': 0})['pedidos'] += row['pedidos']
    ventas = sum((b['ventas'] for b in meses.values()), Decimal('0'))
    pedidos = sum(b['pedidos'] for b in meses.values())
    pagados = sum(b['pagados'] for b in meses.values())
    def mejores(campo):
        maximo = max(b[campo] for b in meses.values())
        return [b['mes'] for b in meses.values() if b[campo] == maximo] if maximo else []
    return {
        'tienda': tienda.nombre, 'anio': anio, 'mes': mes, 'anios_disponibles': sorted(anios, reverse=True),
        'fecha_desde': inicio.isoformat(), 'fecha_hasta': (fin_exclusivo - timedelta(days=1)).isoformat(),
        'moneda': 'CLP', 'zona_horaria': str(zona), 'total_ventas': format(ventas, '.2f'),
        'total_pedidos': pedidos, 'pedidos_pagados': pagados,
        'ticket_promedio': format((ventas / pagados).quantize(Decimal('.01'), rounding=ROUND_HALF_UP), '.2f') if pagados else None,
        'mejores_meses': {'ventas': mejores('ventas'), 'pedidos': mejores('pedidos')},
        'meses': [{**b, 'ventas': format(b['ventas'], '.2f')} for b in meses.values()],
        'distribucion_estados': list(estados.values()), 'nota_fechas': NOTA_FECHAS,
    }
