from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
from django.test import SimpleTestCase,TestCase,override_settings
from rest_framework.exceptions import ValidationError
from apps.landing.webpay_activity_refunds import is_full_refund, change_webpay_refund
from apps.landing.transfer_activity_orders import records, LEDGER
from apps.landing.webpay_activity_orders import process_order
from apps.landing.models import ReservaActividadPagada
from apps.landing import test_activity_webpay_pilot as helpers

class RefundResultTests(SimpleTestCase):
    def test_reversed(self):self.assertTrue(is_full_refund({'type':'REVERSED'},Decimal(1000)))
    def test_exact_nullification(self):
        raw={'type':'NULLIFIED','nullified_amount':1000,'balance':0,'response_code':0,'authorization_code':'ABC123'}
        self.assertTrue(is_full_refund(raw,Decimal(1000)))
        for key,value in [('nullified_amount',999),('balance',1),('response_code',-1),('authorization_code','')]:
            self.assertFalse(is_full_refund({**raw,key:value},Decimal(1000)))
    def test_unknown(self):self.assertFalse(is_full_refund({'type':'UNKNOWN'},Decimal(1000)))

@override_settings(DEBUG=True)
class WebpayRefundDBTests(TestCase):
    setUp=helpers.WebpayActivityTests.setUp
    payload=helpers.WebpayActivityTests.payload
    post=helpers.WebpayActivityTests.post
    fixture=helpers.WebpayActivityTests.fixture
    approved=helpers.WebpayActivityTests.approved
    def prepare(self):
        order=self.fixture()
        with patch('apps.landing.webpay_activity_orders.adapter_for'),patch('apps.landing.webpay_activity_orders.status_raw',return_value=self.approved(order)):
            process_order(order.pk,callback_token='test-token')
        order.refresh_from_db()
        row=ReservaActividadPagada.objects.get(clave_checkout=order.clave_checkout)
        from apps.landing.webpay_activity_orders import META, NEW_API_VERSION
        order.entrega={**order.entrega,META:{**order.entrega[META],'api_version':NEW_API_VERSION},LEDGER:{str(row.pk):{'estado':'autorizada','monto':int(order.monto_total)}}}
        order.save(update_fields=['entrega'])
        return order,row
    def action(self,order,row,action='reembolsar_webpay'):
        return change_webpay_refund(self.store,order.pk,row.pk,SimpleNamespace(pk=1),action,'Prueba',True)
    def test_legacy_refund_does_not_contact_provider(self):
        from apps.landing.webpay_activity_orders import META
        order,row=self.prepare()
        order.entrega[META].pop('api_version');order.save(update_fields=['entrega'])
        with patch('apps.landing.webpay_activity_refunds.adapter_for') as adapter,patch('apps.landing.webpay_activity_refunds._request_refund') as refund:
            with self.assertRaises(ValidationError):self.action(order,row)
            adapter.assert_not_called();refund.assert_not_called()
        order.refresh_from_db();row.refresh_from_db()
        self.assertEqual(records(order)[str(row.pk)]['estado'],'autorizada')
        self.assertEqual(row.estado,'confirmada')

    def test_refund_only_once(self):
        order,row=self.prepare()
        with patch('apps.landing.webpay_activity_refunds.adapter_for'),patch('apps.landing.webpay_activity_refunds.status_raw',return_value=self.approved(order)),patch('apps.landing.webpay_activity_refunds._request_refund',return_value={'type':'REVERSED'}) as refund:
            self.action(order,row); self.action(order,row)
            self.assertEqual(refund.call_count,1)
        order.refresh_from_db();row.refresh_from_db()
        self.assertEqual(order.estado,'cancelado');self.assertEqual(row.estado,'liberada')
        self.assertEqual(records(order)[str(row.pk)]['estado'],'reembolsada_webpay')
    def test_timeout_does_not_retry_and_reconciliation_releases(self):
        order,row=self.prepare()
        with patch('apps.landing.webpay_activity_refunds.adapter_for'),patch('apps.landing.webpay_activity_refunds.status_raw',return_value=self.approved(order)),patch('apps.landing.webpay_activity_refunds._request_refund',side_effect=TimeoutError) as refund:
            with self.assertRaises(ValidationError): self.action(order,row)
            with self.assertRaises(ValidationError): self.action(order,row)
            self.assertEqual(refund.call_count,1)
        order.refresh_from_db();row.refresh_from_db()
        self.assertEqual(order.estado,'pagado');self.assertEqual(row.estado,'confirmada')
        self.assertEqual(records(order)[str(row.pk)]['estado'],'reembolso_en_revision')
        with patch('apps.landing.webpay_activity_refunds.adapter_for'),patch('apps.landing.webpay_activity_refunds.status_raw',return_value={**self.approved(order),'status':'REVERSED'}),patch('apps.landing.webpay_activity_refunds._request_refund') as refund:
            self.action(order,row,'consultar_reembolso_webpay');refund.assert_not_called()
        row.refresh_from_db();self.assertEqual(row.estado,'liberada')

    def test_partial_refund_keeps_other_activity(self):
        from uuid import uuid4
        from apps.landing.unified_activity_orders import order_line
        from apps.core.models import ItemPedido
        order,row=self.prepare()
        first_amount=order.monto_total
        second=ReservaActividadPagada.objects.get(pk=row.pk)
        second.pk=uuid4();second.seccion_id=uuid4();second.save(force_insert=True)
        ItemPedido.objects.create(id_pedido=order,**order_line(second))
        order.monto_total=first_amount*2
        order.save(update_fields=['monto_total'])
        raw=self.approved(order)
        response={'type':'NULLIFIED','nullified_amount':int(first_amount),'balance':int(first_amount),'response_code':0,'authorization_code':'123456'}
        with patch('apps.landing.webpay_activity_refunds.adapter_for'),patch('apps.landing.webpay_activity_refunds.status_raw',return_value=raw),patch('apps.landing.webpay_activity_refunds._request_refund',return_value=response) as refund:
            self.action(order,row); self.action(order,row)
            self.assertEqual(refund.call_count,1)
            self.assertEqual(refund.call_args.args[2],first_amount)
        order.refresh_from_db();row.refresh_from_db();second.refresh_from_db()
        self.assertEqual(order.estado,'pagado')
        self.assertEqual(row.estado,'liberada');self.assertEqual(second.estado,'confirmada')
        self.assertEqual(records(order)[str(row.pk)]['saldo_posterior'],int(first_amount))
        # Only the remaining amount can be refunded, not the original total again.
        ledger=records(order);ledger[str(second.pk)]={'estado':'autorizada','monto':int(first_amount)}
        order.entrega={**order.entrega,LEDGER:ledger};order.save(update_fields=['entrega'])
        with patch('apps.landing.webpay_activity_refunds.adapter_for'),patch('apps.landing.webpay_activity_refunds.status_raw',return_value={**raw,'status':'PARTIALLY_NULLIFIED','balance':int(first_amount)}),patch('apps.landing.webpay_activity_refunds._request_refund',return_value={**response,'balance':0}) as refund:
            self.action(order,second)
            self.assertEqual(refund.call_args.args[2],first_amount)
        order.refresh_from_db();second.refresh_from_db()
        self.assertEqual(order.estado,'cancelado');self.assertEqual(second.estado,'liberada')

    def test_partial_never_accepts_total_reversal_or_unexpected_balance(self):
        from apps.landing.webpay_activity_refunds import is_confirmed_refund
        self.assertFalse(is_confirmed_refund({'type':'REVERSED'},Decimal(15000),Decimal(34990),Decimal(34990)))
        raw={'type':'NULLIFIED','nullified_amount':15000,'balance':19990,'response_code':0,'authorization_code':'ABC123'}
        self.assertTrue(is_confirmed_refund(raw,Decimal(15000),Decimal(34990),Decimal(34990)))
        self.assertFalse(is_confirmed_refund({**raw,'balance':0},Decimal(15000),Decimal(34990),Decimal(34990)))
