"""Commercial payment and manual refund management. Separate order marker; no gateway debit/refund calls."""
import os
from decimal import Decimal
from datetime import timedelta
from django.db import transaction
from django.core.validators import validate_email
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.presentation.responses import success_response
from apps.core.models import Pedido, Tienda
from apps.landing.models import ReservaActividadPagada
from apps.landing.unified_activity_orders import MARKER, qa_enabled, require_qa

from apps.landing.webpay_activity_orders import WEBPAY_MARKER, enabled_config

TRANSFER_MARKER='actividad_transferencia_v1'
from apps.landing.external_activity_orders import MARKER as EXTERNAL_MARKER, allowed_methods
REAL_MARKERS=(TRANSFER_MARKER,WEBPAY_MARKER,EXTERNAL_MARKER)
LEDGER='devoluciones_actividades_transferencia'

def is_transfer_activity(order):
    return (order.entrega or {}).get('origen') in REAL_MARKERS

def contact_email(store):
    email=str(getattr(store,'correo_negocio','') or '').strip()
    try: validate_email(email)
    except DjangoValidationError: return ''
    return email

def checkout_mode(request,store):
    if qa_enabled(request): return 'qa'
    if os.environ.get('PAID_ACTIVITY_UNIFIED_QA')=='1' or os.environ.get('PAID_ACTIVITY_TEST_CHECKOUT')=='1': return 'disabled'
    if not contact_email(store): return 'disabled'
    webpay=bool(enabled_config(store.pk))
    transfer=os.environ.get('PAID_ACTIVITY_TRANSFER_ENABLED')=='1'
    if allowed_methods(store): return 'commercial'
    if webpay and transfer: return 'both'
    if webpay: return 'webpay'
    if transfer: return 'transfer'
    return 'disabled'

def validate_activity_checkout(request,store,data):
    mode=checkout_mode(request,store)
    if mode=='qa':
        require_qa(request,data)
        return MARKER
    if mode not in ('transfer','webpay','both','commercial'): raise PermissionDenied('La venta de actividades no está disponible en esta tienda.')
    if data['medio_pago'] not in commercial_methods(store, bool(data['items'])): raise ValidationError('Selecciona un medio de pago habilitado para las actividades.')
    if data['items']:
        from apps.landing.mixed_activity_orders import mixed_enabled
        if not mixed_enabled() or (data['medio_pago']=='Transferencia' and os.environ.get('PAID_ACTIVITY_MIXED_TRANSFER_ENABLED')!='1'):
            raise ValidationError('Las compras mixtas no están habilitadas para este medio de pago.')
    if data['codigo_promocional']: raise ValidationError('Los descuentos de actividades todavía no están habilitados.')
    if data['contacto']['email'].lower().endswith(('@example.com','@example.org','@example.net')):
        raise ValidationError('Ingresa un correo real para recibir información de tu inscripción.')
    return {'Transbank':WEBPAY_MARKER,'Transferencia':TRANSFER_MARKER}.get(data['medio_pago'],EXTERNAL_MARKER)

def commercial_methods(store,mixed=False):
    methods=allowed_methods(store)
    if enabled_config(store.pk): methods.append('Transbank')
    if os.environ.get('PAID_ACTIVITY_TRANSFER_ENABLED')=='1': methods.append('Transferencia')
    if mixed:
        from apps.landing.mixed_activity_orders import mixed_enabled
        if not mixed_enabled(): return []
        if os.environ.get('PAID_ACTIVITY_MIXED_TRANSFER_ENABLED')!='1': methods=[m for m in methods if m!='Transferencia']
    return methods

class ActivityCheckoutModeView(APIView):
    authentication_classes=[]
    permission_classes=[AllowAny]
    def get(self,request):
        store=resolver_tienda(request)
        mode=checkout_mode(request,store)
        mixed=request.query_params.get('mixta')=='1'
        methods=['Transferencia'] if mode=='qa' else commercial_methods(store,mixed) if mode!='disabled' else []
        if mode!='qa':
            mode='disabled' if not methods else 'webpay' if methods==['Transbank'] else 'transfer' if methods==['Transferencia'] else 'both' if set(methods)=={'Transbank','Transferencia'} else 'commercial'
        result=success_response(data={'modo':mode,'medios_pago':methods,'correo_tienda':contact_email(store)})
        result['Cache-Control']='no-store'
        return result

def records(order):
    return dict((order.entrega or {}).get(LEDGER) or {})

def full_amount(row):
    return int(row.precio_unitario)*row.cantidad

def policy_terms(row):
    terms=(row.condiciones or {}).get('venta') or {}
    hours=int(terms.get('cancelacion_horas',48))
    return terms.get('cancelacion','evaluacion'),hours

def state(order,row):
    mode,hours=policy_terms(row)
    record=records(order).get(str(row.pk)) or {}
    return {'devolucion':{k:v for k,v in record.items() if k in ('estado','motivo','monto','fecha','resuelto_en')},
            'plazo_vigente':timezone.now()<=row.inicio-timedelta(hours=hours),
            'politica':mode,'horas':hours,
            'puede_solicitar':row.estado=='confirmada' and order.estado in Pedido.ESTADOS_PAGADOS and not record}

