from datetime import datetime
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.core.models import Pedido, Tienda

URL = '/api/tienda/informes/'
ZONA = ZoneInfo('America/Santiago')


class ReportTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='report-owner')
        self.other = get_user_model().objects.create_user(username='report-other')
        self.store = Tienda.objects.create(nombre='Tienda Ñandú & amigos', id_usuario_propietario=self.owner)
        self.api = APIClient()
        self.api.force_authenticate(self.owner)
        clock = patch('django.utils.timezone.now', return_value=datetime(2026, 10, 15, 12, tzinfo=ZONA))
        clock.start()
        self.addCleanup(clock.stop)

    def order(self, fecha, estado='pagado', monto='1000.00', tienda=True):
        p = Pedido.objects.create(tienda=self.store if tienda else None, estado=estado,
                                  monto_total=monto, correo_contacto='report@example.com')
        Pedido.objects.filter(pk=p.pk).update(fecha_creacion=datetime.fromisoformat(fecha))
        return p

    def data(self, **params):
        response = self.api.get(URL, params)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response['Cache-Control'], 'no-store')
        return response.json()['data']

    def test_current_year_previous_years_and_empty_gaps(self):
        self.order('2024-03-01T12:00:00-03:00')
        data = self.data()
        self.assertEqual(data['anio'], 2026)
        self.assertEqual(data['anios_disponibles'], [2026, 2024])
        self.assertEqual(data['total_pedidos'], 0)
        self.assertEqual(len(data['meses']), 12)
        self.assertTrue(all(r['ventas'] == '0.00' and r['pedidos'] == 0 for r in data['meses']))
        self.assertIsNone(data['ticket_promedio'])
        self.assertEqual(data['mejores_meses'], {'ventas': [], 'pedidos': []})
        self.assertEqual(self.data(anio=2024)['total_pedidos'], 1)
        self.assertEqual(self.data(anio=2025)['total_pedidos'], 0)

    def test_annual_equals_months_and_dashboard_preserves_paid_rule(self):
        for month in (1, 3, 10):
            for estado, _ in Pedido.ESTADO_CHOICES:
                self.order(f'2026-{month:02d}-10T12:00:00-03:00', estado, '0.10')
        data = self.data(anio=2026)
        self.assertEqual(data['total_pedidos'], 24)
        self.assertEqual(data['pedidos_pagados'], 18)
        self.assertEqual(data['total_ventas'], '1.80')
        self.assertEqual(sum(Decimal(r['ventas']) for r in data['meses']), Decimal(data['total_ventas']))
        self.assertEqual(sum(r['pedidos'] for r in data['meses']), data['total_pedidos'])
        self.assertEqual(sum(r['pedidos'] for r in data['distribucion_estados']), 24)
        self.assertEqual(data['mejores_meses'], {'ventas': [1, 3, 10], 'pedidos': [1, 3, 10]})
        total = Decimal(0)
        for month in range(1, 13):
            monthly = self.data(anio=2026, mes=month)
            self.assertEqual(len(monthly['meses']), 1)
            total += Decimal(monthly['total_ventas'])
        self.assertEqual(total, Decimal(data['total_ventas']))
        dashboard = self.api.get('/api/tienda/dashboard/', {'periodo': 'year'}).json()['data']
        for key in ('total_ventas', 'total_pedidos', 'pedidos_pagados', 'ticket_promedio', 'distribucion_estados'):
            self.assertEqual(data[key], dashboard[key], key)

    def test_chilean_year_and_month_boundaries_in_summer_and_winter(self):
        self.order('2026-01-01T02:59:59+00:00')  # 2025 en Chile
        self.order('2026-01-01T03:00:00+00:00')
        self.order('2026-10-01T02:59:59+00:00')  # septiembre
        self.order('2026-10-01T03:00:00+00:00')
        self.order('2026-07-01T03:59:59+00:00')  # junio: invierno, UTC-4
        self.order('2026-07-01T04:00:00+00:00')
        self.assertEqual(self.data(anio=2025)['total_pedidos'], 1)
        self.assertEqual(self.data(anio=2026)['total_pedidos'], 5)
        self.assertEqual(self.data(anio=2026, mes=6)['total_pedidos'], 1)
        self.assertEqual(self.data(anio=2026, mes=7)['total_pedidos'], 1)
        self.assertEqual(self.data(anio=2026, mes=9)['total_pedidos'], 1)
        self.assertEqual(self.data(anio=2026, mes=10)['total_pedidos'], 1)

    def test_store_without_orders_has_current_year_and_downloads_empty_month(self):
        data = self.data()
        self.assertEqual(data['anios_disponibles'], [2026])
        self.assertEqual(data['total_pedidos'], 0)
        response = self.api.get(URL + 'pdf/', {'anio': 2026, 'mes': 10})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.content.startswith(b'%PDF-'))

    def test_month_peak_orders_differs_from_sales_and_zero_paid_orders(self):
        self.order('2026-01-01T12:00:00-03:00', monto='2000')
        for _ in range(3):
            self.order('2026-02-01T12:00:00-03:00', 'pendiente')
        data = self.data(anio=2026)
        self.assertEqual(data['mejores_meses'], {'ventas': [1], 'pedidos': [2]})
        self.assertEqual(data['ticket_promedio'], '2000.00')
        self.order('2026-03-01T12:00:00-03:00', monto='0')
        self.assertEqual(self.data(anio=2026, mes=3)['ticket_promedio'], '0.00')

    def test_invalid_filters(self):
        for query in ('anio=2027', 'anio=0', 'anio=-1', 'anio=2026.0', 'anio=', 'anio=2026&anio=2025',
                      'mes=0', 'mes=13', 'mes=', 'mes=1&mes=2', 'mes=octubre', 'periodo=year'):
            self.assertEqual(self.api.get(URL + '?' + query).status_code, 400, query)
            self.assertEqual(self.api.get(URL + 'pdf/?' + query).status_code, 400, query)

    def test_authorization_and_tenant_isolation_for_json_and_pdf(self):
        self.order('2026-10-01T12:00:00-03:00', monto='999999', tienda=False)
        self.assertEqual(self.data()['total_pedidos'], 0)
        for path in (URL, URL + 'pdf/'):
            self.assertEqual(APIClient().get(path).status_code, 401)
            self.api.force_authenticate(self.other)
            self.assertEqual(self.api.get(path).status_code, 403)
            self.api.force_authenticate(self.owner)
            self.assertEqual(self.api.get(path, {'tienda_id': 999}).status_code, 400)
            self.assertEqual(self.api.get(path, HTTP_X_TIENDA_ID='999').status_code, 400)
        self.owner.is_active = False
        self.owner.save()
        self.assertEqual(self.api.get(URL).status_code, 403)

    def test_multiple_stores_fail_closed(self):
        other_store = Tienda.objects.create(nombre='Otra', id_usuario_propietario=self.other)
        Pedido.objects.create(tienda=other_store, monto_total=99999, estado='pagado', correo_contacto='x@example.com')
        for path in (URL, URL + 'pdf/'):
            response = self.api.get(path)
            self.assertEqual(response.status_code, 503)
            self.assertNotIn('99999', response.content.decode())

    def test_queries_bounded_independently_of_order_count(self):
        for _ in range(20):
            self.order('2026-10-01T12:00:00-03:00')
        with CaptureQueriesContext(connection) as queries:
            self.data(anio=2026)
        self.assertLessEqual(len(queries), 4)
        for verb in ('post', 'put', 'patch', 'delete'):
            self.assertEqual(getattr(self.api, verb)(URL).status_code, 405)

    def test_real_pdf_annual_monthly_and_empty(self):
        from pypdf import PdfReader
        self.order('2026-10-01T12:00:00-03:00', monto='2500.00')
        for params, filename, expected in [
            ({'anio': 2026}, '2026', 'Octubre'),
            ({'anio': 2026, 'mes': 10}, '2026-10', 'Octubre'),
            ({'anio': 2025}, '2025', 'No se registraron pedidos'),
        ]:
            response = self.api.get(URL + 'pdf/', params)
            self.assertEqual(response.status_code, 200, response.content[:100])
            self.assertEqual(response['Content-Type'], 'application/pdf')
            self.assertEqual(response['Content-Disposition'], f'attachment; filename="informe-ventas-pedidos-{filename}.pdf"')
            self.assertEqual(response['Cache-Control'], 'no-store')
            reader = PdfReader(BytesIO(response.content))
            text = '\n'.join(page.extract_text() for page in reader.pages)
            for word in ('Tienda Ñandú & amigos', 'Informe de ventas y pedidos', expected,
                         'documento tributario oficial', 'Página 1', 'CLP', 'America/Santiago'):
                self.assertIn(word, text)
            self.assertAlmostEqual(float(reader.pages[0].mediabox.width), 595.2756, places=2)
            self.assertIn('2.500', text) if params['anio'] == 2026 else None
