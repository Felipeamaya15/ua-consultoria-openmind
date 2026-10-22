"""Membership by Santiago calendar dates; isolated fixtures, never commercial orders."""
from collections import Counter
from datetime import date, datetime, timedelta, timezone as dt_timezone
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.test import TestCase, SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import Pedido, Tienda

ZONA = ZoneInfo('America/Santiago')
UTC = dt_timezone.utc
HISTORY = '/api/tienda/ventas/historial/'
ORDERS = '/api/tienda/pedidos/historial/'
REPORTS = '/api/tienda/informes/'
DASHBOARD = '/api/tienda/dashboard/'


@override_settings(TIME_ZONE='UTC')
class BusinessPeriodConsistencyTests(TestCase):
    def setUp(self):
        users = get_user_model()
        self.owner = users.objects.create_user(username='period-owner')
        self.other = users.objects.create_user(username='period-other')
        self.store = Tienda.objects.create(nombre='Tienda QA períodos', id_usuario_propietario=self.owner)
        self.api = APIClient()
        self.api.force_authenticate(self.owner)
        clock = patch('django.utils.timezone.now', return_value=datetime(2027, 12, 31, 15, tzinfo=UTC))
        clock.start()
        self.addCleanup(clock.stop)

    def order(self, instant, amount='1000.00', state='pagado', assigned=True):
        parsed = datetime.fromisoformat(instant) if isinstance(instant, str) else instant
        self.assertIsNotNone(parsed.utcoffset())
        obj = Pedido.objects.create(tienda=self.store if assigned else None, estado=state,
                                    monto_total=amount, correo_contacto='qa@example.test')
        Pedido.objects.filter(pk=obj.pk).update(fecha_creacion=parsed)
        return obj

    def get(self, url, params):
        response = self.api.get(url, params)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response['Cache-Control'], 'no-store')
        return response.json()['data']

    def daily(self, day, count, amount=None):
        params = {'fecha_desde': day, 'fecha_hasta': day}
        history = self.get(HISTORY, {**params, 'agrupacion': 'dia'})
        orders_response = self.api.get(ORDERS, params)
        self.assertEqual(orders_response.status_code, 200)
        self.assertEqual(orders_response.json()['paginacion']['total'], count)
        dashboard = self.get(DASHBOARD, params)
        expected_amount = amount if amount is not None else format(Decimal(count) * 1000, '.2f')
        self.assertEqual(history['resumen']['cantidad_ventas'], count)
        self.assertEqual(history['resumen']['total_vendido'], expected_amount)
        self.assertEqual(dashboard['total_ventas'], expected_amount)
        self.assertEqual(dashboard['total_pedidos'], count)
        self.assertEqual(dashboard['pedidos_pagados'], count)
        self.assertEqual(dashboard['historico'], [{'fecha': day, 'ventas': expected_amount, 'pedidos': count}])
        self.assertEqual(history['serie'], ([{'periodo': day, 'cantidad_ventas': count, 'total_vendido': expected_amount}] if count else []))
        return history, dashboard

    def test_month_boundary(self):
        self.order('2026-11-01T01:30:00+00:00')  # still October in Santiago
        history = self.get(HISTORY, {'fecha_desde': '2026-11-01', 'fecha_hasta': '2026-11-30'})
        november = self.get(REPORTS, {'anio': 2026, 'mes': 11})
        self.assertEqual(history['resumen']['cantidad_ventas'], november['pedidos_pagados'])
        self.assertEqual(november['pedidos_pagados'], 0)

    def monthly(self, year, month, expected):
        from calendar import monthrange
        start = date(year, month, 1).isoformat()
        end = date(year, month, monthrange(year, month)[1]).isoformat()
        history = self.get(HISTORY, {'fecha_desde': start, 'fecha_hasta': end, 'agrupacion': 'mes'})
        dashboard = self.get(DASHBOARD, {'fecha_desde': start, 'fecha_hasta': end})
        report = self.get(REPORTS, {'anio': year, 'mes': month})
        self.assertEqual(history['resumen']['cantidad_ventas'], expected)
        for key in ('total_pedidos', 'pedidos_pagados'):
            self.assertEqual(dashboard[key], expected)
            self.assertEqual(report[key], expected)
        self.assertEqual(dashboard['total_ventas'], history['resumen']['total_vendido'])
        self.assertEqual(report['total_ventas'], dashboard['total_ventas'])
        if expected:
            self.assertEqual(history['serie'][0]['periodo'], f'{year}-{month:02d}')
        self.assertEqual(sum(Decimal(row['ventas']) for row in dashboard['historico']), Decimal(report['total_ventas']))
        return report

    def test_summer_midnight_and_exclusive_end_with_microseconds(self):
        for instant in ('2026-10-10T02:59:59.999999+00:00', '2026-10-10T03:00:00+00:00',
                        '2026-10-11T02:59:59.999999+00:00', '2026-10-11T03:00:00+00:00'):
            self.order(instant)
        self.daily('2026-10-09', 1)
        self.daily('2026-10-10', 2)
        self.daily('2026-10-11', 1)

    def test_winter_midnight_uses_utc_minus_four(self):
        self.order('2026-07-01T03:59:59.999999+00:00')
        self.order('2026-07-01T04:00:00+00:00')
        self.daily('2026-06-30', 1)
        self.daily('2026-07-01', 1)
        self.monthly(2026, 6, 1)
        self.monthly(2026, 7, 1)

    def test_month_last_instant_next_month_and_annual_sum(self):
        for instant in ('2026-11-01T01:30:00+00:00', '2026-11-01T02:59:59.999999+00:00',
                        '2026-11-01T03:00:00+00:00', '2026-12-01T02:59:59.999999+00:00',
                        '2026-12-01T03:00:00+00:00'):
            self.order(instant)
        for month, count in ((10, 2), (11, 2), (12, 1)):
            self.monthly(2026, month, count)
        annual = self.get(REPORTS, {'anio': 2026})
        self.assertEqual(annual['total_pedidos'], 5)
        self.assertEqual([r['pedidos'] for r in annual['meses']][-3:], [2, 2, 1])
        self.assertEqual(sum(r['pedidos'] for r in annual['meses']), annual['total_pedidos'])

    def test_year_boundary_and_annual_dashboard_consistency(self):
        for instant in ('2026-01-01T02:30:00+00:00', '2026-01-01T03:00:00+00:00',
                        '2027-01-01T02:59:59.999999+00:00', '2027-01-01T03:00:00+00:00'):
            self.order(instant)
        for year, count in ((2025, 1), (2026, 2), (2027, 1)):
            with self.subTest(year=year):
                params = {'fecha_desde': f'{year}-01-01', 'fecha_hasta': f'{year}-12-31'}
                history = self.get(HISTORY, params)
                dashboard = self.get(DASHBOARD, params)
                annual = self.get(REPORTS, {'anio': year})
                self.assertEqual(history['resumen']['cantidad_ventas'], count)
                self.assertEqual(annual['pedidos_pagados'], count)
                self.assertEqual(dashboard['pedidos_pagados'], count)
                self.assertEqual(annual['total_ventas'], dashboard['total_ventas'])
                self.assertEqual(history['resumen']['total_vendido'], annual['total_ventas'])
        self.monthly(2025, 12, 1)
        self.monthly(2026, 1, 1)
        self.monthly(2026, 12, 1)
        self.monthly(2027, 1, 1)

    def test_dst_forward_gap_has_no_omissions_or_double_membership(self):
        self.assert_hourly_ledger(datetime(2026, 9, 5, tzinfo=UTC))

    def test_dst_backward_fold_has_no_omissions_or_double_membership(self):
        self.assert_hourly_ledger(datetime(2026, 4, 4, tzinfo=UTC))

    def assert_hourly_ledger(self, start):
        instants = [start + timedelta(hours=i) for i in range(60)]
        expected = Counter(instant.astimezone(ZONA).date().isoformat() for instant in instants)
        created = {self.order(instant).pk for instant in instants}
        seen = []
        for day, count in sorted(expected.items()):
            self.daily(day, count)
            rows = self.get(ORDERS, {'fecha_desde': day, 'fecha_hasta': day, 'tamano': 100})
            seen.extend(row['id_pedido'] for row in rows)
        self.assertEqual(len(seen), len(set(seen)))
        self.assertEqual(set(seen), created)

    def test_both_repeated_2330_instants_belong_to_previous_day(self):
        first = datetime(2026, 4, 5, 2, 30, tzinfo=UTC)
        second = datetime(2026, 4, 5, 3, 30, tzinfo=UTC)
        self.assertEqual(first.astimezone(ZONA).replace(tzinfo=None), second.astimezone(ZONA).replace(tzinfo=None))
        self.assertEqual((first.astimezone(ZONA).fold, second.astimezone(ZONA).fold), (0, 1))
        self.order(first)
        self.order(second)
        self.daily('2026-04-04', 2)
        self.daily('2026-04-05', 0)

    def test_dst_comparison_counts_calendar_days_not_24_hour_windows(self):
        for i in range(47):
            self.order(datetime(2026, 9, 5, 4, tzinfo=UTC) + timedelta(hours=i))
        _, dashboard = self.daily('2026-09-06', 23)
        self.assertEqual(dashboard['comparacion']['total_pedidos'], 24)
        self.assertEqual(dashboard['comparacion']['total_ventas'], '24000.00')
        self.assertEqual(dashboard['comparacion']['variacion_ventas'], '-4.17')

    def test_timezone_activation_does_not_change_commercial_membership(self):
        self.order('2026-11-01T01:30:00+00:00')
        for active in ('UTC', 'Asia/Tokyo', 'Pacific/Honolulu'):
            with self.subTest(active=active), timezone.override(ZoneInfo(active)):
                self.monthly(2026, 10, 1)
                self.monthly(2026, 11, 0)
        self.assertEqual(str(timezone.get_default_timezone()), 'UTC')

    def test_monthly_and_annual_pdfs_use_exact_json_aggregate(self):
        from pypdf import PdfReader
        from apps.core.infrastructure.report_pdf import generar_pdf
        self.order('2026-11-01T01:30:00+00:00')
        self.order('2026-11-01T03:00:00+00:00', amount='2000.00')
        for params, label in (({'anio': 2026, 'mes': 10}, 'Octubre'),
                              ({'anio': 2026, 'mes': 11}, 'Noviembre'), ({'anio': 2026}, '2026')):
            expected = self.get(REPORTS, params)
            with patch('apps.core.infrastructure.report_pdf.generar_pdf', wraps=generar_pdf) as render:
                response = self.api.get(REPORTS + 'pdf/', params)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(render.call_count, 1)
            self.assertEqual(render.call_args.args[0], expected)
            self.assertEqual(str(render.call_args.args[1].tzinfo), 'America/Santiago')
            self.assertTrue(response.content.startswith(b'%PDF-'))
            reader = PdfReader(BytesIO(response.content))
            text = '\n'.join(page.extract_text() for page in reader.pages)
            self.assertIn(label, text)
            # QA de formato chileno: ISO se conserva en API y DD/MM/YYYY en PDF visible.
            self.assertIn(date.fromisoformat(expected['fecha_desde']).strftime('%d/%m/%Y'), text)
            self.assertIn(date.fromisoformat(expected['fecha_hasta']).strftime('%d/%m/%Y'), text)
            self.assertEqual(response['Cache-Control'], 'no-store')

    def test_zero_paid_contracts_and_rounding_remain_distinct(self):
        params = {'fecha_desde': '2026-10-01', 'fecha_hasta': '2026-10-31'}
        self.order('2026-11-01T01:30:00+00:00', state='pendiente')
        self.assertEqual(self.get(HISTORY, params)['resumen']['ticket_promedio'], '0.00')
        self.assertIsNone(self.get(DASHBOARD, params)['ticket_promedio'])
        self.assertIsNone(self.get(REPORTS, {'anio': 2026, 'mes': 10})['ticket_promedio'])
        for amount in ('10.00', '10.01'):
            self.order('2026-11-01T01:30:00+00:00', amount=amount)
        self.assertEqual(self.get(HISTORY, params)['resumen']['ticket_promedio'], '10.00')
        self.assertEqual(self.get(DASHBOARD, params)['ticket_promedio'], '10.01')
        self.assertEqual(self.get(REPORTS, {'anio': 2026, 'mes': 10})['ticket_promedio'], '10.01')

    def test_paid_states_order_totals_and_tenant_scope_stay_unchanged(self):
        for state, _ in Pedido.ESTADO_CHOICES:
            self.order('2026-11-01T01:30:00+00:00', state=state)
        self.order('2026-11-01T01:30:00+00:00', assigned=False, amount='9999999')
        params = {'fecha_desde': '2026-10-01', 'fecha_hasta': '2026-10-31'}
        history = self.get(HISTORY, params)
        dashboard = self.get(DASHBOARD, params)
        report = self.get(REPORTS, {'anio': 2026, 'mes': 10})
        paid = len([state for state, _ in Pedido.ESTADO_CHOICES if state in Pedido.ESTADOS_PAGADOS])
        self.assertEqual(history['resumen']['cantidad_ventas'], paid)
        self.assertEqual(dashboard['pedidos_pagados'], paid)
        self.assertEqual(report['pedidos_pagados'], paid)
        self.assertEqual(dashboard['total_pedidos'], len(Pedido.ESTADO_CHOICES))
        self.assertEqual(report['total_pedidos'], dashboard['total_pedidos'])
        self.assertEqual(report['total_ventas'], history['resumen']['total_vendido'])

    def test_invalid_calendar_ambiguous_parameters_and_unrepresentable_end(self):
        queries = ('fecha_desde=2026-02-30', 'fecha_hasta=9999-12-31',
                   'fecha_desde=0000-01-01', 'fecha_desde=2026-10-02&fecha_hasta=2026-10-01',
                   'fecha_desde=2026-04-04T23:30:00', 'fecha_desde=2026-09-06T00:30:00',
                   'fecha_desde=2026-10-01&fecha_desde=2026-11-01',
                   'fecha_hasta=2026-10-01&fecha_hasta=2026-11-01')
        for url in (HISTORY, ORDERS):
            for query in queries:
                with self.subTest(url=url, query=query):
                    self.assertEqual(self.api.get(url + '?' + query).status_code, 400)
        for params in ({'anio': '2026', 'mes': '13'}, {'anio': '0000'}, {'mes': ''}):
            for url in (REPORTS, REPORTS + 'pdf/'):
                self.assertEqual(self.api.get(url, params).status_code, 400)

    def test_one_sided_ranges_and_permissions_are_preserved(self):
        self.order('2026-11-01T01:30:00+00:00')
        self.order('2026-11-01T03:00:00+00:00')
        self.assertEqual(len(self.get(ORDERS, {'fecha_hasta': '2026-10-31'})), 1)
        self.assertEqual(len(self.get(ORDERS, {'fecha_desde': '2026-11-01'})), 1)
        self.assertEqual(len(self.get(ORDERS, {})), 2)
        for url in (HISTORY, ORDERS, DASHBOARD, REPORTS, REPORTS + 'pdf/'):
            self.assertEqual(APIClient().get(url).status_code, 401)
            self.api.force_authenticate(self.other)
            self.assertEqual(self.api.get(url).status_code, 403)
            self.api.force_authenticate(self.owner)
            self.assertEqual(self.api.get(url, {'tienda_id': self.store.pk + 1}).status_code, 400)


