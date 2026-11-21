"""Commercial activity orders using existing provider credentials and checkout.
Uncertain outcomes retain the reservation; no unverified payment releases seats.
"""
import hashlib
import json
import os
from decimal import Decimal, InvalidOperation
from datetime import timedelta
from urllib.parse import quote

import requests
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from apps.core.models import Pedido, ConfiguracionMercadoPago, ConfiguracionPayPal
from apps.landing.models import ReservaActividadPagada
from apps.landing.mixed_activity_orders import physical_lines, validate_total, deduct_locked
from apps.core.presentation.pago_pedido_pendiente import ErrorPago

MARKER = 'actividad_pasarela_v1'
META = 'pago_actividad_externo'
METHODS = ('MercadoPago', 'PayPal', 'TUU', 'Linkify')


def is_external(order):
    return (order.entrega or {}).get('origen') == MARKER


def meta(order):
    return (order.entrega or {}).get(META) or {}


def save_meta(order, **updates):
    order.entrega = {**(order.entrega or {}), META: {**meta(order), **updates}}
    order.save(update_fields=['entrega'])


def snapshot(store, method, active=True):
    """Bind to the original configuration, including credential rotation. No secret stored."""
    if method in ('MercadoPago', 'PayPal'):
        model = ConfiguracionMercadoPago if method == 'MercadoPago' else ConfiguracionPayPal
        query = model.objects.filter(id_tienda=store)
        if active:
            query = query.filter(activo=True)
        cfg = query.first()
        if not cfg:
            return None
        if method == 'MercadoPago':
            account, secret = cfg.public_key, cfg.access_token
        else:
            account, secret = cfg.client_id, cfg.client_secret
        environment = str(cfg.ambiente).upper()
        if environment not in (('SANDBOX', 'PRODUCCION') if method == 'MercadoPago' else ('SANDBOX', 'LIVE')):
            return None
    elif method == 'TUU':
        from apps.core.presentation.tuu_callback import credenciales_tuu
        cfg = credenciales_tuu(store)
        if not cfg:
            return None
        account, secret, environment = cfg
        environment = {'PRODUCTION':'PRODUCCION','INTEGRATION':'INTEGRACION'}.get(str(environment).upper(),str(environment).upper())
        if environment not in ('INTEGRACION', 'PRODUCCION'):
            return None
        if not getattr(settings, 'TUU_CALLBACK_BASE_URL', '').startswith('https://'):
            return None
    elif method == 'Linkify':
        from apps.core.presentation.checkout import CheckoutOrderAPIView
        cfg = CheckoutOrderAPIView._credenciales_linkify(store)
        if not cfg:
            return None
        account, secret = cfg
        environment = 'PRODUCCION'
    else:
        return None
    if not account or not secret:
        return None
    digest = hashlib.sha256(json.dumps([str(account), str(secret)], separators=(',', ':')).encode()).hexdigest()
    return {'medio': method, 'ambiente': environment, 'config_hash': digest}


def allowed_methods(store):
    configured = set(os.environ.get('PAID_ACTIVITY_EXTERNAL_METHODS', '').split(','))
    if not configured.intersection(METHODS):
        return []
    from apps.core.payments import payment_methods_for_store, PAYMENT_METHODS
    payments = payment_methods_for_store(store)
    result = []
    for method in METHODS:
        if method not in configured or not payments.get(PAYMENT_METHODS[method], {}).get('enabled'):
            continue
        data = snapshot(store, method)
        if data and (data['ambiente'] in ('SANDBOX', 'INTEGRACION') or os.environ.get('PAID_ACTIVITY_EXTERNAL_ALLOW_LIVE') == '1'):
            result.append(method)
    return result


def assert_config(order, start=False):
    cfg = snapshot(order.tienda, order.medio_pago, active=start)
    if not cfg or any(meta(order).get(k) != v for k, v in cfg.items()):
        raise ErrorPago('La configuración comercial cambió. El pago necesita revisión.', 'ACTIVIDAD_CONFIG_CAMBIO', 409)
    if start and order.medio_pago not in allowed_methods(order.tienda):
        raise ErrorPago('Este medio de pago no está habilitado.', 'ACTIVIDAD_MEDIO_NO_DISPONIBLE', 409)
    return cfg


def rows_for(order, lock=False):
    query = ReservaActividadPagada.objects.filter(tienda_id=order.tienda_id, clave_checkout=order.clave_checkout).order_by('pk')
    return query.select_for_update() if lock else query


def deadline(order):
    if order.estado != 'pendiente':
        return None
    return rows_for(order).filter(estado='en_pago').order_by('vence').values_list('vence', flat=True).first()


def amount_equal(value, expected):
    try:
        amount = Decimal(str(value))
        return amount.is_finite() and amount == Decimal(expected)
    except (InvalidOperation, ValueError, TypeError):
        return False


