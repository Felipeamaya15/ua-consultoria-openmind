"""Merchant-authorized activity line refunds, with persisted operation before POST.
Only provider-confirmed refunds release seats. Unknown outcomes are never retried blindly.
"""
import os
from decimal import Decimal, ROUND_HALF_UP
from uuid import uuid4
from urllib.parse import quote

import requests
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from apps.core.models import Pedido, Tienda
from apps.landing.external_activity_orders import is_external, meta, assert_config, amount_equal, rows_for, mp_raw, paypal_raw, assert_adapter
from apps.landing.transfer_activity_orders import records, LEDGER, full_amount
from apps.landing.mixed_activity_orders import physical_lines, validate_total

REVIEW='reembolso_externo_revision'
DONE='reembolsada_externa'


def enabled(order):
    return is_external(order) and order.medio_pago in ('MercadoPago','PayPal') and os.environ.get('PAID_ACTIVITY_EXTERNAL_REFUNDS_ENABLED')=='1' and (meta(order).get('ambiente')=='SANDBOX' or os.environ.get('PAID_ACTIVITY_EXTERNAL_ALLOW_LIVE')=='1')


def amount_for(order, current, row):
    clp=Decimal(full_amount(row))
    prior=[v for v in current.values() if v.get('estado')==DONE]
    if order.medio_pago=='MercadoPago': return clp, 'CLP'
    total=Decimal(order.monto_total); usd=Decimal((order.pago_fx or {})['monto_usd'])
    previous_clp=sum((Decimal(v['monto']) for v in prior),Decimal(0))
    previous_usd=sum((Decimal(v['monto_pasarela']) for v in prior),Decimal(0))
    # Cumulative allocation absorbs rounding only on the final line; never use today's FX.
    target=((previous_clp+clp)*usd/total).quantize(Decimal('.01'),rounding=ROUND_HALF_UP)
    return target-previous_usd, 'USD'


def gateway(order):
    assert_config(order)
    from apps.core.presentation.pagos_externos import _adaptador_mp,_adaptador_paypal
    adapter=_adaptador_mp(order.tienda) if order.medio_pago=='MercadoPago' else _adaptador_paypal(order.tienda)
    if not adapter: raise ValidationError('Configuración de pago no disponible.')
    assert_adapter(order,adapter)
    return adapter


def provider_refunds(order, adapter):
    """Check original payment and list of refunds, before new financial operation."""
    ref=meta(order).get('referencia_pago')
    if order.medio_pago=='MercadoPago':
        raw=mp_raw(adapter,ref)
        if str(raw.get('id'))!=str(ref) or raw.get('external_reference')!=order.identificador or raw.get('currency_id')!='CLP' or not amount_equal(raw.get('transaction_amount'),order.monto_total) or raw.get('status') not in ('approved','refunded'):
            raise ValidationError('El pago original requiere revisión.')
        response=requests.get(f'{adapter.BASE_URL}/v1/payments/{quote(str(ref),safe="")}/refunds',headers=adapter._headers(),timeout=20,allow_redirects=False)
        if response.status_code!=200:raise ValidationError('No se pudo verificar el historial de devoluciones.')
        items=response.json()
        if not isinstance(items,list):raise ValidationError('Historial de devoluciones inválido.')
        return items
    fx=order.pago_fx or {}; raw=paypal_raw(adapter,fx['paypal_order_id'])
    units=raw.get('purchase_units') or []
    if len(units)!=1 or raw.get('id')!=fx['paypal_order_id'] or units[0].get('reference_id')!=order.identificador: raise ValidationError('La orden original requiere revisión.')
    payments=units[0].get('payments') or {}; captures=payments.get('captures') or []
    if len(captures)!=1 or captures[0].get('id')!=ref or captures[0].get('status') not in ('COMPLETED','PARTIALLY_REFUNDED','REFUNDED') or captures[0].get('amount',{}).get('currency_code')!='USD' or not amount_equal(captures[0].get('amount',{}).get('value'),fx['monto_usd']): raise ValidationError('La captura original requiere revisión.')
    refunds=payments.get('refunds',[])
    if not isinstance(refunds,list):raise ValidationError('El historial de devoluciones no está disponible.')
    if captures[0].get('status')!='COMPLETED' and not refunds:raise ValidationError('Existe una devolución no conciliada.')
    return refunds


def save(order, current):
    order.entrega={**(order.entrega or {}),LEDGER:current};order.save(update_fields=['entrega'])


def locked(store, order_id, row_id):
    Tienda.objects.select_for_update().get(pk=store.pk)
    order=Pedido.objects.select_for_update().filter(pk=order_id,tienda=store).first()
    if not order or not is_external(order) or order.medio_pago not in ('MercadoPago','PayPal'):raise ValidationError('Pedido no disponible.')
    rows=list(rows_for(order,True)); row=next((x for x in rows if x.pk==row_id),None)
    if not row:raise ValidationError('Inscripción no encontrada.')
    return order,rows,row


