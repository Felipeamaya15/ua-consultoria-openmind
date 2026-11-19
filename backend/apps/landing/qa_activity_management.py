"""QA ledger. No actual payment/refund, no external mail, no card information."""
from decimal import Decimal
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from django.core.validators import validate_email
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import Pedido
from apps.core.presentation.responses import success_response
from apps.authentication.presentation.profile import IsCustomer, StrictSerializer
from apps.landing.models import ReservaActividadPagada
from apps.landing.unified_activity_orders import MARKER, qa_enabled
from apps.landing.transfer_activity_orders import TRANSFER_MARKER, REAL_MARKERS, contact_email, is_transfer_activity, state as transfer_state, change_transfer
from apps.landing.webpay_activity_orders import WEBPAY_MARKER, meta as webpay_meta

LEDGER='devoluciones_actividades_qa'

def ledger(order):
    return dict((order.entrega or {}).get(LEDGER) or {})

def save_ledger(order, records):
    order.entrega={**(order.entrega or {}), LEDGER:records}
    order.save(update_fields=['entrega'])

def amount(row):
    return int(row.precio_unitario)*row.cantidad

def policy(row):
    snapshot=row.condiciones or {}
    terms=snapshot.get('venta') or {}
    return terms.get('cancelacion','evaluacion'), int(terms.get('cancelacion_horas',48))

def describe(order,row,owner=False):
    record=ledger(order).get(str(row.pk)) or {}
    mode,hours=policy(row)
    result={'id':str(row.pk),'pedido_id':order.pk,'pedido':order.identificador,
        'titulo':row.condiciones.get('titulo','Actividad'),'tipo':row.condiciones.get('tipo','actividad'),
        'inicio':row.inicio.isoformat(),'cantidad':row.cantidad,'importe':amount(row),
        'estado':row.estado,'pedido_estado':order.estado,'vence':row.vence.isoformat(),
        'politica':mode,'horas':hours,'plazo_vigente':timezone.now()<row.inicio-timedelta(hours=hours),
        'devolucion':{k:v for k,v in record.items() if k in ('estado','motivo','monto','fecha','resuelto_en')},
        'puede_solicitar':row.estado=='confirmada' and order.estado=='pagado' and not record,
        'modo':'qa'}
    if is_transfer_activity(order):
        webpay=(order.entrega or {}).get('origen')==WEBPAY_MARKER
        from apps.landing.external_activity_orders import is_external, meta as external_meta
        from apps.landing.external_activity_refunds import enabled
        external=is_external(order)
        result.update(transfer_state(order,row), modo='webpay' if webpay else 'external' if external else 'transfer')
        if external:
            result.update(medio_pago=order.medio_pago,ambiente=external_meta(order).get('ambiente'))
            if owner: result['reembolso_externo']=enabled(order)
        if webpay:
            result['ambiente']=webpay_meta(order).get('ambiente')
            if owner: result['reembolso_total_webpay']=(row.precio_unitario*row.cantidad<=order.monto_total and not order.descuento and ((not order.costo_envio and not order.itempedido_set.exclude(producto_mongo_id='').exists()) or order.stock_descontado))
    if owner:
        result.update(comprador=order.nombre_contacto,correo=order.correo_contacto)
    return result

def qa_orders(store):
    return Pedido.objects.filter(tienda=store,entrega__contains={'origen':MARKER})

class QABase(APIView):
    authentication_classes=[TokenAuthentication]
    permission_classes=[IsAuthenticated]
    def store(self,request,owner=False):
        return resolver_tienda(request,exigir_propietario=owner)
    def finalize_response(self, request, response, *args, **kwargs):
        response=super().finalize_response(request,response,*args,**kwargs)
        response['Cache-Control']='no-store'
        return response

class OwnerActivitySales(QABase):
    def get(self,request):
        store=self.store(request,owner=True)
        try: page=int(request.query_params.get('pagina','1'))
        except (TypeError,ValueError): raise ValidationError('Página inválida.')
        if not 1<=page<=10000: raise ValidationError('Página inválida.')
        from django.db.models import Q
        modes=Q(entrega__origen__in=REAL_MARKERS)
        if qa_enabled(request): modes |= Q(entrega__contains={'origen':MARKER})
        orders=Pedido.objects.filter(modes,tienda=store).order_by('-fecha_creacion','-pk')
        batch=list(orders[(page-1)*25:page*25+1]); more=len(batch)>25; batch=batch[:25]
        keyed={o.clave_checkout:o for o in batch}
        rows=ReservaActividadPagada.objects.filter(tienda=store,clave_checkout__in=keyed).order_by('-creado','id')
        return success_response(data={'items':[describe(keyed[row.clave_checkout],row,True) for row in rows], 'mas':more})

class CustomerActivitySales(QABase):
    def get(self,request,pedido_id):
        store=self.store(request)
        if not IsCustomer().has_permission(request,self): raise PermissionDenied('Solo compradores.')
        order=Pedido.objects.filter(tienda=store,pk=pedido_id,comprador=request.user).first()
        if not order: raise NotFound('Pedido no encontrado.')
        marker=(order.entrega or {}).get('origen')
        if marker not in REAL_MARKERS and not (marker==MARKER and qa_enabled(request)): return success_response(data={'items':[],'correo_tienda':''})
        rows=ReservaActividadPagada.objects.filter(tienda=store,clave_checkout=order.clave_checkout)
        email=str(getattr(store,'correo_negocio','') or '').strip()
        try: validate_email(email)
        except DjangoValidationError: email=''
        return success_response(data={'items':[describe(order,r) for r in rows],'correo_tienda':email})