def approve_locked(order, reference, currency, amount):
    """Caller verified provider identity and holds SQL order lock."""
    if not is_external(order):
        raise ErrorPago('Pedido no disponible.', 'ACTIVIDAD_PAGO_INVALIDO', 409)
    assert_config(order)
    fx = order.pago_fx or {}
    expected = fx.get('monto_usd') if order.medio_pago == 'PayPal' else order.monto_total
    expected_currency = 'USD' if order.medio_pago == 'PayPal' else 'CLP'
    if not meta(order).get('inicio') or not reference or currency != expected_currency or expected is None or not amount_equal(amount, expected):
        raise ErrorPago('El importe, moneda o referencia del pago no coincide.', 'PAGO_NO_COINCIDE', 409)
    previously = meta(order).get('referencia_pago')
    if order.estado in Pedido.ESTADOS_PAGADOS and previously == str(reference):
        return order
    if previously and previously != str(reference):
        raise ErrorPago('Existe otro pago para este pedido; requiere revisión.', 'PAGO_DUPLICADO', 409)
    rows = list(rows_for(order, True))
    if order.estado != 'pendiente' or not rows or any(r.estado != 'en_pago' for r in rows):
        raise ErrorPago('El pago requiere revisión de la tienda.', 'ACTIVIDAD_PAGO_REVISION', 409)
    physical = physical_lines(order)
    try:
        validate_total(order, rows, physical)
        deduct_locked(order, physical)
    except Exception:
        raise ErrorPago('Pago recibido; inventario en revisión. No pagues nuevamente.', 'ACTIVIDAD_STOCK_REVISION', 409) from None
    ReservaActividadPagada.objects.filter(pk__in=[r.pk for r in rows]).update(estado='confirmada')
    save_meta(order, referencia_pago=str(reference), moneda=currency, monto=str(amount), confirmado_en=timezone.now().isoformat(), actividad_iniciada=any(timezone.now()>=r.inicio for r in rows))
    order.estado = 'pagado'
    order.save(update_fields=['estado'])
    from apps.landing.activity_owner_notifications import programar_aviso_inscripcion
    programar_aviso_inscripcion(order.pk)
    if meta(order).get('ambiente') not in ('SANDBOX','INTEGRACION'):
        from apps.core.infrastructure.notificaciones_pedido import notificar_cambio_de_estado
        transaction.on_commit(lambda: notificar_cambio_de_estado(order, 'pendiente'))
    return order


def start_online(order_pk, creator):
    """Only expose one payable preference/order per checkout; preserve fixed FX."""
    with transaction.atomic():
        order = Pedido.objects.select_for_update().get(pk=order_pk)
        assert_config(order, start=True)
        if order.estado != 'pendiente' or not deadline(order) or timezone.now() >= deadline(order):
            raise ErrorPago('La reserva ya no admite nuevos pagos.', 'PEDIDO_NO_DISPONIBLE', 409)
        existing = meta(order).get('inicio')
        if existing:
            return existing
        result = creator(order)
        save_meta(order, inicio=result)
        return result


def assert_adapter(order, adapter):
    if order.medio_pago=='MercadoPago':
        cfg=ConfiguracionMercadoPago.objects.filter(id_tienda=order.tienda).first()
        matches=cfg and adapter.access_token==cfg.access_token and adapter.ambiente==cfg.ambiente
    else:
        cfg=ConfiguracionPayPal.objects.filter(id_tienda=order.tienda).first()
        matches=cfg and adapter.client_id==cfg.client_id and adapter.client_secret==cfg.client_secret and (('sandbox' in adapter.base_url)==(cfg.ambiente=='SANDBOX'))
    if not matches:raise ErrorPago('La configuración de pago cambió.','ACTIVIDAD_CONFIG_CAMBIO',409)

def mp_raw(adapter, reference):
    if not str(reference).isdigit():
        raise ErrorPago('Referencia inválida.', 'PAGO_NO_COINCIDE', 409)
    return adapter._request('GET', f'{adapter.BASE_URL}/v1/payments/{reference}', timeout=20)


def paypal_raw(adapter, order_id):
    token = adapter._get_access_token()
    resp = requests.get(f'{adapter.base_url}/v2/checkout/orders/{quote(str(order_id),safe="")}', headers={'Authorization':f'Bearer {token}'}, timeout=20, allow_redirects=False)
    if resp.status_code != 200:
        raise ErrorPago('No se pudo consultar PayPal.', 'PAYPAL_NO_DISPONIBLE', 503)
    return resp.json()


def verify_mp_locked(order, raw, reference):
    if str(raw.get('id')) != str(reference) or raw.get('external_reference') != order.identificador or not meta(order).get('inicio'):
        raise ErrorPago('El pago no corresponde al pedido.', 'PAGO_NO_COINCIDE', 409)
    if raw.get('status') != 'approved':
        raise ErrorPago('Pago aún no autorizado.', 'PAGO_PENDIENTE', 409)
    return approve_locked(order, reference, raw.get('currency_id'), raw.get('transaction_amount'))


