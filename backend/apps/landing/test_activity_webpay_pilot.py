from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase,override_settings
from django.utils import timezone
from apps.core.models import Pedido
from apps.landing.models import ReservaActividadPagada
from apps.landing.paid_availability import availability
from apps.landing import test_unified_activity_orders as helpers
from apps.landing.webpay_activity_orders import WEBPAY_MARKER, META, enabled_config, process_order
from apps.catalog.domain.exceptions import TransbankTransaccionException

@override_settings(DEBUG=True)
class WebpayActivityTests(TestCase):
    setUp=helpers.UnifiedOrderDBTests.setUp
    payload=helpers.UnifiedOrderDBTests.payload
    post=helpers.UnifiedOrderDBTests.post
    def fixture(self):
        response=self.post(self.payload()); self.assertEqual(response.status_code,201,response.data)
        order=Pedido.objects.get(tienda=self.store)
        order.medio_pago='Transbank';order.metodo_pago='Transbank'
        order.entrega={**order.entrega,'origen':WEBPAY_MARKER,META:{'ambiente':'INTEGRACION','comercio':'test','sesion':'session-qa'}}
        order.webpay_token='test-token';order.webpay_url='https://example.com/webpay'
        order.save(update_fields=['medio_pago','metodo_pago','entrega','webpay_token','webpay_url'])
        return order
    def approved(self,order):
        return {'buy_order':order.identificador,'session_id':'session-qa','amount':int(order.monto_total),'status':'AUTHORIZED','response_code':0,'authorization_code':'123456'}
    def test_callback_is_idempotent_and_seats_confirm_once(self):
        order=self.fixture()
        with patch('apps.landing.webpay_activity_orders.adapter_for') as adapter,patch('apps.landing.webpay_activity_orders.status_raw',return_value=self.approved(order)) as status:
            self.assertEqual(process_order(order.pk,callback_token='test-token')[0],'pagado')
            self.assertEqual(process_order(order.pk,callback_token='test-token')[0],'pagado')
            self.assertEqual(status.call_count,1);adapter.return_value.confirmar_transaccion.assert_not_called()
        order.refresh_from_db();self.assertEqual(order.estado,'pagado')
        self.assertEqual(ReservaActividadPagada.objects.get(clave_checkout=order.clave_checkout).estado,'confirmada')
        self.assertEqual(availability(self.store,self.section)['cupos_disponibles'],1)
    def test_amount_mismatch_keeps_hold(self):
        order=self.fixture();raw=self.approved(order);raw['amount']=1
        with patch('apps.landing.webpay_activity_orders.adapter_for'),patch('apps.landing.webpay_activity_orders.status_raw',return_value=raw):
            with self.assertRaises(TransbankTransaccionException): process_order(order.pk,callback_token='test-token')
        order.refresh_from_db();self.assertEqual(order.estado,'pendiente')
        self.assertEqual(availability(self.store,self.section)['cupos_disponibles'],1)
    def test_worker_never_commits_payment(self):
        order=self.fixture();raw=self.approved(order);raw['status']='INITIALIZED'
        ReservaActividadPagada.objects.filter(clave_checkout=order.clave_checkout).update(vence=timezone.now()-timedelta(minutes=1))
        with patch('apps.landing.webpay_activity_orders.adapter_for') as adapter,patch('apps.landing.webpay_activity_orders.status_raw',return_value=raw):
            self.assertEqual(process_order(order.pk)[0],'espera');adapter.return_value.confirmar_transaccion.assert_not_called()
        self.assertEqual(availability(self.store,self.section)['cupos_disponibles'],1)
    def test_no_token_expired_releases(self):
        order=self.fixture();order.webpay_token='';order.webpay_url='';order.save(update_fields=['webpay_token','webpay_url'])
        ReservaActividadPagada.objects.filter(clave_checkout=order.clave_checkout).update(vence=timezone.now()-timedelta(minutes=1))
        with patch('apps.landing.webpay_activity_orders.adapter_for') as adapter:
            self.assertEqual(process_order(order.pk)[0],'cancelado');adapter.assert_not_called()
        self.assertEqual(availability(self.store,self.section)['cupos_disponibles'],3)
    def test_disabled_by_default_even_for_configured_store(self):
        with patch.dict('os.environ',{'PAID_ACTIVITY_WEBPAY_ENABLED':'0','PAID_ACTIVITY_WEBPAY_STORES':str(self.store.pk)}):
            self.assertIsNone(enabled_config(self.store.pk))
