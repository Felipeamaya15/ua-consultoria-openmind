"""Regresiones del cierre post-integración. No invoca cobros ni APIs externas."""
from decimal import Decimal
from unittest.mock import Mock, patch

import requests
from django.contrib.auth import get_user_model
from django.test import TestCase, SimpleTestCase
from rest_framework.test import APIClient

from apps.catalog.application.use_cases import ConfirmarPagoTransbankUseCase
from apps.catalog.domain.exceptions import TransbankTransaccionException
from apps.core.models import (
    Tienda, Pedido, ConfiguracionTransbank, ConfiguracionPayPal, ConfiguracionMercadoPago, ConfiguracionPago,
)
from apps.core.test_linkify_notificacion import firmar, CLAVE


class FinalPaymentAuditTests(TestCase):
    def setUp(self):
        users = get_user_model()
        self.owner = users.objects.create_user(username='audit-owner')
        self.buyer = users.objects.create_user(username='audit-buyer')
        self.store = Tienda.objects.create(nombre='Audit', id_usuario_propietario=self.owner)
        self.order = Pedido.objects.create(tienda=self.store, comprador=self.buyer,
            monto_total=Decimal('10990'), medio_pago='Transbank', correo_contacto='buyer@example.test')
        ConfiguracionTransbank.objects.create(id_tienda=self.store, activo=True,
            codigo_comercio='audit-commerce', api_key='audit-key')
        self.api = APIClient()
        self.start_url = '/api/catalog/pagos/transbank/iniciar/'
        self.payload = {'id_tienda': self.store.pk, 'orden_compra': self.order.identificador,
            'monto': 1, 'email': 'buyer@example.test', 'session_id': 'audit-session', 'return_url': 'http://localhost:5173/pedido-confirmado'}

    def start(self, **changes):
        return self.api.post(self.start_url, {**self.payload, **changes}, format='json')

    @patch('apps.catalog.application.use_cases.TransbankWebpayAdapter')
    def test_webpay_uses_persisted_total_even_if_browser_amount_is_altered(self, adapter):
        adapter.return_value.iniciar_transaccion.return_value = {'token': 'mock-token', 'url': 'https://example.test'}
        response = self.start()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(adapter.return_value.iniciar_transaccion.call_args.kwargs['monto'], Decimal('10990'))

    @patch('apps.catalog.application.use_cases.TransbankWebpayAdapter')
    def test_webpay_rejects_missing_order_wrong_method_paid_cancelled_or_fractional_total(self, adapter):
        cases = ({'medio_pago': 'Transferencia'}, {'estado': 'pagado'}, {'estado': 'cancelado'},
                 {'monto_total': Decimal('10990.50')}, {'monto_total': Decimal('0')})
        for changes in cases:
            Pedido.objects.filter(pk=self.order.pk).update(medio_pago='Transbank', estado='pendiente', monto_total=10990)
            Pedido.objects.filter(pk=self.order.pk).update(**changes)
            self.assertEqual(self.start().status_code, 400)
        self.assertEqual(self.start(orden_compra='inexistente').status_code, 400)
        self.assertEqual(self.start(email='other@example.test').status_code, 400)
        adapter.return_value.iniciar_transaccion.assert_not_called()

    @patch('apps.catalog.application.use_cases.TransbankWebpayAdapter')
    def test_webpay_rejects_incomplete_credentials_before_remote_request(self, adapter):
        ConfiguracionTransbank.objects.filter(id_tienda=self.store).update(api_key='')
        self.assertEqual(self.start().status_code, 400)
        adapter.assert_not_called()

    @patch('apps.catalog.application.use_cases.TransbankWebpayAdapter')
    def test_webpay_rejects_external_return_origin(self, adapter):
        self.assertEqual(self.start(return_url='https://attacker.example/return').status_code, 400)
        adapter.assert_not_called()

    def test_webpay_confirmation_rejects_fractional_mismatch_nonfinite_and_malformed_amounts(self):
        for amount in ('10990.99', 'NaN', 'Infinity', None, 'invalid'):
            with self.assertRaises(TransbankTransaccionException):
                ConfirmarPagoTransbankUseCase._registrar_pago_aprobado(self.store.pk,
                    {'orden_compra': self.order.identificador, 'monto': amount})
        self.order.refresh_from_db()
        self.assertEqual(self.order.estado, 'pendiente')

    def test_webpay_confirmation_requires_correct_method_store_reference_and_state(self):
        result = {'orden_compra': self.order.identificador, 'monto': 10990}
        for changes in ({'medio_pago': 'Transferencia'}, {'medio_pago': 'Transbank', 'estado': 'cancelado'}):
            Pedido.objects.filter(pk=self.order.pk).update(**changes)
            with self.assertRaises(TransbankTransaccionException):
                ConfirmarPagoTransbankUseCase._registrar_pago_aprobado(self.store.pk, result)
        with self.assertRaises(TransbankTransaccionException):
            ConfirmarPagoTransbankUseCase._registrar_pago_aprobado(999, result)
        with self.assertRaises(TransbankTransaccionException):
            ConfirmarPagoTransbankUseCase._registrar_pago_aprobado(self.store.pk, {'monto': 10990})

    @patch('apps.catalog.application.use_cases.TransbankWebpayAdapter')
    def test_webpay_confirmation_endpoint_updates_order_and_is_idempotent(self, adapter):
        adapter.return_value.confirmar_transaccion.return_value = {
            'orden_compra': self.order.identificador, 'monto': 10990, 'estado': 'AUTHORIZED'}
        for _ in range(2):
            response = self.api.post('/api/catalog/pagos/transbank/confirmar/',
                {'id_tienda': self.store.pk, 'token_ws': 'mock-token'}, format='json')
            self.assertEqual(response.status_code, 200, response.data)
        self.order.refresh_from_db()
        self.assertEqual(self.order.estado, 'pagado')
        self.assertEqual(Pedido.objects.count(), 1)

    @patch('apps.catalog.infrastructure.adapters.paypal_adapter.PayPalAdapter')
    def test_incomplete_gateways_are_unavailable_and_paypal_cannot_charge_or_capture(self, adapter):
        ConfiguracionPayPal.objects.create(id_tienda=self.store, activo=True, client_id='audit', client_secret='audit-secret')
        ConfiguracionMercadoPago.objects.create(id_tienda=self.store, activo=True, public_key='audit', access_token='audit-token')
        methods = self.api.get('/api/pagos/activos/').data['data']
        self.assertTrue(methods['transbank']['enabled'])
        for key in ('paypal', 'mercadopago'):
            self.assertFalse(methods[key]['enabled'])
            self.assertTrue(methods[key]['reason'])
        for url in ('/api/pagos/paypal/iniciar/', '/api/pagos/paypal/capturar/'):
            response = self.api.post(url, {'order_number': self.order.identificador, 'amount': 1,
                'order_id': 'unbound-remote-order'}, format='json')
            self.assertEqual(response.status_code, 409, response.data)
        adapter.assert_not_called()
        from uuid import uuid4
        for method in ('PayPal', 'MercadoPago'):
            with patch('apps.core.presentation.checkout.ProductRepository') as repository:
                response = self.api.post('/api/checkout/pedidos/', {
                    'clave_checkout': str(uuid4()), 'medio_pago': method, 'metodo_entrega': 'Retiro',
                    'contacto': {'nombre': 'Audit', 'email': 'buyer@example.test'},
                    'items': [{'producto_id': '0123456789abcdef01234567', 'sku': 'QA', 'cantidad': 1}],
                }, format='json')
                self.assertEqual(response.status_code, 400, response.data)
                repository.assert_not_called()
        self.assertEqual(Pedido.objects.count(), 1)

    def test_guest_and_customer_cannot_decrement_stock_through_legacy_purchase_route(self):
        url = '/api/productos/0123456789abcdef01234567/variantes/QA/comprar/'
        with patch('apps.catalog.application.services.VariantService.process_purchase') as purchase:
            self.assertEqual(self.api.post(url, {'cantidad': 1}, format='json').status_code, 401)
            self.api.force_authenticate(self.buyer)
            self.assertEqual(self.api.post(url, {'cantidad': 1}, format='json').status_code, 403)
            purchase.assert_not_called()

    def test_customer_history_rejects_foreign_store_headers_and_query(self):
        self.api.force_authenticate(self.buyer)
        for url in ('/api/mi-cuenta/pedidos/', f'/api/mi-cuenta/pedidos/{self.order.pk}/'):
            self.assertEqual(self.api.get(url, HTTP_X_TIENDA_ID='999').status_code, 400)
            self.assertEqual(self.api.get(url+'?tienda_id=999').status_code, 400)

    def test_signed_linkify_query_preserves_fraction_and_rejects_other_method(self):
        ConfiguracionPago.objects.create(tienda=self.store, datos={'linkify': {'enabled': True,
            'fields': {'idCuenta': 'AUDIT', 'clavePrivada': CLAVE}}})
        url = f'/api/pagos/linkify/notificacion/?id_pago={self.order.pk}'
        headers = {'HTTP_X_LINKIFY_CONFIRMATION': firmar(b'')}
        self.assertEqual(self.api.get(url, **headers).status_code, 409)
        Pedido.objects.filter(pk=self.order.pk).update(medio_pago='Linkify', monto_total=Decimal('10990.25'))
        response = self.api.get(url, **headers)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Decimal(str(response.data['monto'])), Decimal('10990.25'))

    def test_tracking_errors_also_disable_caching(self):
        for data, expected in (({}, 400),
            ({'identificador': self.order.identificador, 'email': 'wrong@example.test'}, 404)):
            response = self.api.post('/api/pedidos/seguimiento/', data, format='json')
            self.assertEqual(response.status_code, expected, response.data)
            self.assertEqual(response['Cache-Control'], 'no-store')