class BusinessCalendarBoundaryTests(SimpleTestCase):
    def test_utc_bounds_cover_23_and_25_hour_days(self):
        from apps.core.domain.periodos import limites_rango
        for start, hours, utc_start, utc_end in (
            (date(2026, 9, 6), 23, '2026-09-06T04:00:00+00:00', '2026-09-07T03:00:00+00:00'),
            (date(2026, 4, 4), 25, '2026-04-04T03:00:00+00:00', '2026-04-05T04:00:00+00:00'),
        ):
            with self.subTest(day=start):
                low, high = limites_rango(start, start)
                self.assertEqual(low.isoformat(), utc_start)
                self.assertEqual(high.isoformat(), utc_end)
                self.assertEqual(high - low, timedelta(hours=hours))

    def test_nonexistent_midnight_resolves_to_first_existing_hour(self):
        from apps.core.domain.periodos import inicio_dia_utc
        first = inicio_dia_utc(date(2026, 9, 6)).astimezone(ZONA)
        self.assertEqual((first.date(), first.hour), (date(2026, 9, 6), 1))
        previous = (inicio_dia_utc(date(2026, 9, 6)) - timedelta(microseconds=1)).astimezone(ZONA)
        self.assertEqual(previous.date(), date(2026, 9, 5))

    def test_adjacent_calendar_intervals_are_contiguous_across_transitions(self):
        from apps.core.domain.periodos import limites_rango
        for start in (date(2026, 4, 3), date(2026, 9, 5), date(2026, 12, 31)):
            previous = None
            for offset in range(4):
                day = start + timedelta(days=offset)
                low, high = limites_rango(day, day)
                self.assertLess(low, high)
                if previous:
                    self.assertEqual(previous, low)
                previous = high

    def test_open_bounds_and_leap_day(self):
        from apps.core.domain.periodos import limites_rango
        self.assertEqual(limites_rango(None, None), (None, None))
        low, high = limites_rango(date(2024, 2, 29), date(2024, 2, 29))
        self.assertEqual(high - low, timedelta(hours=24))
        self.assertEqual(low.tzinfo, UTC)
        self.assertEqual(low.astimezone(ZONA).date(), date(2024, 2, 29))
