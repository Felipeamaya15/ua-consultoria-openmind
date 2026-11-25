from uuid import uuid4
from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase, SimpleTestCase, override_settings
from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework.test import APIRequestFactory
from apps.core.models import Tienda, Pedido
from apps.core.presentation.checkout import CheckoutSerializer, CheckoutOrderAPIView
from apps.landing.models import ConfiguracionLanding, ReservaActividadPagada
from apps.landing.paid_availability import availability
from apps.landing.unified_activity_orders import resolve_unified_qa

class UnifiedContractTests(SimpleTestCase):
    def payload(self):
        return {'clave_checkout':str(uuid4()),'items':[], 'actividades':[{'seccion_id':str(uuid4()),'cantidad':2,'version':'a'*64}],
            'contacto':{'nombre':'QA Comprador','email':'prueba@example.com'},'medio_pago':'Transferencia','metodo_entrega':'Actividad'}
    def test_schema(self):
        data=self.payload()
        self.assertTrue(CheckoutSerializer(data=data).is_valid())
        for key,value in [('cantidad',True),('cantidad','2'),('cantidad',0),('version','x')]:
            bad=self.payload();bad['actividades'][0][key]=value
            self.assertFalse(CheckoutSerializer(data=bad).is_valid())
        bad=self.payload();bad['actividades']*=2
        self.assertFalse(CheckoutSerializer(data=bad).is_valid())
        bad=self.payload();bad['actividades']=[]
        self.assertFalse(CheckoutSerializer(data=bad).is_valid())
        bad=self.payload();bad['metodo_entrega']='Retiro'
        self.assertFalse(CheckoutSerializer(data=bad).is_valid())
        mixed=self.payload();mixed['items']=[{'producto_id':'a'*24,'sku':'QA-SKU','cantidad':1}];mixed['metodo_entrega']='Retiro'
        self.assertTrue(CheckoutSerializer(data=mixed).is_valid())

