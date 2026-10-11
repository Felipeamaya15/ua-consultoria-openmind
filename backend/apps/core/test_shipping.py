from copy import deepcopy
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.core import signing
from django.test import TestCase, SimpleTestCase
from django.urls import resolve
from rest_framework.test import APIClient

from apps.core.delivery import delivery_defaults
from apps.core.models import ConfiguracionEntrega, ConfiguracionPago, Tienda, Pedido
from apps.core.payments import TRANSFER_PUBLIC_FIELDS
from apps.core.shipping import QUOTE_SALT
from apps.catalog.infrastructure.adapters.chilexpress_response import procesar_respuesta_chilexpress
from apps.catalog.infrastructure.adapters.starken_response import procesar_respuesta_starken


class ShippingQuoteTests(TestCase):
    url = '/api/entregas/cotizacion/'
    checkout_url = '/api/checkout/pedidos/'

    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='shipping-owner', is_staff=True)
        self.store = Tienda.objects.create(nombre='Tarifas', id_usuario_propietario=self.owner)
        self.api = APIClient()
        self.data = delivery_defaults()
        for carrier, amount in (('chilexpress', 4500), ('starken', 6900)):
            self.data[carrier].update(enabled=True, tarifas=[
                {'region': 'Metropolitana de Santiago', 'comuna': 'Providencia', 'monto': amount, 'plazo_dias': 2},
                {'region': 'Valparaíso', 'comuna': 'Viña del Mar', 'monto': amount + 1000, 'plazo_dias': None},
            ])
        self.data['pickup'] = {'enabled': True, 'address': 'Local 123', 'schedule': '9 a 18'}
        self.config = ConfiguracionEntrega.objects.create(tienda=self.store, datos=self.data)
        ConfiguracionPago.objects.create(tienda=self.store, datos={'transfer': {'enabled': True,
            'fields': {field: 'qa' for field in TRANSFER_PUBLIC_FIELDS}}})
        self.request = {'operador': 'Chilexpress', 'region': 'Metropolitana', 'comuna': 'Providencia'}
        self.order = {
            'clave_checkout': str(uuid4()), 'items': [{'producto_id': 'product', 'sku': 'QA', 'cantidad': 1}],
            'contacto': {'nombre': 'Buyer', 'email': 'buyer@example.com'},
            'medio_pago': 'Transferencia', 'metodo_entrega': 'Chilexpress',
            'direccion': {'street': 'Calle', 'number': '123', 'apt': '1', 'city': 'Providencia', 'region': 'Metropolitana'},
        }
        patcher = patch('apps.core.presentation.checkout.ProductRepository')
        self.repository_class = patcher.start()
        self.addCleanup(patcher.stop)
        self.repository = self.repository_class.return_value
        self.repository.get_by_id.return_value = {'_id': 'product', 'nombre': 'Producto', 'activo': True,
            'variantes': [{'sku': 'QA', 'precio': 60000, 'stock': 10}]}
        self.repository.decrease_stock.return_value = True

    def quote(self, **changes):
        return self.api.post(self.url, {**self.request, **changes}, format='json')

    def submit(self, **changes):
        return self.api.post(self.checkout_url, {**self.order, **changes}, format='json')

    def token(self, **changes):
        reply = self.quote(**changes)
        self.assertEqual(reply.status_code, 200, reply.data)
        return reply.data['data']['tarifas'][0]['cotizacion']

    def test_chilexpress_quote_contract_and_adapter(self):
        self.assertEqual(resolve(self.url).url_name, 'entregas-cotizacion')
        with patch('apps.core.shipping.procesar_respuesta_chilexpress', wraps=procesar_respuesta_chilexpress) as adapter:
            response = self.quote()
        self.assertEqual(response.status_code, 200, response.data)
        quote = response.data['data']['tarifas'][0]
        self.assertEqual(quote['monto'], '4500')
        self.assertEqual(quote['moneda'], 'CLP')
        self.assertEqual(quote['origen'], 'configuracion_tienda')
        self.assertEqual(quote['region'], 'Metropolitana de Santiago')
        signed = signing.loads(quote['cotizacion'], salt=QUOTE_SALT)
        self.assertEqual(signed['tienda'], self.store.pk)
        adapter.assert_called_once()

    def test_starken_uses_own_rate_and_adapter(self):
        with patch('apps.core.shipping.procesar_respuesta_starken', wraps=procesar_respuesta_starken) as adapter:
            response = self.quote(operador='Starken')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data']['tarifas'][0]['monto'], '6900')
        adapter.assert_called_once()

    def test_disabled_carrier_is_rejected(self):
        self.config.datos['chilexpress']['enabled'] = False
        self.config.save()
        self.assertEqual(self.quote().status_code, 400)

    def test_invalid_carrier_and_pickup_are_rejected(self):
        for carrier in ('Retiro', 'pickup', 'Otro', '', None):
            self.assertEqual(self.quote(operador=carrier).status_code, 400)

    def test_region_and_commune_are_validated_together(self):
        for changes in ({'region': ''}, {'region': 'inventada'}, {'comuna': 'inventada'},
                        {'region': 'Valparaíso'}, {'comuna': ''}):
            self.assertEqual(self.quote(**changes).status_code, 400)

    def test_client_store_ids_cannot_select_store(self):
        for key in ('tienda_id', 'store_id', 'merchant_id'):
            for value in (self.store.pk, self.store.pk + 1):
                self.assertEqual(self.quote(**{key: value}).status_code, 400)
        self.assertEqual(self.api.post(self.url, self.request, format='json',
                                      HTTP_X_TIENDA_ID=str(self.store.pk + 1)).status_code, 400)

    def test_multiple_stores_fail_closed(self):
        Tienda.objects.create(nombre='Other', id_usuario_propietario=self.owner)
        self.assertEqual(self.quote().status_code, 503)

    def test_missing_configuration_has_no_tariff(self):
        self.config.delete()
        self.assertEqual(self.quote().status_code, 400)

    def test_missing_rate_has_no_fallback(self):
        self.assertEqual(self.quote(comuna='Santiago').status_code, 400)
        self.assertEqual(self.submit(cotizacion='missing').status_code, 400)
        self.repository_class.assert_not_called()
        self.assertFalse(Pedido.objects.exists())

    def test_malformed_stored_rate_has_no_fallback(self):
        for amount in (None, -1, '4500', True, 4500.5):
            self.config.datos['chilexpress']['tarifas'][0]['monto'] = amount
            self.config.save()
            self.assertEqual(self.quote().status_code, 400)

    def test_malformed_stored_destination_is_rejected_without_internal_error(self):
        self.config.datos['chilexpress']['tarifas'][0]['region'] = {'invalid': True}
        self.config.save()
        self.assertEqual(self.quote().status_code, 400)

    def test_adapter_error_is_public_and_does_not_leak(self):
        with patch('apps.core.shipping.procesar_respuesta_chilexpress', side_effect=ValueError('SECRET/internal-path')):
            response = self.quote()
        self.assertEqual(response.status_code, 400)
        self.assertNotIn('SECRET', str(response.data))
        self.assertNotIn('3490', str(response.data))

    def test_order_saves_quoted_amount_and_destination_even_above_50000(self):
        response = self.submit(cotizacion=self.token(), codigo_promocional='VERANO20')
        self.assertEqual(response.status_code, 201, response.data)
        order = Pedido.objects.get()
        self.assertEqual(order.costo_envio, Decimal(4500))
        self.assertEqual(order.descuento, Decimal(12000))
        self.assertEqual(order.monto_total, Decimal(52500))
        self.assertEqual(order.entrega['metodo'], 'Chilexpress')
        self.assertEqual(order.entrega['direccion'], self.order['direccion'])
        self.assertEqual(order.entrega['cotizacion']['monto'], '4500')
        self.assertEqual(response.data['data']['costo_envio'], '4500.00')

    def test_starken_checkout_saves_own_amount(self):
        response = self.submit(metodo_entrega='Starken', cotizacion=self.token(operador='Starken'))
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Pedido.objects.get().costo_envio, 6900)

    def test_client_cost_is_rejected_without_order_or_reservation(self):
        self.assertEqual(self.submit(cotizacion=self.token(), costo_envio=1).status_code, 400)
        self.repository_class.assert_not_called()
        self.assertFalse(Pedido.objects.exists())

    def test_missing_tampered_and_expired_tokens_are_rejected(self):
        valid = self.token()
        expired = signing.loads(valid, salt=QUOTE_SALT)
        expired['vence_en'] = 1
        for token in ('', valid + 'tampered', signing.dumps(expired, salt=QUOTE_SALT)):
            self.assertEqual(self.submit(cotizacion=token).status_code, 400)
        with patch('django.core.signing.time.time', return_value=10):
            timestamp_expired = signing.dumps({**expired, 'vence_en': 9999999999}, salt=QUOTE_SALT)
        self.assertEqual(self.submit(cotizacion=timestamp_expired).status_code, 400)
        self.assertEqual(self.submit().status_code, 400)
        self.repository_class.assert_not_called()

    def test_other_store_token_is_rejected(self):
        original_token = self.token()
        signed = signing.loads(original_token, salt=QUOTE_SALT)
        signed['tienda'] = self.store.pk + 1
        self.assertEqual(self.submit(cotizacion=signing.dumps(signed, salt=QUOTE_SALT)).status_code, 400)
        self.assertFalse(Pedido.objects.exists())

    def test_destination_and_operator_changes_reject_old_token(self):
        token = self.token()
        for changes in ({'metodo_entrega': 'Starken'}, {'direccion': {**self.order['direccion'], 'city': 'Santiago'}},
                        {'direccion': {**self.order['direccion'], 'region': 'Valparaíso', 'city': 'Viña del Mar'}}):
            self.assertEqual(self.submit(cotizacion=token, **changes).status_code, 400)
        self.repository_class.assert_not_called()

    def test_changed_or_removed_rate_invalidates_quote_before_stock(self):
        token = self.token()
        self.config.datos['chilexpress']['tarifas'][0]['monto'] = 9000
        self.config.save()
        self.assertEqual(self.submit(cotizacion=token).status_code, 400)
        self.config.datos['chilexpress']['tarifas'] = []
        self.config.save()
        self.assertEqual(self.submit(cotizacion=token).status_code, 400)
        self.repository_class.assert_not_called()

    def test_disabled_after_quote_rejects_checkout(self):
        token = self.token()
        self.config.datos['chilexpress']['enabled'] = False
        self.config.save()
        self.assertEqual(self.submit(cotizacion=token).status_code, 400)
        self.repository_class.assert_not_called()

    def test_pickup_needs_no_quote_or_address_and_preserves_store_details(self):
        order = {key: value for key, value in self.order.items() if key != 'direccion'}
        order['metodo_entrega'] = 'Retiro'
        with patch('apps.core.presentation.checkout.validate_quote') as quote:
            response = self.api.post(self.checkout_url, order, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        quote.assert_not_called()
        saved = Pedido.objects.get()
        self.assertEqual(saved.costo_envio, 0)
        self.assertEqual(saved.monto_total, 60000)
        self.assertEqual(response.data['data']['costo_envio'], '0.00')
        self.assertEqual(saved.entrega['retiro'], {'address': 'Local 123', 'schedule': '9 a 18'})

    def test_pickup_ignores_a_forged_shipping_quote_and_remains_free(self):
        carrier_quote = self.token()
        response = self.submit(
            clave_checkout=str(uuid4()),
            metodo_entrega='Retiro',
            cotizacion=carrier_quote,
        )

        self.assertEqual(response.status_code, 201, response.data)
        saved = Pedido.objects.get()
        self.assertEqual(saved.costo_envio, Decimal('0.00'))
        self.assertEqual(saved.monto_total, Decimal('60000.00'))
        self.assertNotIn('cotizacion', saved.entrega)

    def test_retry_preserves_original_price_without_second_reservation(self):
        token = self.token()
        first = self.submit(cotizacion=token)
        self.config.datos['chilexpress']['tarifas'][0]['monto'] = 9000
        self.config.save()
        retry = self.submit(cotizacion=self.token())
        self.assertEqual(retry.status_code, 200, retry.data)
        self.assertEqual(retry.data['data'], first.data['data'])
        self.repository.decrease_stock.assert_called_once()

    def test_owner_configures_tariffs_public_quote_uses_saved_configuration(self):
        self.api.force_authenticate(self.owner)
        data = deepcopy(self.data)
        data['chilexpress']['tarifas'][0]['monto'] = 8100
        response = self.api.put('/api/entregas/configuracion/', data, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.api.force_authenticate(None)
        self.assertEqual(self.quote().data['data']['tarifas'][0]['monto'], '8100')

    def test_invalid_configuration_is_rejected_and_current_rates_preserved(self):
        self.api.force_authenticate(self.owner)
        base = self.data['chilexpress']['tarifas'][0]
        for rates in ([base, base], [{**base, 'monto': -1}], [{**base, 'monto': 1.5}],
                      [{**base, 'region': 'Valparaíso'}], [{**base, 'plazo_dias': 0}], [{**base, 'extra': 1}],
                      [{'region': base['region'], 'comuna': base['comuna']}], [{'monto': 4500}], [{}]):
            response = self.api.patch('/api/entregas/configuracion/', {'chilexpress': {'tarifas': rates}}, format='json')
            self.assertEqual(response.status_code, 400, response.data)
        self.config.refresh_from_db()
        self.assertEqual(self.config.datos, self.data)

    def test_explicit_zero_rate_is_valid(self):
        self.config.datos['chilexpress']['tarifas'][0]['monto'] = 0
        self.config.save()
        self.assertEqual(self.submit(cotizacion=self.token()).status_code, 201)
        self.assertEqual(Pedido.objects.get().costo_envio, 0)


class LogisticsResponseTests(SimpleTestCase):
    def test_chilexpress_normalizer_uses_lowest_service(self):
        quote = procesar_respuesta_chilexpress({'data': {'courierServiceOptions': [
            {'serviceValue': '6200'}, {'serviceValue': '4500'}]}})
        self.assertEqual(quote['monto'], 4500)

    def test_starken_normalizer_preserves_days(self):
        self.assertEqual(procesar_respuesta_starken({'valor': '6900', 'plazo_entrega': '3'})['plazo_dias'], 3)

    def test_invalid_chilexpress_response_is_rejected(self):
        with self.assertRaises(ValueError):
            procesar_respuesta_chilexpress({})

    def test_invalid_starken_response_is_rejected(self):
        with self.assertRaises(ValueError):
            procesar_respuesta_starken({'valor': -1})
