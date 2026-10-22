"""Contratos de ambos lados de 09c2b0c, sin modificar sus implementaciones."""
from datetime import datetime, timezone as dt_timezone
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import resolve
from rest_framework.test import APIClient

from apps.core.models import Pedido, Tienda
from apps.core.presentation.historial import HistorialPedidosAPIView, HistorialVentasAPIView
from apps.core.presentation.promotions import PromocionesAPIView, PromocionDetalleAPIView, ValidarPromocionAPIView
from apps.core.presentation.reports import InformeAPIView, InformePDFAPIView
from apps.core.presentation.store_configuration import InformacionTiendaAPIView


@override_settings(TIME_ZONE='UTC')
class MergeCompatibilityTests(TestCase):
    def setUp(self):
        users = get_user_model()
        self.owner = users.objects.create_user(username='merge-owner')
        self.stranger = users.objects.create_user(username='merge-stranger')
        self.store = Tienda.objects.create(nombre='Convivencia QA', id_usuario_propietario=self.owner)
        self.api = APIClient()
        self.api.force_authenticate(self.owner)
        clock = patch('django.utils.timezone.now', return_value=datetime(2026, 10, 16, 12, tzinfo=dt_timezone.utc))
        clock.start()
        self.addCleanup(clock.stop)

    def order(self, identifier, date, status='pagado', amount='1000.00', store=True):
        order = Pedido.objects.create(identificador=identifier, tienda=self.store if store else None,
                                      estado=status, monto_total=amount, correo_contacto='merge@example.test')
        Pedido.objects.filter(pk=order.pk).update(fecha_creacion=datetime.fromisoformat(date))
        return order

    def test_both_sets_of_routes_resolve_without_replacing_each_other(self):
        routes = {
            '/api/tienda/pedidos/historial/': HistorialPedidosAPIView,
            '/api/tienda/ventas/historial/': HistorialVentasAPIView,
            '/api/tienda/informes/': InformeAPIView,
            '/api/tienda/informes/pdf/': InformePDFAPIView,
            '/api/tienda/configuracion/': InformacionTiendaAPIView,
            '/api/promociones/': PromocionesAPIView,
            '/api/promociones/1/': PromocionDetalleAPIView,
            '/api/promociones/validar/': ValidarPromocionAPIView,
        }
        for url, view in routes.items():
            with self.subTest(url=url):
                self.assertIs(resolve(url).func.view_class, view)

    def test_histories_and_reports_agree_for_same_period_away_from_timezone_boundary(self):
        self.order('MERGE-PAID', '2026-10-10T15:00:00+00:00', amount='1234.50')
        self.order('MERGE-PENDING', '2026-10-11T15:00:00+00:00', status='pendiente', amount='5000.00')
        self.order('MERGE-UNASSIGNED', '2026-10-10T15:00:00+00:00', amount='9999.00', store=False)
        filters = {'fecha_desde': '2026-10-01', 'fecha_hasta': '2026-10-31'}
        orders = self.api.get('/api/tienda/pedidos/historial/', filters)
        sales = self.api.get('/api/tienda/ventas/historial/', filters)
        report = self.api.get('/api/tienda/informes/', {'anio': 2026, 'mes': 10})
        for response in (orders, sales, report):
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response['Cache-Control'], 'no-store')
        summary, totals = sales.data['data']['resumen'], report.data['data']
        self.assertEqual(orders.data['paginacion']['total'], totals['total_pedidos'])
        self.assertEqual(summary['cantidad_ventas'], totals['pedidos_pagados'])
        self.assertEqual(summary['total_vendido'], totals['total_ventas'])
        self.assertEqual(totals['total_ventas'], '1234.50')
        self.assertEqual(totals['total_pedidos'], 2)

    def test_histories_preserve_pagination_search_status_order_and_aggregation(self):
        for i in range(3):
            self.order(f'MERGE-{i}', f'2026-10-{10+i}T15:00:00+00:00', amount=str(1000 + i))
        response = self.api.get('/api/tienda/pedidos/historial/', {'q': 'MERGE-', 'estado': 'pagado', 'orden': 'monto_desc', 'tamano': 1, 'pagina': 2})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['paginacion']['total'], 3)
        self.assertEqual(response.data['data'][0]['identificador'], 'MERGE-1')
        daily = self.api.get('/api/tienda/ventas/historial/', {'agrupacion': 'dia', 'fecha_desde': '2026-10-10', 'fecha_hasta': '2026-10-12'})
        self.assertEqual(daily.status_code, 200, daily.data)
        self.assertEqual(len(daily.data['data']['serie']), 3)
        self.assertEqual(self.api.get('/api/tienda/pedidos/historial/', {'pagina': 0}).status_code, 400)
        self.assertEqual(self.api.get('/api/tienda/ventas/historial/', {'agrupacion': 'dia'}).status_code, 400)

    def test_private_sources_of_both_implementations_enforce_owner(self):
        urls = ['/api/tienda/pedidos/historial/', '/api/tienda/ventas/historial/', '/api/tienda/informes/', '/api/tienda/informes/pdf/', '/api/promociones/']
        for user, status in ((None, 401), (self.stranger, 403)):
            self.api.force_authenticate(user)
            for url in urls:
                with self.subTest(user=user, url=url):
                    self.assertEqual(self.api.get(url).status_code, status)
            public = self.api.get('/api/tienda/configuracion/')
            self.assertEqual(public.status_code, 200)
            self.assertEqual(set(public.data['data']), {'nombre', 'descripcion'})
            self.assertEqual(self.api.put('/api/tienda/configuracion/', {'nombre': 'No autorizado'}, format='json').status_code, status)
        self.api.force_authenticate(self.owner)
        for url in urls:
            self.assertEqual(self.api.get(url, {'tienda_id': self.store.pk + 1}).status_code, 403 if url == '/api/promociones/' else 400)

    def test_histories_and_reports_share_approved_santiago_periods(self):
        # Los períodos comerciales usan Chile, incluso si TIME_ZONE global sigue en UTC.
        self.order('MERGE-BOUNDARY', '2026-10-01T02:30:00+00:00')
        history = self.api.get('/api/tienda/ventas/historial/', {'fecha_desde': '2026-10-01', 'fecha_hasta': '2026-10-31'})
        october = self.api.get('/api/tienda/informes/', {'anio': 2026, 'mes': 10})
        september = self.api.get('/api/tienda/informes/', {'anio': 2026, 'mes': 9})
        self.assertEqual(history.data['data']['resumen']['cantidad_ventas'], 0)
        self.assertEqual(october.data['data']['pedidos_pagados'], 0)
        self.assertEqual(september.data['data']['pedidos_pagados'], 1)

    def test_current_promotion_api_requires_code(self):
        base = {'name': 'Sin código QA', 'type': 'fixed', 'value': 1000, 'startsAt': '2026-10-16'}
        for code in (None, '', '   '):
            with self.subTest(code=code):
                payload = dict(base)
                if code is not None:
                    payload['code'] = code
                response = self.api.post('/api/promociones/', payload, format='json')
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn('code', response.data)
                # La validación de cupones de QA también admite promociones de precio sin código;
                # el error de código obligatorio para cupones se genera al validar el objeto.
                self.assertEqual(response.data['code'][0].code, 'invalid')
                self.assertFalse(self.store.promociones.exists())

    def test_current_promotion_api_preserves_code_length_limit(self):
        payload = {'name': 'Límite de código QA', 'code': 'A' * 41, 'type': 'fixed', 'value': 1000, 'startsAt': '2026-10-16'}
        response = self.api.post('/api/promociones/', payload, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('code', response.data)
        self.assertEqual(response.data['code'][0].code, 'max_length')
        self.assertFalse(self.store.promociones.exists())
        payload['code'] = 'A' * 40
        response = self.api.post('/api/promociones/', payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.store.promociones.get().codigo, payload['code'])

    def test_ticket_rounding_difference_remains_explicit(self):
        self.order('MERGE-ROUND-A', '2026-10-10T15:00:00+00:00', amount='10.00')
        self.order('MERGE-ROUND-B', '2026-10-10T15:00:00+00:00', amount='10.01')
        history = self.api.get('/api/tienda/ventas/historial/', {'fecha_desde': '2026-10-01', 'fecha_hasta': '2026-10-31'})
        report = self.api.get('/api/tienda/informes/', {'anio': 2026, 'mes': 10})
        self.assertEqual(history.data['data']['resumen']['ticket_promedio'], '10.00')
        self.assertEqual(report.data['data']['ticket_promedio'], '10.01')
