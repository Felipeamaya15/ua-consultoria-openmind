"""Provider outcomes are mocked; SQL transactions and seat accounting are real."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Event
from unittest.mock import patch

from django.db import close_old_connections, connection
from django.test import TestCase, TransactionTestCase, override_settings, skipUnlessDBFeature
from django.utils import timezone

from apps.catalog.domain.exceptions import (
    TransbankRechazoException, TransbankServicioNoDisponibleException,
)
from apps.core.models import Pedido
from apps.landing.models import ReservaActividadPagada
from apps.landing.paid_availability import availability
from apps.landing import test_activity_webpay_pilot as helpers
from apps.landing.webpay_activity_orders import META, process_order, reconcile_expired


class ReconciliationFixtures:
    setUp = helpers.WebpayActivityTests.setUp
    payload = helpers.WebpayActivityTests.payload
    post = helpers.WebpayActivityTests.post
    fixture = helpers.WebpayActivityTests.fixture
    approved = helpers.WebpayActivityTests.approved

    def expire(self, order):
        ReservaActividadPagada.objects.filter(clave_checkout=order.clave_checkout).update(
            vence=timezone.now() - timedelta(hours=2))

    def assert_held(self, order):
        order.refresh_from_db()
        self.assertEqual(order.estado, 'pendiente')
        self.assertEqual(ReservaActividadPagada.objects.get(
            clave_checkout=order.clave_checkout).estado, 'en_pago')
        self.assertEqual(availability(self.store, self.section)['cupos_disponibles'], 1)


@override_settings(DEBUG=True)
class WebpayReconciliationTests(ReconciliationFixtures, TestCase):
    def test_initialized_never_expires_by_elapsed_time_in_either_environment(self):
        order = self.fixture()
        self.expire(order)
        raw = {**self.approved(order), 'status': 'INITIALIZED'}
        for environment in ('INTEGRACION', 'PRODUCCION'):
            with self.subTest(environment=environment):
                order.entrega[META].update(ambiente=environment)
                order.entrega[META].pop('revision_en', None)
                order.save(update_fields=['entrega'])
                with patch('apps.landing.webpay_activity_orders.adapter_for') as adapter, patch(
                    'apps.landing.webpay_activity_orders.status_raw', return_value=raw):
                    self.assertEqual(reconcile_expired(order.pk, True), 'indeterminado')
                    adapter.return_value.confirmar_transaccion.assert_not_called()
                self.assert_held(order)
                self.assertTrue(order.entrega[META]['revision_pendiente'])

    def test_late_callback_can_confirm_initialized_before_activity_starts(self):
        order = self.fixture()
        self.expire(order)
        raw = self.approved(order)
        from apps.landing.webpay_activity_orders import normalize_status
        with patch('apps.landing.webpay_activity_orders.adapter_for') as adapter, patch(
            'apps.landing.webpay_activity_orders.status_raw', return_value={**raw, 'status': 'INITIALIZED'}):
            adapter.return_value.confirmar_transaccion.return_value = normalize_status(raw)
            self.assertEqual(process_order(order.pk, callback_token=order.webpay_token)[0], 'pagado')
            self.assertEqual(process_order(order.pk, callback_token=order.webpay_token)[0], 'pagado')
            adapter.return_value.confirmar_transaccion.assert_called_once_with(token_ws=order.webpay_token)
        self.assertEqual(ReservaActividadPagada.objects.get().estado, 'confirmada')

    def terminal(self, state):
        order = self.fixture()
        self.expire(order)
        raw = {**self.approved(order), 'status': state, 'response_code': -1}
        with patch('apps.landing.webpay_activity_orders.adapter_for') as adapter, patch(
            'apps.landing.webpay_activity_orders.status_raw', return_value=raw) as status:
            self.assertEqual(process_order(order.pk)[0], 'cancelado')
            self.assertEqual(process_order(order.pk, callback_token=order.webpay_token)[0], 'omitido')
            self.assertEqual(status.call_count, 1)
            adapter.return_value.confirmar_transaccion.assert_not_called()
        order.refresh_from_db()
        self.assertEqual(order.estado, 'cancelado')
        self.assertEqual(ReservaActividadPagada.objects.get().estado, 'liberada')
        self.assertEqual(availability(self.store, self.section)['cupos_disponibles'], 3)

    def test_failed_releases(self):
        self.terminal('FAILED')

    def test_reversed_releases(self):
        self.terminal('REVERSED')

    def test_nullified_releases(self):
        self.terminal('NULLIFIED')

    def test_status_communication_failure_retains_seats_and_records_review(self):
        order = self.fixture()
        self.expire(order)
        with patch('apps.landing.webpay_activity_orders.adapter_for'), patch(
            'apps.landing.webpay_activity_orders.status_raw',
            side_effect=TransbankServicioNoDisponibleException('Unavailable')):
            self.assertEqual(process_order(order.pk)[0], 'indeterminado')
        self.assert_held(order)
        self.assertTrue(order.entrega[META]['revision_pendiente'])

    def test_commit_timeout_then_late_authorization_is_not_committed_twice(self):
        order = self.fixture()
        self.expire(order)
        raw = self.approved(order)
        with patch('apps.landing.webpay_activity_orders.adapter_for') as adapter, patch(
            'apps.landing.webpay_activity_orders.status_raw', side_effect=[
                {**raw, 'status': 'INITIALIZED'}, raw]):
            adapter.return_value.confirmar_transaccion.side_effect = TransbankServicioNoDisponibleException('Timeout')
            self.assertEqual(process_order(order.pk, callback_token=order.webpay_token)[0], 'indeterminado')
            self.assert_held(order)
            self.assertEqual(process_order(order.pk, callback_token=order.webpay_token)[0], 'pagado')
            self.assertEqual(adapter.return_value.confirmar_transaccion.call_count, 1)
        order.refresh_from_db()
        self.assertFalse(order.entrega[META]['revision_pendiente'])

    def test_commit_rejection_alone_does_not_release_without_verified_terminal_status(self):
        order = self.fixture()
        raw = {**self.approved(order), 'status': 'INITIALIZED'}
        with patch('apps.landing.webpay_activity_orders.adapter_for') as adapter, patch(
            'apps.landing.webpay_activity_orders.status_raw', return_value=raw):
            adapter.return_value.confirmar_transaccion.side_effect = TransbankRechazoException('Rejected')
            self.assertEqual(process_order(order.pk, callback_token=order.webpay_token)[0], 'indeterminado')
        self.assert_held(order)

    def test_repeated_callback_after_uncertain_commit_only_consults(self):
        order = self.fixture()
        raw = {**self.approved(order), 'status': 'INITIALIZED'}
        with patch('apps.landing.webpay_activity_orders.adapter_for') as adapter, patch(
            'apps.landing.webpay_activity_orders.status_raw', return_value=raw) as status:
            adapter.return_value.confirmar_transaccion.side_effect = TransbankServicioNoDisponibleException('Timeout')
            for _ in range(2):
                self.assertEqual(process_order(order.pk, callback_token=order.webpay_token)[0], 'indeterminado')
            self.assertEqual(status.call_count, 2)
            self.assertEqual(adapter.return_value.confirmar_transaccion.call_count, 1)
        self.assert_held(order)

    def test_consult_false_never_releases_started_transaction(self):
        order = self.fixture()
        self.expire(order)
        with patch('apps.landing.webpay_activity_orders.adapter_for') as adapter:
            self.assertEqual(reconcile_expired(order.pk, False), 'espera')
            adapter.assert_not_called()
        self.assert_held(order)

    def test_unknown_state_and_unapproved_authorized_remain_in_review(self):
        order = self.fixture()
        for state in ('UNKNOWN', 'AUTHORIZED', 'PARTIALLY_NULLIFIED'):
            with self.subTest(state=state), patch('apps.landing.webpay_activity_orders.adapter_for'), patch(
                'apps.landing.webpay_activity_orders.status_raw',
                return_value={**self.approved(order), 'status': state, 'response_code': -1}):
                self.assertEqual(process_order(order.pk, callback_token=order.webpay_token)[0], 'indeterminado')
                self.assert_held(order)

    def test_started_activity_does_not_commit_but_can_reconcile_existing_authorization(self):
        order = self.fixture()
        ReservaActividadPagada.objects.filter(clave_checkout=order.clave_checkout).update(
            inicio=timezone.now() - timedelta(minutes=1))
        raw = self.approved(order)
        with patch('apps.landing.webpay_activity_orders.adapter_for') as adapter, patch(
            'apps.landing.webpay_activity_orders.status_raw', side_effect=[
                {**raw, 'status': 'INITIALIZED'}, raw]):
            self.assertEqual(process_order(order.pk, callback_token=order.webpay_token)[0], 'indeterminado')
            adapter.return_value.confirmar_transaccion.assert_not_called()
            self.assert_held(order)
            self.assertEqual(process_order(order.pk, callback_token=order.webpay_token)[0], 'pagado')


@override_settings(DEBUG=True)
class WebpayConcurrencyTests(ReconciliationFixtures, TransactionTestCase):
    @skipUnlessDBFeature('has_select_for_update')
    def test_expirator_and_callback_serialize_and_confirm_only_once(self):
        order = self.fixture()
        self.expire(order)
        queried = Event()
        release = Event()
        callback_started = Event()

        def provider(*args):
            queried.set()
            if not release.wait(10):
                raise AssertionError('Provider synchronization timed out')
            return self.approved(order)

        def run(callback=False):
            close_old_connections()
            try:
                if callback:
                    callback_started.set()
                return process_order(order.pk, **({'callback_token': order.webpay_token} if callback else {}))[0]
            finally:
                connection.close()

        with patch('apps.landing.webpay_activity_orders.adapter_for') as adapter, patch(
            'apps.landing.webpay_activity_orders.status_raw', side_effect=provider) as status:
            with ThreadPoolExecutor(max_workers=2) as pool:
                worker = pool.submit(run)
                try:
                    self.assertTrue(queried.wait(10))
                    callback = pool.submit(run, True)
                    self.assertTrue(callback_started.wait(10))
                finally:
                    release.set()
                self.assertEqual(worker.result(timeout=15), 'pagado')
                self.assertEqual(callback.result(timeout=15), 'pagado')
            self.assertEqual(status.call_count, 1)
            adapter.return_value.confirmar_transaccion.assert_not_called()
        order.refresh_from_db()
        self.assertEqual(order.estado, 'pagado')
        self.assertEqual(ReservaActividadPagada.objects.get().estado, 'confirmada')