@transaction.atomic
def change_transfer(store,order_id,reservation_id,actor,action,reason='',reference='',owner=False):
    Tienda.objects.select_for_update().get(pk=store.pk)
    from django.db.models import Q
    real=Q(entrega__origen__in=REAL_MARKERS)
    orders=Pedido.objects.select_for_update().filter(real,tienda=store)
    if not owner: orders=orders.filter(comprador=actor)
    order=orders.filter(pk=order_id).first()
    if not order: raise ValidationError('Pedido no encontrado.')
    rows=list(ReservaActividadPagada.objects.select_for_update().filter(tienda=store,clave_checkout=order.clave_checkout).order_by('pk'))
    row=next((r for r in rows if r.pk==reservation_id),None)
    if row is None: raise ValidationError('Inscripción no encontrada.')
    webpay=(order.entrega or {}).get('origen')==WEBPAY_MARKER
    external=(order.entrega or {}).get('origen')==EXTERNAL_MARKER
    if (not external and order.medio_pago!=('Transbank' if webpay else 'Transferencia')) or order.descuento:
        raise ValidationError('El pedido no corresponde a una venta de actividades sin descuentos.')
    from apps.landing.mixed_activity_orders import physical_lines, validate_total
    physical=physical_lines(order)
    if physical and order.estado in Pedido.ESTADOS_PAGADOS and not order.stock_descontado:
        raise ValidationError('El pedido mixto debe tener el inventario confirmado antes de gestionar devoluciones.')
    if physical:
        try: validate_total(order,rows,physical)
        except Exception: raise ValidationError('El total del pedido requiere revisión.') from None
    elif order.costo_envio: raise ValidationError('El despacho no corresponde a las actividades.')
    if not owner and action!='solicitar': raise PermissionDenied('Solo la tienda puede resolver una devolución o transferencia.')
    if owner and action=='solicitar': raise ValidationError('Usa las acciones de gestión.')
    reference=reference.strip().upper()
    if action in ('registrar_pago','rechazar_pago','registrar_devolucion','cerrar_pago_externo') and (not reference or not reason):
        raise ValidationError('Indica el motivo y una referencia de la revisión bancaria.')
    if action=='cerrar_pago_externo':
        if not external or not owner or order.estado!='pendiente' or not rows or any(r.estado!='en_pago' for r in rows) or timezone.now()<min(r.vence for r in rows):
            raise ValidationError('Solo se puede cerrar un pedido externo vencido y revisado.')
        from apps.landing.mixed_activity_orders import has_stock_effects
        from apps.landing.external_activity_orders import meta as external_meta
        try:
            if has_stock_effects(order) or external_meta(order).get('referencia_pago'):raise ValueError()
        except Exception:raise ValidationError('Hay efectos de inventario o pago; se requiere revisión especializada.') from None
        if Pedido.objects.filter(tienda=store,entrega__contains={'cierre_pago_externo':{'referencia':reference}}).exclude(pk=order.pk).exists():raise ValidationError('La referencia de cierre ya está registrada.')
        ReservaActividadPagada.objects.filter(pk__in=[r.pk for r in rows]).update(estado='liberada')
        order.estado='cancelado';order.entrega={**(order.entrega or {}),'cierre_pago_externo':{'referencia':reference,'motivo':reason,'fecha':timezone.now().isoformat(),'responsable':str(actor.pk)}}
        order.save(update_fields=['estado','entrega']);row.refresh_from_db()
        return order,row
    if action in ('registrar_pago','rechazar_pago'):
        if (webpay or external) and action=='registrar_pago': raise ValidationError('El pago se verifica con la pasarela, no se aprueba manualmente.')
        if webpay: raise ValidationError('El pago Webpay requiere conciliación con la pasarela.')
        if external: raise ValidationError('Los pagos externos inciertos necesitan conciliación con el proveedor.')
        expected='pagado' if action=='registrar_pago' else 'cancelado'
        previous=(order.entrega or {}).get('revision_transferencia_actividad') or {}
        if order.estado==expected and previous.get('accion')==action: return order,row
        if order.estado!='pendiente' or any(r.estado!='en_pago' for r in rows):
            raise ValidationError('Este pedido ya fue resuelto o no tiene reservas pendientes.')
        if action=='registrar_pago':
            if any(timezone.now()>=r.inicio for r in rows):
                raise ValidationError('La actividad ya comenzó. Revisa y devuelve el dinero fuera del sistema antes de liberar los cupos.')
            if Pedido.objects.filter(tienda=store,entrega__contains={'revision_transferencia_actividad':{'accion':'registrar_pago','referencia':reference}}).exclude(pk=order.pk).exists():
                raise ValidationError('Esta referencia de pago ya se utilizó en otro pedido.')
        if physical:
            from apps.landing.mixed_activity_orders import deduct_locked, has_stock_effects
            try:
                if expected=='pagado': deduct_locked(order,physical)
                elif has_stock_effects(order): raise ValueError()
            except Exception: raise ValidationError('Inventario en revisión; no repitas el pago.') from None
        ReservaActividadPagada.objects.filter(pk__in=[r.pk for r in rows]).update(estado='confirmada' if expected=='pagado' else 'liberada')
        order.estado=expected
        order.entrega={**(order.entrega or {}),'revision_transferencia_actividad':{'accion':action,'referencia':reference,'motivo':reason,'fecha':timezone.now().isoformat(),'responsable':str(actor.pk)}}
        order.save(update_fields=['estado','entrega'])
        row.refresh_from_db()
        from apps.core.infrastructure.notificaciones_pedido import notificar_cambio_de_estado, notificar_pago_rechazado
        if expected=='pagado': transaction.on_commit(lambda: notificar_cambio_de_estado(order,'pendiente'))
        else: transaction.on_commit(lambda: notificar_pago_rechazado(order))
        if expected=='pagado':
            from apps.landing.activity_owner_notifications import programar_aviso_inscripcion
            programar_aviso_inscripcion(order.pk)
        return order,row
    current=records(order); key=str(row.pk); old=current.get(key) or {}
    if action=='registrar_devolucion' and any(v.get('estado') in ('reembolso_en_revision','reembolso_externo_revision') for v in current.values()):
        raise ValidationError('Hay una devolución en revisión. No registres ni realices otra devolución hasta resolverla.')
    if old.get('estado') in ('reembolso_en_revision','reembolsada_webpay','reembolsada_externa','reembolso_externo_revision'):
        raise ValidationError('La devolución ya está en revisión o confirmada. No registres otra devolución.')
    if old.get('estado')=='reembolsada_manual':
        if owner and action=='registrar_devolucion': return order,row
        raise ValidationError('La devolución ya fue registrada.')
    if action=='solicitar' and old.get('estado')=='solicitada': return order,row
    if action=='autorizar_devolucion' and old.get('estado')=='autorizada': return order,row
    if action=='rechazar' and old.get('estado')=='rechazada': return order,row
    if order.estado not in Pedido.ESTADOS_PAGADOS or row.estado!='confirmada': raise ValidationError('La inscripción no está pagada y confirmada.')
    if not reason: raise ValidationError('Indica el motivo.')
    stamp=timezone.now().isoformat()
    if action=='solicitar':
        if old: raise ValidationError('La solicitud ya está en gestión. Contacta a la tienda.')
        mode,hours=policy_terms(row)
        current[key]={'estado':'solicitada','motivo':reason,'monto':full_amount(row),'fecha':stamp,'solicitante':str(actor.pk),
                      'evaluacion':'anticipada_en_plazo' if mode=='anticipada' and timezone.now()<=row.inicio-timedelta(hours=hours) else 'revision_individual'}
    elif action=='rechazar':
        if old.get('estado')!='solicitada': raise ValidationError('Solo se rechaza una solicitud pendiente de revisión.')
        current[key]={**old,'estado':'rechazada','motivo':reason,'resuelto_en':stamp,'responsable':str(actor.pk)}
    elif action=='autorizar_devolucion':
        if old.get('estado') not in (None,'solicitada','rechazada'): raise ValidationError('La devolución ya está en gestión.')
        reserved=sum(int(v.get('monto',0)) for k,v in current.items() if k!=key and v.get('estado') in ('autorizada','reembolsada_manual','reembolso_en_revision','reembolsada_webpay','reembolso_externo_revision','reembolsada_externa'))
        if Decimal(reserved+full_amount(row))>order.monto_total: raise ValidationError('El importe excede el total pagado.')
        current[key]={**old,'estado':'autorizada','motivo':reason,'monto':full_amount(row),'fecha':old.get('fecha',stamp),'autorizado_en':stamp,'responsable':str(actor.pk)}
    elif action=='registrar_devolucion':
        if old.get('estado')!='autorizada': raise ValidationError('Primero autoriza la devolución.')
        for previous in Pedido.objects.filter(real,tienda=store).values_list('entrega',flat=True).iterator():
            if any(v.get('estado')=='reembolsada_manual' and v.get('referencia')==reference for v in (previous.get(LEDGER) or {}).values()):
                raise ValidationError('La referencia de devolución ya está registrada.')
        current[key]={**old,'estado':'reembolsada_manual','motivo':reason,'referencia':reference,'resuelto_en':stamp,'responsable':str(actor.pk)}
        row.estado='liberada';row.save(update_fields=['estado'])
    else: raise ValidationError('Acción no permitida para este pedido.')
    order.entrega={**(order.entrega or {}),LEDGER:current};order.save(update_fields=['entrega'])
    if action=='registrar_devolucion' and not physical and all(r.pk==row.pk or r.estado=='liberada' for r in rows):
        order.estado='cancelado';order.save(update_fields=['estado'])
    return order,row
