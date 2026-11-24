"""Availability and private reservation primitives; NOT a payment gateway."""
import hashlib
import json
from datetime import timedelta
from uuid import UUID

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.core.models import Tienda
from apps.landing.activities import activity_title, find_activity, paid_activity_details, require_paid_activity_open
from apps.landing.models import ConfiguracionLanding, ReservaActividadPagada, SolicitudActividad


def sale_snapshot(section, details):
    blocks = section.get('componentes', [])
    return {
        **({key: section['actividad'][key] for key in ('modalidad_venta', 'grabacion_id', 'acceso_dias')} if section['actividad'].get('modalidad_venta') == 'grabado' else {}),
        'titulo': activity_title(section),
        'tipo': section['actividad']['tipo'],
        'zona_horaria': section['actividad']['zona_horaria'],
        'inicio': details['inicio'].isoformat() if details['inicio'] else '',
        'termino': details['termino'].isoformat() if details['termino'] else '',
        'cierre': details['cierre'].isoformat() if details['cierre'] else '',
        'precio': details['precio'],
        'venta': dict(details['venta']),
        'condiciones': [b.get('texto', '') for b in blocks if b.get('visible') and b.get('tipo') == 'condiciones'],
        'requisitos': [b.get('texto', '') for b in blocks if b.get('visible') and b.get('tipo') == 'requisitos'],
        'modalidad': [b.get('modalidad', '') for b in blocks if b.get('visible') and b.get('tipo') == 'modalidad'],
        'ubicacion': [b.get('texto', '') for b in blocks if b.get('visible') and b.get('tipo') == 'ubicacion'],
    }


def sale_version(snapshot):
    return hashlib.sha256(json.dumps(snapshot, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode('utf-8')).hexdigest()


def occupied_seats(store, section_id, now):
    active = ReservaActividadPagada.objects.filter(tienda=store, seccion_id=section_id).filter(
        Q(estado__in=['en_pago','confirmada','revision_pago']) | Q(estado='reservada', vence__gt=now))
    paid = active.aggregate(total=Sum('cantidad'))['total'] or 0
    free = SolicitudActividad.objects.filter(tienda=store, seccion_id=section_id, tipo='inscripcion').exclude(estado='cancelada').count()
    return paid + free


def availability(store, section_id, *, now=None):
    now = now or timezone.now()
    config = ConfiguracionLanding.objects.filter(tienda=store).first()
    section = find_activity(config, section_id)
    details = paid_activity_details(section)
    snapshot = sale_snapshot(section, details)
    # Descontinuados: no ofertar grabaciones nuevas, sin alterar reservas o accesos historicos.
    if snapshot.get('modalidad_venta') == 'grabado':
        return {**snapshot, 'version': sale_version(snapshot), 'cupos_disponibles': 0,
                'estado': 'cerrada', 'hora_servidor': now.isoformat(), 'compra_habilitada': False}
    remaining = 1 if snapshot.get('modalidad_venta') == 'grabado' else max(0, details['cupos'] - occupied_seats(store, section_id, now))
    status = 'disponible' if snapshot.get('modalidad_venta') == 'grabado' else ('finalizada' if now >= details['termino'] else 'iniciada' if now >= details['inicio'] else
              'cerrada' if now >= details['cierre'] else 'agotada' if remaining == 0 else 'disponible')
    return {**snapshot, 'version': sale_version(snapshot), 'cupos_disponibles': remaining,
            'estado': status, 'hora_servidor': now.isoformat(), 'compra_habilitada': False}


@transaction.atomic
def reserve_activity(store, section_id, *, checkout_key, quantity, accepted_version, now=None):
    """Server-internal only: use inside the future authenticated/guest checkout transaction.

    No payment is started here. A later integration must bind the reservation to a real
    order, start payment before expiry, and reconcile provider results before release.
    """
    if type(quantity) is not int or not 1 <= quantity <= 10000:
        raise ValidationError('Cantidad de participantes inválida.')
    try:
        checkout_key = UUID(str(checkout_key))
        section_id = UUID(str(section_id))
    except (TypeError, ValueError, AttributeError):
        raise ValidationError('Identificador inválido.') from None
    Tienda.objects.select_for_update().get(pk=store.pk)
    config = ConfiguracionLanding.objects.select_for_update().filter(tienda=store).first()
    now = now or timezone.now()
    section = find_activity(config, section_id)
    if section['actividad'].get('modalidad_venta') == 'grabado':
        raise ValidationError('La venta de talleres grabados no esta disponible en esta etapa.')
    details = require_paid_activity_open(section, now=now)
    snapshot = sale_snapshot(section, details)
    if sale_version(snapshot) != accepted_version:
        raise ValidationError('La actividad cambió. Revisa y acepta nuevamente sus condiciones.')
    previous = ReservaActividadPagada.objects.filter(tienda=store, seccion_id=section_id, clave_checkout=checkout_key).first()
    if previous:
        if previous.cantidad != quantity or previous.condiciones != snapshot:
            raise ValidationError('El intento de compra ya tiene una reserva diferente.')
        if previous.estado == 'liberada' or (previous.estado == 'reservada' and previous.vence <= now):
            raise ValidationError('La reserva venció. Inicia un nuevo intento de compra.')
        return previous
    if snapshot.get('modalidad_venta') == 'grabado':
        if quantity != 1:
            raise ValidationError('Cada compra de una grabación corresponde a un acceso personal.')
        from apps.landing.private_recordings import require_recording
        require_recording(store, snapshot['grabacion_id'])
    elif quantity > details['cupos'] - occupied_seats(store, section_id, now):
        raise ValidationError('No quedan suficientes cupos disponibles.')
    return ReservaActividadPagada.objects.create(tienda=store, seccion_id=section_id, clave_checkout=checkout_key,
        cantidad=quantity, precio_unitario=details['precio'], inicio=details['inicio'], cierre=details['cierre'],
        condiciones=snapshot, vence=min(now + timedelta(minutes=15), details['cierre']) if details['cierre'] else now + timedelta(minutes=15))
