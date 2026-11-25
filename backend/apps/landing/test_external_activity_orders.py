from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from django.db import transaction
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.core.models import Pedido, ItemPedido
from apps.core.presentation.pago_pedido_pendiente import ErrorPago
from apps.landing.models import ReservaActividadPagada
from apps.landing import test_unified_activity_orders as helpers
from apps.landing.external_activity_orders import MARKER, META, approve_locked, verify_mp_locked, verify_paypal_locked, reconcile
from apps.landing.external_activity_refunds import amount_for, change_external_refund, REVIEW, DONE, verify_result
from apps.landing.transfer_activity_orders import LEDGER, records, change_transfer


class ExternalContractTests(SimpleTestCase):
    def test_fx_rounding_conserves_original_capture(self):
        order=SimpleNamespace(medio_pago='PayPal',monto_total=Decimal('35000'),pago_fx={'monto_usd':'37.19'})
        first=SimpleNamespace(precio_unitario=15000,cantidad=1)
        second=SimpleNamespace(precio_unitario=20000,cantidad=1)
        a,currency=amount_for(order,{},first)
        b,_=amount_for(order,{'a':{'estado':DONE,'monto':15000,'monto_pasarela':str(a)}},second)
        self.assertEqual(currency,'USD');self.assertEqual(a+b,Decimal('37.19'))
        self.assertEqual(a,Decimal('15.94'))

    def test_mp_refund_requires_identity_and_approved_status(self):
        order=SimpleNamespace(medio_pago='MercadoPago',entrega={META:{'referencia_pago':'7'}})
        v={'refund_id':'8','monto_pasarela':'15000'}
        raw={'id':8,'payment_id':7,'status':'approved','amount':15000}
        self.assertTrue(verify_result(order,v,raw))
        for bad in ({'payment_id':9},{'status':'pending'},{'amount':15001},{'id':99}):
            self.assertFalse(verify_result(order,v,{**raw,**bad}))