@override_settings(DEBUG=True)
class UnifiedOrderDBTests(TestCase):
    def setUp(self):
        owner=get_user_model().objects.create_user(username='unified-owner-qa',password='qa-only')
        self.store=Tienda.objects.create(id_usuario_propietario=owner,nombre='QA unificado')
        self.section=str(uuid4())
        block={'id':self.section,'tipo':'personalizada','visible':True,'titulo':'Taller QA',
          'actividad':{'tipo':'taller','estado':'activa','zona_horaria':'America/Santiago','cupos':3,'gratuito':False,'inscripciones':False,
            'venta':{'cierre_minutos':60,'tolerancia_minutos':15,'cancelacion':'evaluacion','cancelacion_horas':48}},
          'componentes':[{'tipo':'precio','visible':True,'importe':'15000'},{'tipo':'fecha','visible':True,'fecha':'2037-12-12'},
                         {'tipo':'horario','visible':True,'inicio':'15:00','termino':'17:00'}]}
        ConfiguracionLanding.objects.create(tienda=self.store,titulo='QA',texto_boton='Ver',contenido={'bloques':[block]})
    def payload(self):
        data=UnifiedContractTests().payload();data['actividades'][0].update(seccion_id=self.section,version=availability(self.store,self.section)['version']);return data
    def post(self,data,enabled=True):
        req=APIRequestFactory().post('/api/checkout/pedidos/',data,format='json')
        with patch.dict('os.environ',{'PAID_ACTIVITY_UNIFIED_QA':'1' if enabled else '0'}),patch('apps.core.presentation.checkout.payment_methods_for_store',return_value={'transfer':{'enabled':True}}),patch('apps.core.presentation.checkout.liberar_vencidos_de_tienda'),patch('apps.core.presentation.checkout.calculate_promotion') as promo:
            promo.return_value.discount=Decimal(0);promo.return_value.shipping=Decimal(0);promo.return_value.promotion=None
            return CheckoutOrderAPIView.as_view()(req)
    def test_same_endpoint_reservation_retry_and_release(self):
        data=self.payload();response=self.post(data)
        self.assertEqual(response.status_code,201,response.data)
        order=Pedido.objects.get(tienda=self.store)
        self.assertEqual(order.monto_total,Decimal(30000));self.assertEqual(order.costo_envio,0)
        self.assertEqual(order.itempedido_set.count(),1)
        self.assertEqual(availability(self.store,self.section)['cupos_disponibles'],1)
        self.assertEqual(self.post(data).status_code,200)
        self.assertEqual(Pedido.objects.filter(tienda=self.store).count(),1)
        self.assertEqual(self.post(self.payload()).status_code,400)
        with transaction.atomic():
            locked=Pedido.objects.select_for_update().get(pk=order.pk)
            resolve_unified_qa(locked,approve=False);locked.estado='cancelado';locked.save(update_fields=['estado'])
        self.assertEqual(availability(self.store,self.section)['cupos_disponibles'],3)
    def test_confirm_preserves_cupos(self):
        response=self.post(self.payload());self.assertEqual(response.status_code,201,response.data)
        with transaction.atomic():
            locked=Pedido.objects.select_for_update().get(tienda=self.store)
            resolve_unified_qa(locked,approve=True);locked.estado='pagado';locked.save(update_fields=['estado'])
        self.assertEqual(ReservaActividadPagada.objects.get().estado,'confirmada')
        self.assertEqual(availability(self.store,self.section)['cupos_disponibles'],1)
    def test_mixed_order_same_number_and_total(self):
        data=self.payload();data['items']=[{'producto_id':'a'*24,'sku':'QA-SKU','cantidad':1}];data['metodo_entrega']='Retiro'
        product={'_id':'a'*24,'activo':True,'nombre':'Producto QA','variantes':[{'sku':'QA-SKU','precio':5000,'stock':4,'activo':True,'atributos_variante':[]}]}
        with patch('apps.core.presentation.checkout.ProductRepository') as repo,patch('apps.core.presentation.checkout.delivery_for_store',return_value={'pickup':{'enabled':True,'address':{},'schedule':{}}}),patch('apps.core.presentation.checkout.validate_pickup_selection',return_value=None):
            repo.return_value.get_by_id.return_value=product
            response=self.post(data)
        self.assertEqual(response.status_code,201,response.data)
        order=Pedido.objects.get(tienda=self.store)
        self.assertEqual(order.monto_total,Decimal(35000));self.assertEqual(order.itempedido_set.count(),2)
        self.assertEqual(availability(self.store,self.section)['cupos_disponibles'],1)
    def test_disabled_and_wrong_method(self):
        self.assertEqual(self.post(self.payload(),False).status_code,403)
        bad=self.payload();bad['medio_pago']='Transbank';self.assertEqual(self.post(bad).status_code,400)
        self.assertFalse(Pedido.objects.filter(tienda=self.store).exists())
    def test_qa_expiration_releases_seats(self):
        from datetime import timedelta
        from django.utils import timezone
        from apps.core.infrastructure.expiracion_pedidos import expirar_pedido_pendiente, _candidatos
        response=self.post(self.payload());self.assertEqual(response.status_code,201,response.data)
        order=Pedido.objects.get(tienda=self.store)
        ReservaActividadPagada.objects.filter(clave_checkout=order.clave_checkout).update(vence=timezone.now()-timedelta(seconds=1))
        self.assertIn(order.pk,list(_candidatos()))
        self.assertTrue(expirar_pedido_pendiente(order.pk,consultar_pasarela=False))
        order.refresh_from_db();self.assertEqual(order.estado,'cancelado')
        self.assertEqual(availability(self.store,self.section)['cupos_disponibles'],3)
        self.assertFalse(expirar_pedido_pendiente(order.pk,consultar_pasarela=False))

    def test_expired_qa_cannot_be_approved(self):
        from datetime import timedelta
        from django.utils import timezone
        from rest_framework.exceptions import ValidationError
        response=self.post(self.payload());self.assertEqual(response.status_code,201,response.data)
        ReservaActividadPagada.objects.all().update(vence=timezone.now()-timedelta(seconds=1))
        with self.assertRaises(ValidationError),transaction.atomic():
            locked=Pedido.objects.select_for_update().get(tienda=self.store)
            resolve_unified_qa(locked,approve=True)
        self.assertEqual(Pedido.objects.get(tienda=self.store).estado,'pendiente')

    def test_qa_never_decrements_physical_stock(self):
        from apps.core.infrastructure.stock_pedidos import descontar_stock_de_pedido
        response=self.post(self.payload());self.assertEqual(response.status_code,201,response.data)
        order=Pedido.objects.get(tienda=self.store)
        with transaction.atomic():
            locked=Pedido.objects.select_for_update().get(pk=order.pk)
            resolve_unified_qa(locked,approve=True);locked.estado='pagado';locked.save(update_fields=['estado'])
        self.assertFalse(descontar_stock_de_pedido(order.pk))
        order.refresh_from_db();self.assertFalse(order.stock_descontado)
