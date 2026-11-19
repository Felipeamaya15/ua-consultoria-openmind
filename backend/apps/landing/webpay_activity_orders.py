"""Webpay for activity-only orders. Reuses the existing merchant adapter.
A started token is never replaced. Unknown provider outcomes retain seats.
No refund API and no card credentials are persisted by this module.
"""
import logging, os
from decimal import Decimal, InvalidOperation
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from apps.core.models import Pedido, ConfiguracionTransbank
from apps.landing.models import ReservaActividadPagada
from apps.catalog.infrastructure.adapters.transbank_adapter import TransbankWebpayAdapter
from apps.catalog.domain.exceptions import (ConfiguracionPagoInvalidaException,
    TransbankTransaccionException, TransbankRechazoException, TransbankServicioNoDisponibleException)
logger=logging.getLogger(__name__)
WEBPAY_MARKER='actividad_webpay_v1'
META='webpay_actividad'
NEW_API_VERSION='1.2'
LEGACY_API_VERSION='1.0'


def is_webpay_activity(order):
    return (order.entrega or {}).get('origen')==WEBPAY_MARKER


def merchant_snapshot(config):
    return {'comercio':str(config.codigo_comercio).strip(), 'ambiente':str(config.ambiente).strip().upper()}


def enabled_config(store_id):
    allowed={x.strip() for x in os.environ.get('PAID_ACTIVITY_WEBPAY_STORES','').split(',') if x.strip()}
    if os.environ.get('PAID_ACTIVITY_WEBPAY_ENABLED')!='1' or str(store_id) not in allowed:
        return None
    if os.environ.get('PAID_ACTIVITY_UNIFIED_QA')=='1' or os.environ.get('PAID_ACTIVITY_TEST_CHECKOUT')=='1':
        return None
    config=ConfiguracionTransbank.objects.filter(id_tienda_id=store_id,activo=True).first()
    if not config or not str(config.codigo_comercio or '').strip() or not str(config.api_key or '').strip(): return None
    ambiente=merchant_snapshot(config)['ambiente']
    if ambiente not in ('INTEGRACION','PRODUCCION'): return None
    if ambiente=='PRODUCCION' and os.environ.get('PAID_ACTIVITY_WEBPAY_ALLOW_LIVE')!='1': return None
    return config


def set_meta(order, **updates):
    order.entrega={**(order.entrega or {}),META:{**((order.entrega or {}).get(META) or {}),**updates}}


def meta(order): return (order.entrega or {}).get(META) or {}


def pending_rows(order):
    return ReservaActividadPagada.objects.filter(tienda_id=order.tienda_id,clave_checkout=order.clave_checkout)


def deadline(order):
    if order.estado!='pendiente': return None
    return pending_rows(order).filter(estado='en_pago').order_by('vence').values_list('vence',flat=True).first()


def assert_start_allowed(order):
    config=enabled_config(order.tienda_id)
    if not config or any(meta(order).get(k)!=v for k,v in merchant_snapshot(config).items()):
        raise ConfiguracionPagoInvalidaException('La configuración de Webpay cambió o no está habilitada. Contacta a la tienda.')
    limit=deadline(order)
    if not limit or timezone.now()>=limit:
        raise ConfiguracionPagoInvalidaException('La reserva ya venció. Consulta tu pedido antes de pagar nuevamente.')
    if order.webpay_token and not order.webpay_url:
        raise ConfiguracionPagoInvalidaException('El pago está en revisión. No se iniciará otro cobro.')
    return config


def api_version(order):
    version=meta(order).get('api_version',LEGACY_API_VERSION)
    if version not in (LEGACY_API_VERSION,NEW_API_VERSION):
        raise TransbankTransaccionException('Versión de Webpay desconocida. Revisa el pedido.')
    return version


def configure_version(adapter, version):
    if version not in (LEGACY_API_VERSION,NEW_API_VERSION):
        raise TransbankTransaccionException('Versión de Webpay desconocida.')
    adapter.base_url=adapter.base_url.replace('/v1.0/transactions',f'/v{version}/transactions').replace('/v1.2/transactions',f'/v{version}/transactions')
    return adapter


def remember_session(order, session_id):
    set_meta(order,sesion=str(session_id),api_version=NEW_API_VERSION)
    order.save(update_fields=['entrega'])


def adapter_for(order):
    config=ConfiguracionTransbank.objects.filter(id_tienda_id=order.tienda_id).first()
    if not config or any(meta(order).get(k)!=v for k,v in merchant_snapshot(config).items()):
        raise TransbankTransaccionException('La configuración comercial cambió. La tienda debe revisar el pago.')
    adapter=TransbankWebpayAdapter(codigo_comercio=config.codigo_comercio,api_key=config.api_key,ambiente=config.ambiente)
    return configure_version(adapter,api_version(order))


def status_raw(adapter, token):
    import requests
    from urllib.parse import quote
    try:
        response=requests.get(f'{adapter.base_url}/{quote(token,safe="")}',headers=adapter._get_headers(),timeout=15)
        if response.status_code!=200: raise ValueError('status')
        raw=response.json()
        if not isinstance(raw,dict): raise ValueError('status')
        return raw
    except (requests.exceptions.RequestException,ValueError,TypeError):
        raise TransbankServicioNoDisponibleException('No fue posible verificar el pago en Webpay. La reserva sigue en revisión.') from None


def normalize_status(raw):
    return {'orden_compra':raw.get('buy_order'),'session_id':raw.get('session_id'),
        'monto':raw.get('amount'),'estado':raw.get('status'),'codigo_autorizacion':raw.get('authorization_code'),
        'tipo_pago':raw.get('payment_type_code'),'fecha_transaccion':raw.get('transaction_date'),
        'vci':raw.get('vci')}


