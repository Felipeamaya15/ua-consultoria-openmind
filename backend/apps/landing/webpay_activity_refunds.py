"""Total or partial Webpay refunds, one complete activity line at a time. Never retry a refund POST automatically."""
import logging, os
from decimal import Decimal, InvalidOperation
from urllib.parse import quote
import requests
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError, PermissionDenied
from apps.core.models import Pedido, Tienda
from apps.landing.models import ReservaActividadPagada
from apps.landing.webpay_activity_orders import WEBPAY_MARKER, meta, adapter_for, status_raw, normalize_status, validate_identity

logger=logging.getLogger(__name__)
PROCESSING='reembolso_en_revision'
DONE='reembolsada_webpay'

def _number(value):
    try:
        n=Decimal(str(value))
        return n if n.is_finite() else None
    except (InvalidOperation,ValueError,TypeError): return None

def is_full_refund(raw, amount):
    # Reversal has no code or authorization fields; only valid for full amount.
    if not isinstance(raw,dict): return False
    if raw.get('type')=='REVERSED': return True
    return (raw.get('type')=='NULLIFIED' and raw.get('response_code')==0
        and _number(raw.get('nullified_amount'))==amount and _number(raw.get('balance'))==0
        and bool(raw.get('authorization_code')))

def line_amount(row):
    return Decimal(row.precio_unitario)*row.cantidad


def _balance_before(order, ledger):
    # Refunds recorded manually may have been processed outside Webpay; do not infer their provider balance.
    if any((v or {}).get('estado')=='reembolsada_manual' for v in ledger.values()):
        raise ValidationError('Existe una devolución manual. Concilia las siguientes devoluciones en el portal del comercio.')
    refunded=Decimal(0)
    for record in ledger.values():
        if record.get('estado')==DONE:
            amount=_number(record.get('monto'))
            if amount is None or amount<=0: raise ValidationError('Registro de devolución inconsistente.')
            refunded+=amount
    balance=order.monto_total-refunded
    if balance<0: raise ValidationError('Saldo de devolución inconsistente.')
    return balance


def _expected(order,row,record):
    # Backward compatibility for an in-flight full refund created before this change.
    amount=_number(record.get('monto'))
    before=_number(record.get('saldo_anterior',order.monto_total))
    if amount!=line_amount(row) or before is None or not (0<amount<=before<=order.monto_total):
        raise ValidationError('Registro de devolución inconsistente.')
    return amount,before,before-amount


def is_confirmed_refund(raw,amount,before,total):
    if not isinstance(raw,dict): return False
    if raw.get('type')=='REVERSED': return amount==before==total
    return (raw.get('type')=='NULLIFIED' and raw.get('response_code')==0
        and _number(raw.get('nullified_amount'))==amount and _number(raw.get('balance'))==before-amount
        and bool(raw.get('authorization_code')))


def _confirmed_status(order,raw,amount,before,after):
    validate_identity(order,normalize_status(raw))
    status=raw.get('status')
    if status=='REVERSED': return amount==before==order.monto_total and after==0
    return (status==('NULLIFIED' if after==0 else 'PARTIALLY_NULLIFIED') and _number(raw.get('balance'))==after)


def _scope(store,order_id,reservation_id):
    Tienda.objects.select_for_update().get(pk=store.pk)
    order=Pedido.objects.select_for_update().filter(pk=order_id,tienda=store,medio_pago='Transbank',entrega__contains={'origen':WEBPAY_MARKER}).first()
    if not order or not order.clave_checkout or not order.webpay_token:
        raise ValidationError('No encontramos una transacción Webpay de actividades.')
    rows=list(ReservaActividadPagada.objects.select_for_update().filter(tienda=store,clave_checkout=order.clave_checkout).order_by('pk'))
    row=next((r for r in rows if r.pk==reservation_id),None)
    if row is None: raise ValidationError('Inscripción no encontrada.')
    from apps.landing.mixed_activity_orders import physical_lines, physical_total
    physical=physical_lines(order)
    if (order.descuento or (physical and not order.stock_descontado)
        or (not physical and order.costo_envio)
        or sum((line_amount(r) for r in rows),Decimal(0))+physical_total(physical)+order.costo_envio!=order.monto_total
        or line_amount(row)<=0 or line_amount(row)!=line_amount(row).to_integral_value()
        or order.monto_total!=order.monto_total.to_integral_value()):
        raise ValidationError('El pedido no corresponde a actividades sin descuentos o el inventario requiere revisión.')
    from apps.landing.transfer_activity_orders import records
    return order,row,records(order)

def _write(order,ledger):
    from apps.landing.transfer_activity_orders import LEDGER
    order.entrega={**(order.entrega or {}),LEDGER:ledger}
    order.save(update_fields=['entrega'])

def _finish(store,order_id,reservation_id,actor,proof):
    with transaction.atomic(durable=True):
        order,row,ledger=_scope(store,order_id,reservation_id)
        key=str(row.pk); old=ledger.get(key) or {}
        if old.get('estado')==DONE: return order,row
        if old.get('estado')!=PROCESSING or order.estado not in Pedido.ESTADOS_PAGADOS or row.estado!='confirmada':
            raise ValidationError('La devolución requiere revisión; no se realizará otro cargo o abono.')
        ledger[key]={**old,'estado':DONE,'resuelto_en':timezone.now().isoformat(),
            'responsable':str(actor.pk),'resultado_pasarela':proof}
        amount,before,after=_expected(order,row,old)
        ledger[key]['saldo_posterior']=int(after)
        _write(order,ledger)
        row.estado='liberada';row.save(update_fields=['estado'])
        if after==0 and not order.itempedido_set.exclude(producto_mongo_id='').exists() and not ReservaActividadPagada.objects.filter(tienda=store,clave_checkout=order.clave_checkout).exclude(estado='liberada').exists():
            order.estado='cancelado';order.save(update_fields=['estado'])
        return order,row

