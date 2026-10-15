from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.core.models import Promocion, Tienda
from apps.core.promotions import calculate_promotion


class PromocionesAdminTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='promo-owner', password='secret')
        self.store = Tienda.objects.create(id_usuario_propietario=self.owner, nombre='Tienda promociones')
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=self.owner).key}')

    def test_crea_descuento_de_monto_fijo_normalizando_codigo(self):
        response = self.client.post('/api/promociones/', {
            'name': 'Bienvenida', 'code': ' nuevo-5000 ', 'type': 'fixed', 'value': '5000.00',
            'minAmount': '15000.00', 'startsAt': date.today(), 'endsAt': date.today() + timedelta(days=30),
            'maxUses': 20, 'active': True,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        promotion = Promocion.objects.get()
        self.assertEqual(promotion.codigo, 'NUEVO-5000')
        self.assertEqual(str(promotion.valor), '5000.00')
        self.assertEqual(response.data['data']['type'], 'fixed')

    def test_rechaza_monto_fijo_no_positivo_y_codigo_duplicado(self):
        base = {'name': 'Promo', 'code': 'FIJO', 'type': 'fixed', 'value': 0, 'startsAt': date.today()}
        self.assertEqual(self.client.post('/api/promociones/', base, format='json').status_code, 400)
        base['value'] = 1000
        self.assertEqual(self.client.post('/api/promociones/', base, format='json').status_code, 201)
        self.assertEqual(self.client.post('/api/promociones/', base, format='json').status_code, 409)

    def test_solo_propietario_puede_administrar_promociones(self):
        self.client.credentials()
        self.assertEqual(self.client.get('/api/promociones/').status_code, 401)

    def test_crea_promocion_de_envio_gratuito_y_elimina_el_costo(self):
        response = self.client.post('/api/promociones/', {
            'name': 'Despacho gratis', 'code': 'ENVIO-GRATIS', 'type': 'free_shipping',
            'value': 9999, 'minAmount': 20000, 'startsAt': date.today(), 'active': True,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        promotion = Promocion.objects.get(codigo='ENVIO-GRATIS')
        self.assertEqual(promotion.valor, 0)
        amounts = calculate_promotion(self.store, ' envio-gratis ', 25000, 3990)
        self.assertEqual(amounts.discount, 0)
        self.assertEqual(amounts.shipping, 0)