@override_settings(DEBUG=True)
class ExternalOrderTests(TestCase):
    setUp=helpers.UnifiedOrderDBTests.setUp
    payload=helpers.UnifiedOrderDBTests.payload
    post=helpers.UnifiedOrderDBTests.post

    def fixture(self, method='MercadoPago'):
        with patch.dict('os.environ',{'PAID_ACTIVITY_TEST_CHECKOUT':'0','PAID_ACTIVITY_EXTERNAL_METHODS':''}):
            response=self.post(self.payload())
        self.assertEqual(response.status_code,201,response.data)
        order=Pedido.objects.get(tienda=self.store)
        order.medio_pago=method;order.metodo_pago=method
        order.entrega={**order.entrega,'origen':MARKER,META:{'medio':method,'ambiente':'SANDBOX','config_hash':'fixture','inicio':{'url':'https://example.test'}}}
        if method=='PayPal': order.pago_fx={'paypal_order_id':'ORDER1','monto_usd':'31.23'}
        order.save(update_fields=['medio_pago','metodo_pago','entrega','pago_fx'])
        return order

    def mp(self,order,**updates):
        return {'id':123,'external_reference':order.identificador,'status':'approved','currency_id':'CLP','transaction_amount':int(order.monto_total),**updates}

    def test_mp_approval_and_replay(self):
        order=self.fixture()
        with patch('apps.landing.external_activity_orders.assert_config'),transaction.atomic():
            verify_mp_locked(order,self.mp(order),'123')
            verify_mp_locked(order,self.mp(order),'123')
            with self.assertRaises(ErrorPago):verify_mp_locked(order,self.mp(order,id=456),'456')
        order.refresh_from_db();self.assertEqual(order.estado,'pagado')
        self.assertEqual(ReservaActividadPagada.objects.get(clave_checkout=order.clave_checkout).estado,'confirmada')

    def test_mp_wrong_currency_amount_or_reference_does_not_approve(self):
        order=self.fixture()
        with patch('apps.landing.external_activity_orders.assert_config'),transaction.atomic():
            for wrong in ({'currency_id':'USD'},{'transaction_amount':1},{'external_reference':'other-order'}):
                with self.assertRaises(ErrorPago):verify_mp_locked(order,self.mp(order,**wrong),'123')
        order.refresh_from_db();self.assertEqual(order.estado,'pendiente')
        self.assertEqual(ReservaActividadPagada.objects.get(clave_checkout=order.clave_checkout).estado,'en_pago')

    def test_paypal_capture_requires_original_usd(self):
        order=self.fixture('PayPal')
        raw={'id':'ORDER1','status':'COMPLETED','purchase_units':[{'reference_id':order.identificador,'payments':{'captures':[{'id':'CAP1','status':'COMPLETED','amount':{'currency_code':'USD','value':'31.23'}}]}}]}
        with patch('apps.landing.external_activity_orders.assert_config'),transaction.atomic():
            capture=raw['purchase_units'][0]['payments']['captures'][0]
            capture['amount']['value']='31.22'
            with self.assertRaises(ErrorPago):verify_paypal_locked(order,raw,'ORDER1')
            capture['amount']['value']='31.23';verify_paypal_locked(order,raw,'ORDER1')
        order.refresh_from_db();self.assertEqual(order.estado,'pagado')
        self.assertEqual(order.entrega[META]['referencia_pago'],'CAP1')

    def test_started_callback_payment_expiry_keeps_seat(self):
        order=self.fixture('TUU')
        ReservaActividadPagada.objects.filter(clave_checkout=order.clave_checkout).update(vence=timezone.now()-timedelta(minutes=1))
        self.assertEqual(reconcile(order.pk),'indeterminado')
        order.refresh_from_db();self.assertEqual(order.estado,'pendiente')
        self.assertEqual(ReservaActividadPagada.objects.get(clave_checkout=order.clave_checkout).estado,'en_pago')

    def test_unstarted_external_payment_expiry_releases(self):
        order=self.fixture();order.entrega[META].pop('inicio');order.save(update_fields=['entrega'])
        ReservaActividadPagada.objects.filter(clave_checkout=order.clave_checkout).update(vence=timezone.now()-timedelta(minutes=1))
        self.assertEqual(reconcile(order.pk),'cancelado')
        self.assertEqual(ReservaActividadPagada.objects.get(clave_checkout=order.clave_checkout).estado,'liberada')

    def prepare_refund(self):
        order=self.fixture()
        with patch('apps.landing.external_activity_orders.assert_config'),transaction.atomic():
            verify_mp_locked(order,self.mp(order),'123')
        order.refresh_from_db();row=ReservaActividadPagada.objects.get(clave_checkout=order.clave_checkout)
        order.entrega[LEDGER]={str(row.pk):{'estado':'autorizada','monto':int(order.monto_total)}};order.save(update_fields=['entrega'])
        return order,row

    def action(self,order,row,action='reembolsar_externo'):
        return change_external_refund(self.store,order.pk,row.pk,self.store.id_usuario_propietario,action,'Revisión del pedido',True)

    def test_external_refund_only_once(self):
        order,row=self.prepare_refund()
        response={'id':777,'payment_id':123,'status':'approved','amount':int(order.monto_total)}
        with patch('apps.landing.external_activity_refunds.enabled',return_value=True),patch('apps.landing.external_activity_refunds.gateway'),patch('apps.landing.external_activity_refunds.provider_refunds',return_value=[]),patch('apps.landing.external_activity_refunds.request_refund',return_value=response) as provider:
            self.action(order,row);self.action(order,row);self.assertEqual(provider.call_count,1)
        order.refresh_from_db();row.refresh_from_db();self.assertEqual(order.estado,'cancelado');self.assertEqual(row.estado,'liberada')
        self.assertEqual(records(order)[str(row.pk)]['estado'],DONE)

    def test_unknown_refund_blocks_second_post_and_manual_refund(self):
        order,row=self.prepare_refund()
        with patch('apps.landing.external_activity_refunds.enabled',return_value=True),patch('apps.landing.external_activity_refunds.gateway'),patch('apps.landing.external_activity_refunds.provider_refunds',return_value=[]),patch('apps.landing.external_activity_refunds.request_refund',side_effect=TimeoutError()) as provider:
            with self.assertRaises(ValidationError):self.action(order,row)
            with self.assertRaises(ValidationError):self.action(order,row)
            self.assertEqual(provider.call_count,1)
        order.refresh_from_db();row.refresh_from_db();self.assertEqual(row.estado,'confirmada');self.assertEqual(records(order)[str(row.pk)]['estado'],REVIEW)
        with self.assertRaises(ValidationError):change_transfer(self.store,order.pk,row.pk,self.store.id_usuario_propietario,'registrar_devolucion','Comprobante','REF',True)