def request_refund(order, adapter, operation):
    ref=quote(str(meta(order)['referencia_pago']),safe=''); key=operation['operacion']; value=operation['monto_pasarela']
    if order.medio_pago=='MercadoPago':
        headers={**adapter._headers(),'X-Idempotency-Key':key}
        url=f'{adapter.BASE_URL}/v1/payments/{ref}/refunds'; body={} if Decimal(value)==order.monto_total else {'amount':int(Decimal(value))}
    else:
        headers={'Authorization':f'Bearer {adapter._get_access_token()}','Content-Type':'application/json','PayPal-Request-Id':key,'Prefer':'return=representation'}
        url=f'{adapter.base_url}/v2/payments/captures/{ref}/refund';body={'custom_id':key}
        if Decimal(value)!=Decimal(order.pago_fx['monto_usd']):body['amount']={'value':value,'currency_code':'USD'}
    response=requests.post(url,headers=headers,json=body,timeout=25,allow_redirects=False)
    if response.status_code not in (200,201): raise ValidationError('La pasarela no confirmó la devolución. Revisa el portal antes de continuar.')
    result=response.json()
    if not isinstance(result,dict) or not result.get('id'): raise ValidationError('Respuesta de devolución incompleta.')
    return result


def verify_result(order, operation, result):
    if str(result.get('id',''))!=str(operation.get('refund_id','')) or not result.get('id'): return False
    if order.medio_pago=='MercadoPago':
        return str(result.get('payment_id'))==str(meta(order)['referencia_pago']) and result.get('status')=='approved' and amount_equal(result.get('amount'),operation['monto_pasarela'])
    value=result.get('amount') or {}
    return result.get('custom_id')==operation['operacion'] and result.get('status')=='COMPLETED' and value.get('currency_code')=='USD' and amount_equal(value.get('value'),operation['monto_pasarela'])


def change_external_refund(store,order_id,row_id,actor,action,reason,owner):
    if not owner:raise PermissionDenied('Solo la tienda puede gestionar devoluciones.')
    if action not in ('reembolsar_externo','consultar_reembolso_externo'):raise ValidationError('Acción no disponible.')
    key=str(row_id)
    # Persist BEFORE any financial POST. Durable prohibits accidental enclosing transactions.
    with transaction.atomic(durable=True):
        order,rows,row=locked(store,order_id,row_id); current=records(order); old=current.get(key) or {}
        if old.get('estado')==DONE:return order,row
        consult=action=='consultar_reembolso_externo'
        if consult:
            if old.get('estado')!=REVIEW:raise ValidationError('No hay una devolución en revisión.')
            operation=old
        else:
            if not enabled(order):raise ValidationError('La devolución automática no está habilitada.')
            if not reason or old.get('estado')!='autorizada' or row.estado!='confirmada' or order.estado not in Pedido.ESTADOS_PAGADOS:raise ValidationError('Primero autoriza una inscripción pagada.')
            if any(v.get('estado') in (REVIEW,'reembolso_en_revision','reembolsada_manual') for v in current.values()):raise ValidationError('Existe una devolución manual o incierta. Debe conciliarse antes de otra operación automática.')
            physical=physical_lines(order);validate_total(order,rows,physical)
            if physical and not order.stock_descontado:raise ValidationError('El inventario requiere revisión.')
            adapter=gateway(order); refunds=provider_refunds(order,adapter)
            known={str(v['refund_id']) for v in current.values() if v.get('estado')==DONE}
            if {str(r.get('id')) for r in refunds}!=known:raise ValidationError('Hay devoluciones externas no registradas. Revisa el portal.')
            for previous in current.values():
                if previous.get('estado')==DONE and not any(verify_result(order,previous,r) for r in refunds):raise ValidationError('Una devolución anterior requiere conciliación.')
            amount,currency=amount_for(order,current,row)
            if amount<=0 or (currency=='CLP' and amount!=amount.to_integral_value()):raise ValidationError('El monto requiere revisión.')
            operation={**old,'estado':REVIEW,'operacion':str(uuid4()),'monto_pasarela':str(amount),'moneda':currency,'motivo':reason,'responsable':str(actor.pk),'inicio_operacion':timezone.now().isoformat()}
            current[key]=operation;save(order,current)
    # No second POST for the same line, even after a lost response. Consult only.
    if not consult:
        try:
            result=request_refund(order,gateway(order),operation)
        except Exception:
            raise ValidationError('La devolución quedó en revisión. No repitas ni devuelvas manualmente hasta conciliarla.') from None
        with transaction.atomic():
            order,rows,row=locked(store,order_id,row_id);current=records(order); operation=current[key]
            operation={**operation,'refund_id':str(result['id'])};current[key]=operation;save(order,current)
    else:
        try:
            refunds=provider_refunds(order,gateway(order))
            candidates=[r for r in refunds if (operation.get('refund_id') and str(r.get('id'))==operation['refund_id']) or (order.medio_pago=='PayPal' and r.get('custom_id')==operation['operacion'])]
            if len(candidates)!=1:raise ValueError()
            result=candidates[0]
        except Exception:raise ValidationError('No se identificó la devolución con certeza. Conserva el pedido en revisión.') from None
    with transaction.atomic():
        order,rows,row=locked(store,order_id,row_id); current=records(order); operation=current[key]
        if operation.get('estado')==DONE:return order,row
        if not operation.get('refund_id') and order.medio_pago=='PayPal' and result.get('custom_id')==operation['operacion']:
            operation={**operation,'refund_id':str(result.get('id',''))}
        if not verify_result(order,operation,result):raise ValidationError('La devolución aún no está confirmada. No repitas la operación.')
        current[key]={**operation,'estado':DONE,'resuelto_en':timezone.now().isoformat()};save(order,current)
        row.estado='liberada';row.save(update_fields=['estado'])
        if not physical_lines(order) and all(r.pk==row.pk or r.estado=='liberada' for r in rows):
            order.estado='cancelado';order.save(update_fields=['estado'])
        return order,row
