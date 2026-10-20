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

    def test_crea_descuento_porcentual_y_calcula_descuento(self):
        response = self.client.post('/api/promociones/', {
            'name': 'Descuento Verano', 'code': ' verano-20 ', 'type': 'percentage', 'value': '20.00',
            'minAmount': '10000.00', 'startsAt': date.today(), 'endsAt': date.today() + timedelta(days=15),
            'maxUses': 50, 'active': True,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        promotion = Promocion.objects.get(codigo='VERANO-20')
        self.assertEqual(promotion.tipo, Promocion.TIPO_PORCENTAJE)
        self.assertEqual(str(promotion.valor), '20.00')
        self.assertEqual(response.data['data']['type'], 'percentage')

        amounts = calculate_promotion(self.store, 'verano-20', 25000, 3500)
        self.assertEqual(amounts.discount, 5000)
        self.assertEqual(amounts.shipping, 3500)

    def test_rechaza_descuento_porcentual_fuera_de_rango(self):
        for invalid_value in (0, -10, 101, 150):
            response = self.client.post('/api/promociones/', {
                'name': 'Porcentaje invalido', 'code': f'PCT-{abs(invalid_value)}',
                'type': 'percentage', 'value': invalid_value, 'startsAt': date.today(),
            }, format='json')
            self.assertEqual(response.status_code, 400, (invalid_value, response.data))

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

    def test_valida_codigo_vigente_y_calcula_descuento_fijo(self):
        Promocion.objects.create(
            tienda=self.store, nombre='Cinco mil', codigo='FIJO5000', tipo='fixed', valor=5000,
            monto_minimo=10000, fecha_inicio=date.today() - timedelta(days=1),
            fecha_fin=date.today() + timedelta(days=1), activa=True,
        )
        self.client.credentials()
        response = self.client.post('/api/promociones/validar/', {
            'code': ' fijo5000 ', 'subtotal': '12000.00', 'shipping': '3500.00',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['discount'], '5000.00')
        self.assertEqual(response.data['data']['shipping'], '3500.00')

    def test_rechaza_codigo_inexistente_inactivo_expirado_sin_minimo_o_sin_cupos(self):
        cases = [
            ('INACTIVA', {'activa': False}, 20000),
            ('EXPIRADA', {'fecha_inicio': date.today() - timedelta(days=5), 'fecha_fin': date.today() - timedelta(days=1)}, 20000),
            ('FUTURA', {'fecha_inicio': date.today() + timedelta(days=1)}, 20000),
            ('MINIMO', {'monto_minimo': 30000}, 20000),
            ('AGOTADA', {'maximo_usos': 1, 'usos': 1}, 20000),
        ]
        for code, changes, subtotal in cases:
            values = dict(tienda=self.store, nombre=code, codigo=code, tipo='fixed', valor=1000,
                          fecha_inicio=date.today(), activa=True)
            values.update(changes)
            Promocion.objects.create(**values)
            response = self.client.post('/api/promociones/validar/', {
                'code': code, 'subtotal': subtotal, 'shipping': 3000,
            }, format='json')
            self.assertEqual(response.status_code, 400, (code, response.data))
            self.assertEqual(response.data['error']['codigo'], 'PROMOCION_INVALIDA')

        missing = self.client.post('/api/promociones/validar/', {
            'code': 'NO-EXISTE', 'subtotal': 20000,
        }, format='json')
        self.assertEqual(missing.status_code, 400)