class ActionSerializer(StrictSerializer):
    accion=serializers.ChoiceField(choices=['solicitar','rechazar','simular_devolucion','registrar_pago','rechazar_pago','autorizar_devolucion','registrar_devolucion','reembolsar_webpay','consultar_reembolso_webpay','reembolsar_externo','consultar_reembolso_externo','cerrar_pago_externo'])
    referencia=serializers.CharField(max_length=120,allow_blank=False,required=False)
    motivo=serializers.CharField(max_length=500,allow_blank=False,required=False)

@transaction.atomic
def change_record(store,order_id,reservation_id,actor,action,reason='',owner=False):
    orders=qa_orders(store).select_for_update()
    if not owner: orders=orders.filter(comprador=actor)
    order=orders.filter(pk=order_id).first()
    if not order: raise NotFound('Pedido no encontrado.')
    row=ReservaActividadPagada.objects.select_for_update().filter(pk=reservation_id,tienda=store,clave_checkout=order.clave_checkout).first()
    if not row: raise NotFound('Inscripción no encontrada.')
    records=ledger(order); key=str(row.pk); old=records.get(key) or {}
    if not owner and action!='solicitar': raise PermissionDenied('Solo la tienda puede resolver devoluciones.')
    if owner and action=='solicitar': raise ValidationError('Usa la gestión de devolución de la tienda.')
    if old.get('estado')=='reembolsada_simulada':
        if owner and action=='simular_devolucion': return describe(order,row,True)
        raise ValidationError('Esta inscripción ya tiene una devolución simulada.')
    if action=='solicitar' and old.get('estado')=='solicitada': return describe(order,row)
    if action=='rechazar' and old.get('estado')=='rechazada': return describe(order,row,True)
    if order.estado!='pagado' or row.estado!='confirmada': raise ValidationError('Solo se gestionan inscripciones con pago de prueba aprobado.')
    stamp=timezone.now().isoformat()
    if action=='solicitar':
        if old: raise ValidationError('La solicitud ya fue atendida; comunícate con la tienda.')
        if not reason: raise ValidationError('Indica el motivo de la solicitud.')
        records[key]={'estado':'solicitada','motivo':reason,'monto':amount(row),'fecha':stamp,'solicitante':str(actor.pk)}
    elif action=='rechazar':
        if old.get('estado')!='solicitada' or not reason: raise ValidationError('Se necesita una solicitud pendiente y un motivo.')
        records[key]={**old,'estado':'rechazada','motivo':reason,'resuelto_en':stamp,'responsable':str(actor.pk)}
    elif action=='simular_devolucion':
        if not reason: raise ValidationError('Indica el motivo de devolución.')
        if order.descuento or order.medio_pago!='Transferencia': raise ValidationError('Este pedido no cumple el contrato QA sin descuentos.')
        previous=sum(int(v.get('monto',0)) for v in records.values() if v.get('estado')=='reembolsada_simulada')
        if Decimal(previous+amount(row))>order.monto_total-order.costo_envio:
            raise ValidationError('El importe de devolución supera el valor del pedido.')
        records[key]={**old,'estado':'reembolsada_simulada','motivo':reason,'monto':amount(row),
                      'fecha':old.get('fecha',stamp),'resuelto_en':stamp,'responsable':str(actor.pk)}
        row.estado='liberada';row.save(update_fields=['estado'])
    else: raise ValidationError('Acción inválida.')
    save_ledger(order,records)
    return describe(order,row,owner)

class ActivityRefundAction(QABase):
    def post(self,request,pedido_id,reserva_id):
        body=ActionSerializer(data=request.data);body.is_valid(raise_exception=True)
        data=body.validated_data;owner=data['accion']!='solicitar'
        store=self.store(request,owner=owner)
        if not owner and not IsCustomer().has_permission(request,self): raise PermissionDenied('Solo compradores.')
        order=Pedido.objects.filter(tienda=store,pk=pedido_id).first()
        if not order: raise NotFound('Pedido no encontrado.')
        if data['accion'] in ('reembolsar_webpay','consultar_reembolso_webpay'):
            from apps.landing.webpay_activity_refunds import change_webpay_refund
            order,row=change_webpay_refund(store,pedido_id,reserva_id,request.user,data['accion'],data.get('motivo',''),owner)
            return success_response(data=describe(order,row,owner),mensaje='Devolución Webpay confirmada.')
        if data['accion'] in ('reembolsar_externo','consultar_reembolso_externo'):
            from apps.landing.external_activity_refunds import change_external_refund
            order,row=change_external_refund(store,pedido_id,reserva_id,request.user,data['accion'],data.get('motivo',''),owner)
            return success_response(data=describe(order,row,owner),mensaje='Devolución confirmada por la pasarela.')
        if is_transfer_activity(order):
            order,row=change_transfer(store,pedido_id,reserva_id,request.user,data['accion'],data.get('motivo',''),data.get('referencia',''),owner)
            return success_response(data=describe(order,row,owner),mensaje='Operación registrada.')
        if not qa_enabled(request): raise NotFound('Gestión de pruebas no disponible.')
        result=change_record(store,pedido_id,reserva_id,request.user,data['accion'],data.get('motivo',''),owner)
        return success_response(data=result,mensaje='Operación de prueba registrada. No se ha movido dinero.')
