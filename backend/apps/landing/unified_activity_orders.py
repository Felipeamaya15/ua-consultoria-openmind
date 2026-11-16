"""Canonical order / paid activity integration. QA only, transfer only.
No provider calls or refund operations. SQL reservation state is separate from physical stock.
"""
import os
from decimal import Decimal
from urllib.parse import urlsplit
from django.conf import settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError, PermissionDenied
from apps.landing.models import ReservaActividadPagada
from apps.landing.paid_availability import reserve_activity

MARKER = 'actividad_unificada_qa_v1'

def is_unified_qa(order):
    return (order.entrega or {}).get('origen') == MARKER

def qa_enabled(request):
    if not settings.DEBUG or os.environ.get('PAID_ACTIVITY_UNIFIED_QA') != '1':
        return False
    return urlsplit('http://' + request.get_host()).hostname in ('localhost','127.0.0.1','::1','testserver')

def require_qa(request, data):
    if not qa_enabled(request):
        raise PermissionDenied('La compra de actividades aún no está habilitada en esta instalación.')
    if data['medio_pago'] != 'Transferencia':
        raise ValidationError({'medio_pago':'Para esta prueba utiliza transferencia, sin enviar dinero.'})
    if data['codigo_promocional']:
        raise ValidationError({'codigo_promocional':'Los descuentos de actividades aún están en pruebas. Quita el código.'})
    if not data['contacto']['email'].lower().endswith('@example.com'):
        raise ValidationError({'contacto':'Utiliza un correo ficticio terminado en @example.com para esta prueba.'})

def reserve_lines(store, data):
    rows = []
    for line in data['actividades']:
        reservation = reserve_activity(store,line['seccion_id'],checkout_key=data['clave_checkout'],
            quantity=line['cantidad'],accepted_version=line['version'])
        if reservation.estado != 'reservada':
            raise ValidationError('Este intento ya tiene una reserva procesada.')
        rows.append(reservation)
    return rows

def order_line(row):
    return dict(nombre_producto=row.condiciones['titulo'][:200], sku='', cantidad=row.cantidad,
        precio_unitario=Decimal(row.precio_unitario), atributos={'actividad_id':str(row.seccion_id),
        'reserva_id':str(row.pk), 'tipo':row.condiciones['tipo'], 'inicio':row.condiciones['inicio']},
        atributos_variante=[{'etiqueta':'Actividad','valor':row.condiciones['tipo']},
                           {'etiqueta':'Inicio','valor':row.condiciones['inicio']}])

def resolve_unified_qa(order, *, approve):
    # Caller must hold the order lock inside transaction.atomic().
    if not is_unified_qa(order): return False
    if not settings.DEBUG:
        raise PermissionDenied('Los pedidos QA se resuelven únicamente en el entorno local.')
    rows = list(ReservaActividadPagada.objects.select_for_update().filter(tienda_id=order.tienda_id,clave_checkout=order.clave_checkout))
    if not rows or any(r.estado!='en_pago' for r in rows):
        raise ValidationError('No hay reservas pendientes válidas para este pedido.')
    if approve and any(timezone.now()>=r.vence for r in rows):
        raise ValidationError('La reserva de prueba venció. Rechaza el pedido y vuelve a realizar la compra.')
    if approve and any(timezone.now()>=r.inicio for r in rows):
        raise ValidationError('La actividad ya comenzó. Revisa la transferencia y gestiona el caso manualmente.')
    ReservaActividadPagada.objects.filter(pk__in=[r.pk for r in rows]).update(estado='confirmada' if approve else 'liberada')
    return True
