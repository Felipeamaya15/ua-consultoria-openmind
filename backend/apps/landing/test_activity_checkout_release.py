from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory
from apps.core.models import Pedido
from apps.core.presentation.checkout import CheckoutOrderAPIView
from apps.landing.models import ReservaActividadPagada
from apps.landing.paid_availability import availability
from apps.landing import test_unified_activity_orders as helpers
from apps.landing.webpay_activity_orders import WEBPAY_MARKER, META, process_order
from apps.landing.transfer_activity_orders import TRANSFER_MARKER

@override_settings(DEBUG=True)
class ReleaseActivityCheckoutTest(TestCase):
    setUp=helpers.UnifiedOrderDBTests.setUp
    payload=helpers.UnifiedOrderDBTests.payload

    def register(self, method):
        self.store.correo_negocio='tienda@example.edu'
        self.store.save(update_fields=['correo_negocio'])
        data=self.payload()
        data['medio_pago']=method
        data['contacto']['email']='comprador@example.edu'
        config=SimpleNamespace(codigo_comercio='test-commerce',ambiente='INTEGRACION')
        with patch.dict('os.environ',{'PAID_ACTIVITY_UNIFIED_QA':'0','PAID_ACTIVITY_TEST_CHECKOUT':'0','PAID_ACTIVITY_TRANSFER_ENABLED':'1'}), patch('apps.landing.transfer_activity_orders.enabled_config',return_value=config), patch('apps.landing.webpay_activity_orders.enabled_config',return_value=config), patch('apps.core.presentation.checkout.payment_methods_for_store',return_value={'transbank':{'enabled':True},'transfer':{'enabled':True}}), patch('apps.core.presentation.checkout.liberar_vencidos_de_tienda'), patch('apps.core.presentation.checkout.calculate_promotion') as promo:
            promo.return_value.discount=Decimal(0)
            promo.return_value.shipping=Decimal(0)
            promo.return_value.promotion=None
            def post():
                return CheckoutOrderAPIView.as_view()(APIRequestFactory().post('/api/checkout/pedidos/',data,format='json'))
            first=post()
            self.assertEqual(first.status_code,201,first.data)
            self.assertEqual(post().status_code,200)
        self.assertEqual(Pedido.objects.filter(tienda=self.store).count(),1)
        order=Pedido.objects.get(tienda=self.store)
        self.assertEqual(order.monto_total,Decimal('30000'))
        self.assertEqual(availability(self.store,self.section)['cupos_disponibles'],1)
        return order

    def test_transfer_choice_real_checkout(self):
        order=self.register('Transferencia')
        self.assertEqual(order.entrega['origen'],TRANSFER_MARKER)
        self.assertEqual(order.estado,'pendiente')

    def test_webpay_choice_real_checkout_and_callback(self):
        order=self.register('Transbank')
        self.assertEqual(order.entrega['origen'],WEBPAY_MARKER)
        self.assertEqual(order.entrega[META]['ambiente'],'INTEGRACION')
        self.assertEqual(order.estado,'pendiente')
        # Stub provider only; order and reservations came from real checkout route.
        order.entrega[META]['sesion']='session-release'
        order.webpay_token='test-token'
        order.webpay_url='https://example.com/webpay'
        order.save(update_fields=['entrega','webpay_token','webpay_url'])
        provider={'buy_order':order.identificador,'session_id':'session-release','amount':int(order.monto_total),'status':'AUTHORIZED','response_code':0,'authorization_code':'123456'}
        with patch('apps.landing.webpay_activity_orders.adapter_for'), patch('apps.landing.webpay_activity_orders.status_raw',return_value=provider) as mock_status:
            self.assertEqual(process_order(order.pk,callback_token='test-token')[0],'pagado')
            self.assertEqual(process_order(order.pk,callback_token='test-token')[0],'pagado')
            self.assertEqual(mock_status.call_count,1)
        order.refresh_from_db()
        self.assertEqual(order.estado,'pagado')
        self.assertEqual(ReservaActividadPagada.objects.get(clave_checkout=order.clave_checkout).estado,'confirmada')
        self.assertEqual(availability(self.store,self.section)['cupos_disponibles'],1)
