"""Regresión QA: calendario de retiro y contrato aditivo de checkout, sin datos comerciales."""
from copy import deepcopy
from datetime import datetime, timezone
from unittest.mock import patch
from uuid import uuid4

from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.core.pickup import validate_pickup_selection
from apps.core.models import ConfiguracionPago, Pedido
from apps.core.payments import TRANSFER_PUBLIC_FIELDS
from apps.core import test_pickup


class PickupCalendarTests(SimpleTestCase):
    def setUp(self):
        self.pickup = {'enabled': True, 'version': 2, 'hours': {
            'mon': {'enabled': True, 'start': '09:15', 'end': '18:10'},
        }}
        self.now = datetime(2026, 10, 26, 12, 30, 20, tzinfo=timezone.utc)  # 09:30 Chile

    def test_selection_with_exact_minutes_and_chile_zone(self):
        for hour in ('09:31', '10:07', '18:10'):
            result = validate_pickup_selection(self.pickup, {'fecha': '2026-10-26', 'hora': hour}, self.now)
            self.assertEqual(result, {'fecha': '2026-10-26', 'hora': hour, 'zona_horaria': 'America/Santiago'})

    def test_closed_outside_past_and_invalid_calendar_rejected(self):
        for date, hour in [('2026-10-26', '09:30'), ('2026-10-26', '09:14'), ('2026-10-26', '18:11'),
                           ('2026-10-27', '10:00'), ('2026-10-19', '10:00'), ('2026-02-30', '10:00'),
                           ('2026-10-26', '24:00'), ('26/10/2026', '10:00')]:
            with self.subTest(date=date, hour=hour), self.assertRaises(ValidationError):
                validate_pickup_selection(self.pickup, {'fecha': date, 'hora': hour}, self.now)
        self.assertIsNone(validate_pickup_selection(self.pickup, None, self.now))

    def test_daylight_saving_skipped_minutes_are_not_valid_pickup_times(self):
        pickup = {'enabled': True, 'version': 2, 'hours': {'sun': {'enabled': True, 'start': '00:00', 'end': '02:00'}}}
        now = datetime(2026, 9, 1, tzinfo=timezone.utc)
        with self.assertRaises(ValidationError):
            validate_pickup_selection(pickup, {'fecha': '2026-09-06', 'hora': '00:30'}, now)
        self.assertEqual(validate_pickup_selection(pickup, {'fecha': '2026-09-06', 'hora': '01:30'}, now)['hora'], '01:30')


class PickupCheckoutSelectionTests(TestCase):
    setUp = test_pickup.PickupTests.setUp
    save = test_pickup.PickupTests.save

    def test_snapshot_retries_and_rejection_before_stock_changes(self):
        self.save()
        ConfiguracionPago.objects.create(tienda=self.store, datos={'transfer': {'enabled': True,
            'fields': {field: 'qa-fixture' for field in TRANSFER_PUBLIC_FIELDS}}})
        payload = {'clave_checkout': str(uuid4()), 'items': [{'producto_id': 'prod', 'sku': 'SKU', 'cantidad': 1}],
                   'contacto': {'nombre': 'QA', 'email': 'qa@example.test'}, 'medio_pago': 'Transferencia',
                   'metodo_entrega': 'Retiro', 'retiro_seleccion': {'fecha': '2026-10-26', 'hora': '10:07'}}
        api = APIClient()
        with patch('apps.core.pickup.timezone.now', return_value=datetime(2026, 10, 26, 12, 30, tzinfo=timezone.utc)), \
                patch('apps.core.presentation.checkout.ProductRepository') as repository:
            repository.return_value.get_by_id.return_value = {'_id': 'prod', 'nombre': 'QA', 'activo': True,
                'variantes': [{'sku': 'SKU', 'precio': 1000, 'stock': 5}]}
            repository.return_value.decrease_stock.return_value = True
            invalid = deepcopy(payload); invalid['retiro_seleccion']['hora'] = '08:00'
            self.assertEqual(api.post('/api/checkout/pedidos/', invalid, format='json').status_code, 400)
            self.assertFalse(Pedido.objects.exists())
            repository.return_value.decrease_stock.assert_not_called()
            first = api.post('/api/checkout/pedidos/', payload, format='json')
            self.assertEqual(first.status_code, 201, first.data)
            order = Pedido.objects.get()
            self.assertEqual(order.entrega['retiro']['seleccion'], {
                **payload['retiro_seleccion'], 'zona_horaria': 'America/Santiago'})
            self.assertEqual(order.costo_envio, 0)
            original = deepcopy(order.entrega)
            self.config['pickup']['hours']['mon']['end'] = '11:00'; self.save()
            order.refresh_from_db(); self.assertEqual(order.entrega, original)
            retry = api.post('/api/checkout/pedidos/', payload, format='json')
            self.assertEqual(retry.status_code, 200, retry.data)
            self.assertEqual(retry.data['data'], first.data['data'])
            repository.return_value.decrease_stock.assert_called_once()
