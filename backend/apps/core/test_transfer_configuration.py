from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.core.models import ConfiguracionPago, Tienda


class TransferConfigurationValidationTests(TestCase):
    url = '/api/pagos/configuracion/'

    def setUp(self):
        owner = get_user_model().objects.create_user(username='transfer-config-owner')
        self.store = Tienda.objects.create(nombre='Transfer config', id_usuario_propietario=owner)
        self.api = APIClient()
        self.api.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=owner).key)
        self.complete_fields = {
            'bank_name': 'Banco QA',
            'account_type': 'Cuenta corriente',
            'account_number': '12345678',
            'holder_rut': '12.345.678-9',
            'holder_name': 'Titular QA',
            'confirmation_email': 'pagos@example.test',
        }

    def test_rejects_partial_transfer_even_when_disabled_and_identifies_missing_rut(self):
        fields = {**self.complete_fields, 'holder_rut': '   '}
        response = self.api.put(
            self.url,
            {'transfer': {'enabled': False, 'fields': fields}},
            format='json',
        )

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('RUT del titular', str(response.data))
        self.assertFalse(ConfiguracionPago.objects.filter(tienda=self.store).exists())

    def test_accepts_complete_transfer_while_disabled(self):
        response = self.api.put(
            self.url,
            {'transfer': {'enabled': False, 'fields': self.complete_fields}},
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        saved = ConfiguracionPago.objects.get(tienda=self.store).datos['transfer']
        self.assertFalse(saved['enabled'])
        self.assertEqual(saved['fields']['holder_rut'], '12.345.678-9')

    def test_accepts_empty_disabled_transfer_configuration(self):
        response = self.api.put(
            self.url,
            {'transfer': {'enabled': False, 'fields': {}}},
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
