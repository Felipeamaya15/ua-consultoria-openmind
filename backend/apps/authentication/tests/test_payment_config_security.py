"""SCRUM-497: comprobación de secretos y aislamiento en configuración de pago."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from apps.core.models import Tienda


class PaymentConfigurationSecurityTests(TestCase):
    url = '/api/auth/configuracion-pagos/'

    def setUp(self):
        users = get_user_model()
        self.owner = users.objects.create_user(username='sprint7-owner')
        self.other = users.objects.create_user(username='sprint7-other')
        self.customer = users.objects.create_user(username='sprint7-customer')
        self.store = Tienda.objects.create(nombre='Propia', id_usuario_propietario=self.owner)
        self.other_store = Tienda.objects.create(nombre='Ajena', id_usuario_propietario=self.other)
        self.api = APIClient()

    def payload(self):
        return {
            'tienda_id': self.store.pk,
            'metodos': {
                'transbank': {
                    'enabled': True,
                    'fields': {'api_key': 'TOKEN-SECRETO-S7', 'commerce_id': '123'},
                },
                'paypal': {
                    'enabled': True,
                    'fields': {'client_id': 'CLIENT-ID', 'client_secret': 'PAYPAL-SECRETO-S7'},
                },
                'transfer': {
                    'enabled': True,
                    'fields': {
                        'bank_name': 'Banco QA', 'account_type': 'Corriente',
                        'account_number': 'CUENTA-S7-PRIVADA', 'holder_rut': 'RUT-S7',
                        'holder_name': 'Propietario QA', 'confirmation_email': 'qa@example.test',
                    },
                },
            },
        }

    def test_put_y_get_no_exponen_datos_de_pago(self):
        self.api.force_authenticate(user=self.owner)
        saved = self.api.put(self.url, self.payload(), format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        read = self.api.get(self.url, {'tienda_id': self.store.pk})
        self.assertEqual(read.status_code, 200, read.data)
        for response in (saved, read):
            body = response.content.decode('utf-8')
            for private_value in ('TOKEN-SECRETO-S7', 'PAYPAL-SECRETO-S7', 'CUENTA-S7-PRIVADA', 'RUT-S7', 'qa@example.test'):
                self.assertNotIn(private_value, body)
            methods = response.data['data']['metodos']
            self.assertTrue(methods['transbank']['enabled'])
            self.assertIn('api_key', methods['transbank']['configured_fields'])
            self.assertNotIn('fields', methods['transbank'])

    def test_anonimo_y_cliente_no_pueden_consultar_ni_guardar(self):
        for user in (None, self.customer):
            self.api.force_authenticate(user=user)
            self.assertIn(self.api.get(self.url, {'tienda_id': self.store.pk}).status_code, (401, 403))
            self.assertIn(self.api.put(self.url, self.payload(), format='json').status_code, (401, 403))

    def test_propietario_ajeno_no_accede_a_tienda(self):
        self.api.force_authenticate(user=self.other)
        self.assertEqual(self.api.get(self.url, {'tienda_id': self.store.pk}).status_code, 403)
        self.assertEqual(self.api.put(self.url, self.payload(), format='json').status_code, 403)
        self.api.force_authenticate(user=self.owner)
        self.assertEqual(self.api.get(self.url, {'tienda_id': self.other_store.pk}).status_code, 403)

    def test_configuracion_invalida_rechazada(self):
        self.api.force_authenticate(user=self.owner)
        invalid = {'tienda_id': self.store.pk, 'metodos': {'paypal': {'enabled': True, 'fields': {}}}}
        response = self.api.put(self.url, invalid, format='json')
        self.assertEqual(response.status_code, 400)