def validate_identity(order,result):
    try: amount=Decimal(str(result.get('monto')))
    except (InvalidOperation,ValueError,TypeError): amount=Decimal('-1')
    if (not amount.is_finite() or amount!=order.monto_total or result.get('orden_compra')!=order.identificador
            or not meta(order).get('sesion') or result.get('session_id')!=meta(order)['sesion']):
        raise TransbankTransaccionException('El pago no coincide con la orden, el monto o la sesión. Contacta a la tienda.')


def notify(order, approved):
    from apps.core.infrastructure.notificaciones_pedido import notificar_cambio_de_estado
    if meta(order).get('ambiente')=='PRODUCCION':
        transaction.on_commit(lambda: notificar_cambio_de_estado(order,'pendiente'))


def approve_locked(order, rows, result):
    validate_identity(order,result)
    if result.get('estado')!='AUTHORIZED' or not result.get('codigo_autorizacion'):
        raise TransbankTransaccionException('La autorización no está confirmada.')
    if order.estado!='pendiente' or not rows or any(r.estado!='en_pago' for r in rows):
        raise TransbankTransaccionException('La inscripción requiere revisión. No repitas el pago.')
    from apps.landing.mixed_activity_orders import physical_lines, validate_total, deduct_locked
    physical=physical_lines(order)
    validate_total(order,rows,physical)
    deduct_locked(order,physical)
    safe={k:result.get(k) for k in ('orden_compra','session_id','codigo_autorizacion','tipo_pago','fecha_transaccion','estado','vci')}
    safe['monto']=int(order.monto_total)
    ReservaActividadPagada.objects.filter(pk__in=[r.pk for r in rows]).update(estado='confirmada')
    order.estado='pagado'; set_meta(order,aprobacion=safe,confirmado_en=timezone.now().isoformat(),
        actividad_iniciada=any(timezone.now()>=r.inicio for r in rows))
    order.save(update_fields=['estado','entrega'])
    notify(order,True)
    return safe


def cancel_locked(order,rows,reason):
    if order.estado!='pendiente' or not rows or any(r.estado!='en_pago' for r in rows): return 'omitido'
    from apps.landing.mixed_activity_orders import has_stock_effects
    if has_stock_effects(order):
        set_meta(order,motivo='inventario_aplicado_requiere_revision',revision_en=timezone.now().isoformat())
        order.save(update_fields=['entrega'])
        return 'indeterminado'
    ReservaActividadPagada.objects.filter(pk__in=[r.pk for r in rows]).update(estado='liberada')
    order.estado='cancelado';set_meta(order,motivo=reason,cancelado_en=timezone.now().isoformat())
    order.save(update_fields=['estado','entrega']);notify(order,False)
    return 'cancelado'


@transaction.atomic
def process_order(order_id, *, callback_token=None, consult=True):
    order=Pedido.objects.select_for_update().filter(pk=order_id).first()
    if not order or not is_webpay_activity(order): return 'omitido',None
    if callback_token is not None and order.webpay_token!=callback_token:
        raise TransbankTransaccionException('El token no corresponde al pedido.')
    if order.estado in Pedido.ESTADOS_PAGADOS:
        return 'pagado',meta(order).get('aprobacion')
    if order.estado!='pendiente': return 'omitido',None
    rows=list(pending_rows(order).select_for_update().order_by('pk'))
    if not rows or any(r.estado!='en_pago' for r in rows): return 'indeterminado',None
    due=timezone.now()>=min(r.vence for r in rows)
    if not callback_token and not due: return 'espera',None
    if not order.webpay_token:
        return (cancel_locked(order,rows,'reserva_sin_inicio') if due else 'espera'),None
    if not consult: return 'espera',None
    if not callback_token:
        last=meta(order).get('revision_en')
        if last:
            from django.utils.dateparse import parse_datetime
            previous=parse_datetime(last)
            if previous and timezone.now()-previous<timedelta(minutes=3): return 'espera',None
    adapter=adapter_for(order)
    raw=status_raw(adapter,order.webpay_token)
    result=normalize_status(raw);validate_identity(order,result)
    status=result['estado']
    if status=='AUTHORIZED' and raw.get('response_code')==0:
        return 'pagado',approve_locked(order,rows,result)
    if status in ('FAILED','REVERSED','NULLIFIED'):
        return cancel_locked(order,rows,status),None
    if status=='INITIALIZED' and callback_token:
        if any(timezone.now()>=r.inicio for r in rows): return 'espera',None
        approved=adapter.confirmar_transaccion(token_ws=order.webpay_token)
        return 'pagado',approve_locked(order,rows,approved)
    set_meta(order,revision_en=timezone.now().isoformat(),ultimo_estado=str(status or 'desconocido'))
    order.save(update_fields=['entrega'])
    return 'espera',None


def confirm_if_activity(store_id,token):
    order=Pedido.objects.filter(tienda_id=store_id,webpay_token=token,entrega__contains={'origen':WEBPAY_MARKER}).first()
    if not order:return None
    result,approval=process_order(order.pk,callback_token=token)
    if result=='pagado' and approval:return approval
    if result=='cancelado':raise TransbankRechazoException('El pago fue rechazado o reversado. No se confirmó la inscripción.')
    raise TransbankTransaccionException('El pago sigue en revisión. No hagas otro pago; consulta tu pedido.')


def reconcile_expired(order_id,consult):
    if not Pedido.objects.filter(pk=order_id,entrega__contains={'origen':WEBPAY_MARKER}).exists():return None
    try:return process_order(order_id,consult=consult)[0]
    except Exception:
        logger.warning('Pago Webpay de actividad en revisión: pedido %s.',order_id)
        return 'indeterminado'
