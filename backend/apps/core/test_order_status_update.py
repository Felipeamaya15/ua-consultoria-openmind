"""Integración de rutas, estados, métricas y seguimiento tras combinar ambas ramas."""
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from django.urls import resolve
from rest_framework.test import APIClient

from apps.core.models import Pedido, Tienda
from apps.core.presentation.order_tracking import OrderTrackingAPIView
from apps.core.presentation import views


class OrderStatusIntegrationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.owner = get_user_model().objects.create_user(username='status-owner')
        self.store = Tienda.objects.create(nombre='Estado tienda', id_usuario_propietario=self.owner)
        self.order = Pedido.objects.create(tienda=self.store, identificador='ORD-20261008-ABCD',
            correo_contacto='buyer@example.com', monto_total='1000.00', estado='pagado', medio_pago='Transferencia')
        self.url = f'/api/tienda/pedidos/{self.order.pk}/estado/'
        self.api = APIClient()
        self.api.force_authenticate(self.owner)

    def update(self, state):
        return self.api.patch(self.url, {'estado': state}, format='json')

    def test_routes_resolve_once_and_tracking_alias_uses_secure_implementation(self):
        from apps.core.urls import urlpatterns
        routes = [str(pattern.pattern) for pattern in urlpatterns]
        names = [pattern.name for pattern in urlpatterns]
        self.assertEqual(len(routes), len(set(routes)))
        self.assertEqual(len(names), len(set(names)))
        for path in ['/api/tienda/dashboard/', '/api/entregas/retiro/direcciones/',
                     '/api/entregas/configuracion/', '/api/entregas/alternativas/', self.url]:
            self.assertIsNotNone(resolve(path).func.view_class)
        self.assertIs(resolve('/api/pedidos/seguimiento/').func.view_class, OrderTrackingAPIView)
        self.assertIs(views.OrderTrackingAPIView, OrderTrackingAPIView)

    def test_confirmed_state_updates_list_recent_metrics_and_public_timeline(self):
        response = self.update('en_reparto')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['estado'], 'en_reparto')
        self.order.refresh_from_db()
        self.assertEqual(self.order.estado, 'en_reparto')
        self.assertEqual(self.api.get('/api/tienda/pedidos/').data[0]['estado'], 'en_reparto')
        self.assertEqual(self.api.get('/api/tienda/pedidos/ultimos/').data['data'][0]['estado'], 'en_reparto')
        dashboard = self.api.get('/api/tienda/dashboard/?periodo=7').data['data']
        self.assertEqual(dashboard['total_ventas'], '1000.00')
        self.assertEqual(dashboard['por_despachar'], 0)
        tracking = APIClient().post('/api/pedidos/seguimiento/',
            {'identificador': self.order.identificador, 'email': self.order.correo_contacto}, format='json')
        self.assertEqual(tracking.status_code, 200, tracking.data)
        current = [step for step in tracking.data['data']['linea_tiempo'] if step['actual']]
        self.assertEqual([step['estado'] for step in current], ['en_reparto'])

    def test_aliases_normalize_and_invalid_state_does_not_mutate(self):
        for alias, expected in [('preparacion', 'preparando'), ('despachado', 'enviado')]:
            self.assertEqual(self.update(alias).data['data']['estado'], expected)
        for invalid in ['', 'solo espacios invalidos', 'desconocido']:
            self.assertEqual(self.update(invalid).status_code, 400)
        self.order.refresh_from_db()
        self.assertEqual(self.order.estado, 'enviado')
        self.assertEqual(self.api.patch(self.url, {}, format='json').status_code, 400)

    def test_guest_and_non_owner_cannot_change_state(self):
        self.assertIn(APIClient().patch(self.url, {'estado': 'entregado'}, format='json').status_code, [401, 403])
        buyer = get_user_model().objects.create_user(username='status-buyer')
        self.api.force_authenticate(buyer)
        self.assertEqual(self.update('entregado').status_code, 403)
        self.order.refresh_from_db()
        self.assertEqual(self.order.estado, 'pagado')

    def test_foreign_order_or_store_selector_cannot_update(self):
        self.order.tienda = None
        self.order.save(update_fields=['tienda'])
        self.assertEqual(self.update('entregado').status_code, 404)
        self.assertEqual(self.api.patch(self.url, {'estado': 'entregado', 'tienda_id': 'otra'}, format='json').status_code, 400)
        self.order.refresh_from_db()
        self.assertEqual(self.order.estado, 'pagado')

    def test_cancelled_order_tracking_is_single_step_and_not_sales(self):
        self.assertEqual(self.update('cancelado').status_code, 200)
        dashboard = self.api.get('/api/tienda/dashboard/').data['data']
        self.assertEqual((dashboard['total_ventas'], dashboard['total_pedidos']), ('0.00', 1))
        response = APIClient().post('/api/pedidos/seguimiento/',
            {'identificador': self.order.identificador, 'email': self.order.correo_contacto}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data']['linea_tiempo'], [
            {'estado': 'cancelado', 'etiqueta': 'Cancelado', 'completado': True, 'actual': True}])
