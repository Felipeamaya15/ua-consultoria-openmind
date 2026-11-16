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
    # Capture the exact terms and schedule. Never include a private meeting link.
    blocks = section.get('componentes', [])
    return {
        'titulo': activity_title(section),
        'tipo': section['actividad']['tipo'],
        'zona_horaria': section['actividad']['zona_horaria'],
        'inicio': details['inicio'].isoformat(),
        'termino': details['termino'].isoformat(),
        'cierre': details['cierre'].isoformat(),
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
    # Never release seats during uncertain/in-flight payments just because a clock expired.
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
    remaining = max(0, details['cupos'] - occupied_seats(store, section_id, now))
    status = ('finalizada' if now >= details['termino'] else 'iniciada' if now >= details['inicio'] else
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
    # Same lock order as the existing free registrations and landing writes.
    Tienda.objects.select_for_update().get(pk=store.pk)
    config = ConfiguracionLanding.objects.select_for_update().filter(tienda=store).first()
    now = now or timezone.now()
    section = find_activity(config, section_id)
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
    if quantity > details['cupos'] - occupied_seats(store, section_id, now):
        raise ValidationError('No quedan suficientes cupos disponibles.')
    return ReservaActividadPagada.objects.create(tienda=store, seccion_id=section_id, clave_checkout=checkout_key,
        cantidad=quantity, precio_unitario=details['precio'], inicio=details['inicio'], cierre=details['cierre'],
        condiciones=snapshot, vence=min(now + timedelta(minutes=15), details['cierre']))
