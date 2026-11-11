"""Emisión explícita después del pago y preparación física, sin reintentos ciegos."""
from hashlib import sha256
import json
from django.conf import settings
from django.db import transaction
from apps.core.models import Pedido, OrigenDespachoBlue
from apps.shipping.models import BlueShipment
from apps.shipping.infrastructure.blue_express.config import get_service_config, BlueExpressConfigurationError
from apps.shipping.infrastructure.blue_express.operations import (BlueOperationsClient, build_emission,
    parse_emission, parse_labels, parse_tracking, tracking_number)
from apps.shipping.infrastructure.blue_express.client import BlueExpressAPIError


class DispatchConflict(ValueError):
    pass


def configuration_hash(config):
    return sha256(json.dumps([config['environment'], config['client_account']], separators=(',', ':')).encode()).hexdigest()


def assert_configuration(shipment, service):
    config = get_service_config(service)
    if shipment.configuration_hash != configuration_hash(config):
        raise DispatchConflict('La cuenta o el ambiente Blue cambió. Revisa el despacho original.')
    return config


def public_state(shipment):
    if shipment is None:
        return {'estado':'sin_emitir','tracking':'','etiquetas':0,'seguimiento':{}}
    return {'estado':shipment.state, 'tracking':shipment.tracking_number,
            'etiquetas':len(shipment.labels), 'seguimiento':shipment.tracking,
            'referencia':shipment.payload.get('orderNumber', '')}


def persist_summary(shipment):
    # Nunca copia PDFs, credenciales ni request del proveedor al detalle del comprador.
    with transaction.atomic():
        order = Pedido.objects.select_for_update().get(pk=shipment.order_id)
        delivery = dict(order.entrega or {})
        delivery['blue_express'] = {'tracking':shipment.tracking_number, 'seguimiento':shipment.tracking}
        order.entrega = delivery
        order.save(update_fields=['entrega'])


def emit(*, order_id, store_id, packages):
    if not getattr(settings, 'BLUE_EXPRESS_EMISSION_ENABLED', False):
        raise BlueExpressConfigurationError('La emisión Blue está deshabilitada.')
    config = get_service_config('emission')
    with transaction.atomic():
        order = Pedido.objects.select_for_update().get(pk=order_id, tienda_id=store_id)
        existing = BlueShipment.objects.filter(order=order).first()
        if existing and existing.state != 'draft':
            if existing.state == 'emitted':
                assert_configuration(existing, 'emission')
                return existing
            raise DispatchConflict('Hay una emisión pendiente o incierta. Consulta Blue antes de volver a emitir.')
        if order.estado != 'pagado' or (order.entrega or {}).get('metodo') != 'Blue Express':
            raise DispatchConflict('Solo se emiten pedidos Blue pagados y pendientes de despacho.')
        origin = OrigenDespachoBlue.objects.filter(tienda_id=store_id).first()
        if origin is None:
            raise ValueError('Configura el origen de despacho de la tienda.')
        payload = build_emission(order, origin, packages, config['username'])
        shipment = existing or BlueShipment(order=order)
        shipment.payload = payload
        shipment.configuration_hash = configuration_hash(config)
        shipment.state = 'submitting'
        shipment.save()
    # Transacción confirmada ANTES del POST; nunca mantener un lock durante la red.
    try:
        response = BlueOperationsClient().request('emission', payload=payload)
        number = parse_emission(response)
    except BlueExpressConfigurationError:
        # La configuración se valida antes de realizar cualquier solicitud.
        BlueShipment.objects.filter(pk=shipment.pk, state='submitting').update(state='draft')
        raise
    except Exception:
        BlueShipment.objects.filter(pk=shipment.pk, state='submitting').update(state='unknown')
        raise BlueExpressAPIError('No se pudo confirmar la emisión. Revisa la orden en Blue; no se repetirá automáticamente.') from None
    # Conservar tracking aunque la etiqueta sea inválida: no volver a emitir.
    try:
        labels = parse_labels(response, emission=True)
    except BlueExpressAPIError:
        labels = []
    with transaction.atomic():
        shipment = BlueShipment.objects.select_for_update().get(pk=shipment.pk)
        if shipment.state == 'emitted' and shipment.tracking_number != number:
            raise DispatchConflict('Blue devolvió otro tracking después de la conciliación. Revisa ambos despachos con Blue.')
        shipment.tracking_number, shipment.labels, shipment.state = number, labels, 'emitted'
        shipment.save()
    persist_summary(shipment)
    return shipment


def refresh(*, shipment):
    assert_configuration(shipment, 'tracking')
    if shipment.state != 'emitted':
        raise DispatchConflict('Primero confirma la emisión del despacho.')
    response = BlueOperationsClient().request('tracking', tracking=shipment.tracking_number)
    shipment.tracking = parse_tracking(response, shipment.tracking_number)
    shipment.save(update_fields=['tracking','updated_at'])
    persist_summary(shipment)
    return shipment


def retrieve_labels(*, shipment):
    assert_configuration(shipment, 'label')
    if shipment.state != 'emitted':
        raise DispatchConflict('No hay una emisión confirmada.')
    response = BlueOperationsClient().request('label', tracking=shipment.tracking_number)
    shipment.labels = parse_labels(response)
    shipment.save(update_fields=['labels','updated_at'])
    return shipment


def reconcile(*, shipment, number):
    """Asocia OS ya creada únicamente si Blue confirma la referencia del pedido."""
    assert_configuration(shipment, 'tracking')
    number = tracking_number(number)
    response = BlueOperationsClient().request('tracking', tracking=number)
    summary = parse_tracking(response, number)
    reference = response['data'].get('numeroReferencia')
    expected = shipment.payload.get('orderNumber')
    if not isinstance(reference, str) or not expected or not (reference == expected or reference.startswith(expected + '-')):
        raise DispatchConflict('Blue no confirma que ese tracking corresponda a este pedido.')
    with transaction.atomic():
        locked = BlueShipment.objects.select_for_update().get(pk=shipment.pk)
        if locked.state not in ('unknown','submitting'):
            raise DispatchConflict('Este despacho no requiere conciliación.')
        # Un operador no puede conciliar mientras el POST podría seguir en vuelo.
        from django.utils import timezone
        if (timezone.now() - locked.updated_at).total_seconds() < 120:
            raise DispatchConflict('Espera dos minutos antes de conciliar una emisión pendiente.')
        locked.tracking_number, locked.tracking, locked.state = number, summary, 'emitted'
        locked.save()
    persist_summary(locked)
    return locked