class FinalBoundaryAuditTests(SimpleTestCase):
    def test_logistics_malformed_events_raise_controlled_validation_error(self):
        from apps.catalog.infrastructure.adapters.seguimiento_response import procesar_respuesta_seguimiento
        for provider, payload in (('Starken', {'eventos': [None]}),
                                  ('Chilexpress', {'data': {'statusList': ['invalid']}})):
            with self.assertRaises(ValueError):
                procesar_respuesta_seguimiento(provider, payload)
        self.assertEqual(procesar_respuesta_seguimiento('Starken', {'eventos': []}), [])

    def test_nontext_logistics_state_is_rejected(self):
        from apps.catalog.domain.seguimiento import estandarizar_estado
        with self.assertRaises(ValueError):
            estandarizar_estado(123)

    @patch('apps.authentication.application.use_cases.requests.get')
    def test_google_rejects_unverified_email_before_account_lookup(self, get):
        from apps.authentication.application.use_cases import GoogleLoginUseCase, InvalidCredentialsException
        repository = Mock()
        for verified in (False, None, 'true'):
            get.return_value = Mock(ok=True, json=lambda: {'email': 'buyer@example.test', 'email_verified': verified})
            with self.assertRaises(InvalidCredentialsException):
                GoogleLoginUseCase(repository).execute('mock-access-token')
        repository.get_by_email.assert_not_called()
        self.assertEqual(get.call_args.kwargs['timeout'], 10)

    @patch('apps.authentication.application.use_cases.requests.get')
    def test_google_timeout_is_controlled_and_verified_email_still_logs_in(self, get):
        from apps.authentication.application.use_cases import GoogleLoginUseCase, InvalidCredentialsException
        repository = Mock()
        get.side_effect = requests.Timeout('mock transport details')
        with self.assertRaises(InvalidCredentialsException):
            GoogleLoginUseCase(repository).execute('mock-access-token')
        get.side_effect = None
        get.return_value = Mock(ok=True, json=lambda: {'email': 'buyer@example.test', 'email_verified': True})
        self.assertEqual(GoogleLoginUseCase(repository).execute('mock-access-token'), repository.get_by_email.return_value)

    @patch('apps.catalog.infrastructure.adapters.transbank_adapter.requests.post')
    def test_webpay_provider_errors_do_not_expose_raw_response_or_transport_details(self, post):
        from apps.catalog.infrastructure.adapters.transbank_adapter import TransbankWebpayAdapter
        adapter = TransbankWebpayAdapter('audit', 'audit-key')
        post.return_value = Mock(status_code=400, text='secret-provider-body')
        with self.assertRaises(TransbankTransaccionException) as error:
            adapter.iniciar_transaccion('audit', 'audit', 1, 'http://localhost:5173')
        self.assertNotIn('secret-provider-body', str(error.exception))
        post.side_effect = requests.ConnectionError('secret-token-url')
        with self.assertRaises(TransbankTransaccionException) as error:
            adapter.iniciar_transaccion('audit', 'audit', 1, 'http://localhost:5173')
        self.assertNotIn('secret-token-url', str(error.exception))
