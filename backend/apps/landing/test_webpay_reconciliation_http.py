"""Opt-in HTTP simulation; never connects to a payment provider."""
import os
from unittest import skipUnless
from unittest.mock import patch

import requests
from django.test import TestCase, override_settings

from apps.catalog.infrastructure.adapters.transbank_adapter import TransbankWebpayAdapter
from apps.landing import test_webpay_activity_reconciliation as helpers
from apps.landing.webpay_activity_orders import process_order

SIMULATION = os.environ.get('OPENMIND_WEBPAY_SIMULATION') == '1'
BASE = 'http://127.0.0.1:55442/transbank'


@skipUnless(SIMULATION, 'Requires local Postman simulation on port 55442')
@override_settings(DEBUG=True)
class WebpayHTTPSimulationTests(helpers.ReconciliationFixtures, TestCase):
    def seed(self, order, status='INITIALIZED', **options):
        response = requests.post(BASE + '/__qa/transactions', json={
            'token': order.webpay_token,
            'response': {**self.approved(order), 'status': status}, **options,
        }, timeout=5)
        response.raise_for_status()
        adapter = TransbankWebpayAdapter('synthetic-commerce', 'synthetic-key', 'INTEGRACION')
        adapter.base_url = BASE + '/transactions'
        return patch('apps.landing.webpay_activity_orders.adapter_for', return_value=adapter)

    def counts(self, order):
        response = requests.get(BASE + '/__qa/transactions/' + order.webpay_token, timeout=5)
        response.raise_for_status()
        return response.json()

    def test_commit_and_repeated_return_use_real_http_once(self):
        order = self.fixture()
        self.expire(order)
        with self.seed(order):
            for _ in range(2):
                self.assertEqual(process_order(order.pk, callback_token=order.webpay_token)[0], 'pagado')
        self.assertEqual(self.counts(order), {'gets': 1, 'puts': 1})

    def test_worker_reconciles_authorized_without_commit(self):
        order = self.fixture()
        self.expire(order)
        with self.seed(order, 'AUTHORIZED'):
            self.assertEqual(process_order(order.pk)[0], 'pagado')
        self.assertEqual(self.counts(order), {'gets': 1, 'puts': 0})

    def test_get_503_retains_seats(self):
        order = self.fixture()
        self.expire(order)
        with self.seed(order, getStatus=503):
            self.assertEqual(process_order(order.pk)[0], 'indeterminado')
        self.assert_held(order)
        self.assertEqual(self.counts(order), {'gets': 1, 'puts': 0})

    def test_uncertain_commit_is_not_repeated(self):
        order = self.fixture()
        self.expire(order)
        with self.seed(order, commitStatus=503):
            for _ in range(2):
                self.assertEqual(process_order(order.pk, callback_token=order.webpay_token)[0], 'indeterminado')
        self.assert_held(order)
        self.assertEqual(self.counts(order), {'gets': 2, 'puts': 1})

    def test_failed_releases_after_real_http_status(self):
        from apps.landing.models import ReservaActividadPagada
        order = self.fixture()
        self.expire(order)
        with self.seed(order, 'FAILED'):
            self.assertEqual(process_order(order.pk)[0], 'cancelado')
        self.assertEqual(ReservaActividadPagada.objects.get().estado, 'liberada')
        self.assertEqual(self.counts(order), {'gets': 1, 'puts': 0})