def _request_refund(adapter,order,amount=None):
    # The public Webpay Plus API uses v1.2 /transactions/{token}/refunds.
    # Keep the merchant credentials and host of the original transaction.
    base=adapter.base_url.replace('/v1.0/transactions','/v1.2/transactions')
    response=requests.post(f'{base}/{quote(order.webpay_token,safe="")}/refunds',
        headers=adapter._get_headers(),json={'amount':int(order.monto_total if amount is None else amount)},timeout=20,allow_redirects=False)
    if response.status_code!=200: raise ValueError('refund HTTP')
    return response.json()

def refund_status(adapter,token):
    from copy import copy
    current=copy(adapter)
    current.base_url=adapter.base_url.replace('/v1.0/transactions','/v1.2/transactions')
    return status_raw(current,token)

def change_webpay_refund(store,order_id,reservation_id,actor,action,reason,owner):
    if not owner: raise PermissionDenied('Solo el propietario autorizado puede realizar devoluciones.')
    if action not in ('reembolsar_webpay','consultar_reembolso_webpay'): raise ValidationError('Acción inválida.')
    key=str(reservation_id)
    with transaction.atomic(durable=True):
        order,row,ledger=_scope(store,order_id,reservation_id)
        old=ledger.get(key) or {}
        if old.get('estado')==DONE: return order,row
        if order.estado not in Pedido.ESTADOS_PAGADOS or row.estado!='confirmada' or not meta(order).get('aprobacion'):
            raise ValidationError('Solo se puede devolver un pago validado por Webpay.')
        if action=='reembolsar_webpay':
            if any(v.get('estado')==PROCESSING for k,v in ledger.items() if k!=key):
                raise ValidationError('Hay otra devolución de este pedido en revisión. Resuélvela primero.')
            if old.get('estado')==PROCESSING:
                raise ValidationError('Ya existe una devolución en revisión. Consulta el estado; no repitas la operación.')
            if old.get('estado')!='autorizada' or not reason.strip():
                raise ValidationError('Autoriza la devolución e indica el motivo antes de ejecutarla.')
            if meta(order).get('ambiente')=='PRODUCCION' and os.environ.get('PAID_ACTIVITY_WEBPAY_ALLOW_LIVE')!='1':
                raise ValidationError('La operación comercial no está habilitada.')
            if meta(order).get('ambiente') not in ('INTEGRACION','PRODUCCION'):
                raise ValidationError('Entorno comercial inválido.')
            amount=line_amount(row); before=_balance_before(order,ledger)
            if amount>before or _number(old.get('monto'))!=amount:
                raise ValidationError('El monto autorizado supera el saldo o no corresponde a la inscripción.')
            # Check status before reserving the only possible POST. No second attempt even if a timeout occurs.
            try:
                adapter=adapter_for(order)
                raw=refund_status(adapter,order.webpay_token)
                validate_identity(order,normalize_status(raw))
                expected_status='AUTHORIZED' if before==order.monto_total else 'PARTIALLY_NULLIFIED'
                if raw.get('status')!=expected_status or raw.get('response_code')!=0:
                    raise ValueError('status')
                if raw.get('balance') is not None:
                    if _number(raw['balance'])!=before: raise ValueError('balance')
                elif before!=order.monto_total: raise ValueError('missing balance')
            except Exception:
                raise ValidationError('Webpay no confirmó que la venta completa esté disponible para devolución. Revisa en el portal del comercio.') from None
            ledger[key]={**old,'estado':PROCESSING,'motivo':reason,'monto':int(amount),'saldo_anterior':int(before),
                'intento_en':timezone.now().isoformat(),'responsable':str(actor.pk)}
            _write(order,ledger)
        elif old.get('estado')!=PROCESSING:
            raise ValidationError('No existe una devolución automática en revisión.')
        else:
            amount,before,_=_expected(order,row,old)
    # The durable marker is committed BEFORE the network call. A crash or ambiguous response can only be reconciled by GET.
    try:
        adapter=adapter_for(order)
        if action=='reembolsar_webpay':
            raw=_request_refund(adapter,order,amount)
            if not is_confirmed_refund(raw,amount,before,order.monto_total): raise ValueError('refund not confirmed')
            proof={'tipo':raw.get('type'),'autorizacion':str(raw.get('authorization_code') or '')[:32]}
        else:
            raw=refund_status(adapter,order.webpay_token)
            if not _confirmed_status(order,raw,amount,before,before-amount): raise ValueError('refund not confirmed')
            proof={'tipo':raw.get('status'),'origen':'consulta_estado'}
        return _finish(store,order_id,reservation_id,actor,proof)
    except Exception:
        # Never log card data, token or raw response; preserve the durable processing state.
        logger.warning('Reembolso de actividad en revisión: pedido %s.',order_id)
        raise ValidationError('El reembolso no pudo confirmarse. Los cupos siguen reservados. Consulta su estado o revisa en el portal; NO vuelvas a devolver dinero.') from None
