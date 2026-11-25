from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

from django.db import close_old_connections, connection
from django.test import TransactionTestCase, override_settings, skipUnlessDBFeature
from rest_framework.exceptions import ValidationError

from apps.landing import test_unified_activity_orders as helpers
from apps.landing.models import ReservaActividadPagada
from apps.landing.paid_availability import availability, reserve_activity


@override_settings(DEBUG=True)
class PaidReservationConcurrencyTests(TransactionTestCase):
    setUp = helpers.UnifiedOrderDBTests.setUp

    @skipUnlessDBFeature('has_select_for_update')
    def test_concurrent_buyers_cannot_reserve_four_of_three_seats(self):
        version = availability(self.store, self.section)['version']
        ready = Barrier(2)

        def reserve():
            close_old_connections()
            try:
                ready.wait(timeout=10)
                reserve_activity(self.store, self.section, checkout_key=uuid4(),
                    quantity=2, accepted_version=version)
                return 'reserved'
            except ValidationError:
                return 'full'
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: reserve(), range(2)))
        self.assertCountEqual(results, ['reserved', 'full'])
        self.assertEqual(ReservaActividadPagada.objects.count(), 1)
        self.assertEqual(availability(self.store, self.section)['cupos_disponibles'], 1)