def verify_paypal_locked(order, raw, reference):
    fx = order.pago_fx or {}
    try:
        units = raw['purchase_units']; unit = units[0]; captures = unit['payments']['captures']; capture = captures[0]
        if len(units)!=1 or len(captures)!=1 or raw['id']!=reference or fx['paypal_order_id']!=reference or unit['reference_id']!=order.identificador or raw['status']!='COMPLETED' or capture['status']!='COMPLETED':
            raise ValueError()
        return approve_locked(order, capture['id'], capture['amount']['currency_code'], capture['amount']['value'])
    except (KeyError, IndexError, TypeError, ValueError):
        raise ErrorPago('La captura no corresponde al pedido.', 'PAGO_NO_COINCIDE', 409) from None


@transaction.atomic
def confirm_mp(order_pk, adapter, reference):
    order = Pedido.objects.select_for_update().get(pk=order_pk)
    assert_config(order)
    assert_adapter(order,adapter)
    return verify_mp_locked(order, mp_raw(adapter, reference), reference)


@transaction.atomic
def confirm_paypal(order_pk, adapter, reference, capture=False):
    order = Pedido.objects.select_for_update().get(pk=order_pk)
    assert_config(order)
    assert_adapter(order,adapter)
    if (order.pago_fx or {}).get('paypal_order_id') != reference:
        raise ErrorPago('La orden PayPal no corresponde al pedido.', 'PAGO_NO_COINCIDE', 409)
    raw = paypal_raw(adapter, reference)
    if raw.get('status') == 'COMPLETED':
        return verify_paypal_locked(order, raw, reference)
    if capture and raw.get('status') == 'APPROVED' and order.estado == 'pendiente' and deadline(order) and timezone.now() < deadline(order):
        units=raw.get('purchase_units') or []
        if len(units)!=1 or raw.get('id')!=reference or units[0].get('reference_id')!=order.identificador or units[0].get('amount',{}).get('currency_code')!='USD' or not amount_equal(units[0].get('amount',{}).get('value'),order.pago_fx.get('monto_usd')):
            raise ErrorPago('La orden PayPal no coincide con el pedido.','PAGO_NO_COINCIDE',409)
        if (units[0].get('payments') or {}).get('captures'):
            raise ErrorPago('Existe una captura en revisión.','PAGO_PENDIENTE',409)
        token=adapter._get_access_token()
        requests.post(f'{adapter.base_url}/v2/checkout/orders/{quote(reference,safe="")}/capture',headers={'Authorization':f'Bearer {token}','Content-Type':'application/json','PayPal-Request-Id':str(order.clave_checkout)},json={},timeout=25,allow_redirects=False)
        return verify_paypal_locked(order, paypal_raw(adapter, reference), reference)
    raise ErrorPago('Pago PayPal pendiente o en revisión. No hagas otro pago.', 'PAGO_PENDIENTE', 409)


@transaction.atomic
def reconcile(order_pk, consult=True):
    if not Pedido.objects.filter(pk=order_pk, entrega__contains={'origen': MARKER}).exists():
        return None
    return _reconcile_external_locked(order_pk, consult)


@transaction.atomic
def _reconcile_external_locked(order_pk, consult=True):
    order = Pedido.objects.select_for_update().filter(pk=order_pk).first()
    if not order or not is_external(order):
        return None
    if order.estado != 'pendiente':
        return 'omitido'
    limit = deadline(order)
    if not limit or timezone.now() < limit:
        return 'espera'
    if not consult:
        return 'espera'
    from django.utils.dateparse import parse_datetime
    previous=parse_datetime(meta(order).get('ultima_revision',''))
    if previous and timezone.now()-previous<timedelta(minutes=3):return 'espera'
    save_meta(order,ultima_revision=timezone.now().isoformat())
    try:
        data = meta(order)
        if order.medio_pago in ('TUU','Linkify'):
            return 'indeterminado'
        if not data.get('inicio'):
            if (order.pago_fx or {}).get('paypal_order_id'):
                return 'indeterminado'
            from apps.landing.mixed_activity_orders import has_stock_effects
            if has_stock_effects(order):
                return 'indeterminado'
            rows_for(order, True).filter(estado='en_pago').update(estado='liberada')
            order.estado='cancelado'; order.save(update_fields=['estado'])
            return 'cancelado'
        assert_config(order)
        from apps.core.presentation.pagos_externos import _adaptador_mp, _adaptador_paypal
        if order.medio_pago=='MercadoPago':
            adapter=_adaptador_mp(order.tienda)
            payments=adapter.buscar_pagos_por_referencia(order.identificador)
            from apps.catalog.domain.ports.payment_gateway import EstadoPago
            approved=[p for p in payments if p.estado==EstadoPago.APROBADO]
            if len(approved)==1:
                with transaction.atomic():
                    verify_mp_locked(order, mp_raw(adapter,approved[0].id_transaccion),approved[0].id_transaccion)
                return 'pagado'
        elif order.medio_pago=='PayPal':
            adapter=_adaptador_paypal(order.tienda); reference=(order.pago_fx or {}).get('paypal_order_id')
            if reference:
                raw=paypal_raw(adapter,reference)
                if raw.get('status')=='COMPLETED':
                    with transaction.atomic():
                        verify_paypal_locked(order,raw,reference)
                    return 'pagado'
        return 'indeterminado'
    except Exception:
        return 'indeterminado'
