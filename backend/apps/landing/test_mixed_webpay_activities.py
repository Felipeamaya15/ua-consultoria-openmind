from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4
from bson import ObjectId
from django.test import TestCase,override_settings
from rest_framework.test import APIRequestFactory
from apps.core.models import Pedido
from apps.core.presentation.checkout import CheckoutOrderAPIView
from apps.core.infrastructure.mongo_client import get_mongo_db
from apps.landing.models import ReservaActividadPagada
from apps.landing.webpay_activity_orders import WEBPAY_MARKER,META,process_order
from apps.landing.mixed_activity_orders import OPS
from apps.catalog.domain.exceptions import TransbankTransaccionException
from apps.landing import test_unified_activity_orders as helpers

@override_settings(DEBUG=True)
class MixedWebpayTests(TestCase):
    setUp=helpers.UnifiedOrderDBTests.setUp
    payload=helpers.UnifiedOrderDBTests.payload
    def register(self,enabled=True):
        self.store.correo_negocio='tienda@example.edu';self.store.save(update_fields=['correo_negocio'])
        data=self.payload();data['medio_pago']='Transbank';data['contacto']['email']='comprador@example.edu'
        self.pid=ObjectId();data['items']=[{'producto_id':str(self.pid),'sku':'MIX-1','cantidad':1}];data['metodo_entrega']='Retiro'
        product={'_id':str(self.pid),'activo':True,'nombre':'Producto prueba','variantes':[{'sku':'MIX-1','precio':5000,'stock':4,'activo':True,'atributos_variante':[]}]}
        cfg=SimpleNamespace(codigo_comercio='test',ambiente='INTEGRACION')
        with patch.dict('os.environ',{'PAID_ACTIVITY_UNIFIED_QA':'0','PAID_ACTIVITY_TEST_CHECKOUT':'0','PAID_ACTIVITY_MIXED_ENABLED':'1' if enabled else '0'}),patch('apps.landing.transfer_activity_orders.enabled_config',return_value=cfg),patch('apps.landing.webpay_activity_orders.enabled_config',return_value=cfg),patch('apps.core.presentation.checkout.payment_methods_for_store',return_value={'transbank':{'enabled':True}}),patch('apps.core.presentation.checkout.liberar_vencidos_de_tienda'),patch('apps.core.presentation.checkout.ProductRepository') as repo,patch('apps.core.presentation.checkout.delivery_for_store',return_value={'pickup':{'enabled':True,'address':{},'schedule':{}}}),patch('apps.core.presentation.checkout.validate_pickup_selection',return_value=None),patch('apps.core.presentation.checkout.calculate_promotion') as promo:
            repo.return_value.get_by_id.return_value=product
            promo.return_value.discount=Decimal(0);promo.return_value.shipping=Decimal(0);promo.return_value.promotion=None
            response=CheckoutOrderAPIView.as_view()(APIRequestFactory().post('/api/checkout/pedidos/',data,format='json'))
        if not enabled:
            self.assertEqual(response.status_code,400,response.data);self.assertFalse(Pedido.objects.filter(tienda=self.store).exists());return None
        self.assertEqual(response.status_code,201,response.data)
        order=Pedido.objects.get(tienda=self.store);self.assertEqual(order.monto_total,Decimal(35000));self.assertEqual(order.itempedido_set.count(),2)
        order.entrega[META]['sesion']='mixed-session';order.webpay_token='mixed-token';order.webpay_url='https://example.com/webpay';order.save(update_fields=['entrega','webpay_token','webpay_url'])
        return order
    def test_disabled_refuses_order(self): self.register(False)
    def exercise(self,initial_stock):
        order=self.register()
        db=get_mongo_db();coll=db['qa_mixed_'+uuid4().hex];self.addCleanup(coll.drop)
        coll.insert_one({'_id':self.pid,'tienda_id':str(self.store.pk),'variantes':[{'sku':'MIX-1','stock':initial_stock}]})
        approved={'buy_order':order.identificador,'session_id':'mixed-session','amount':35000,'status':'AUTHORIZED','response_code':0,'authorization_code':'ABC123'}
        with patch('apps.landing.mixed_activity_orders.ProductRepository',return_value=SimpleNamespace(collection=coll)),patch('apps.landing.webpay_activity_orders.adapter_for'),patch('apps.landing.webpay_activity_orders.status_raw',return_value=approved):
            if initial_stock==0:
                with self.assertRaises(TransbankTransaccionException):process_order(order.pk,callback_token='mixed-token')
                order.refresh_from_db();self.assertEqual(order.estado,'pendiente');self.assertFalse(order.stock_descontado)
                self.assertEqual(ReservaActividadPagada.objects.get(clave_checkout=order.clave_checkout).estado,'en_pago')
                coll.update_one({'_id':self.pid},{'$set':{'variantes.0.stock':4}})
            self.assertEqual(process_order(order.pk,callback_token='mixed-token')[0],'pagado')
            self.assertEqual(process_order(order.pk,callback_token='mixed-token')[0],'pagado')
        order.refresh_from_db();self.assertTrue(order.stock_descontado)
        row=ReservaActividadPagada.objects.get(clave_checkout=order.clave_checkout);self.assertEqual(row.estado,'confirmada')
        doc=coll.find_one({'_id':self.pid});self.assertEqual(doc['variantes'][0]['stock'],3);self.assertEqual(len(doc[OPS]),1)
    def test_confirm_mixed_once(self): self.exercise(4)
    def test_insufficient_stock_keeps_hold_then_reconciles(self): self.exercise(0)
