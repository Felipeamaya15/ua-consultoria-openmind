from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework.authtoken.models import Token
from apps.core.models import Tienda


class EntrepreneurProfileTests(TestCase):
    url = '/api/auth/emprendedor/perfil/'
    password_url = url + 'password/'

    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='owner', email='owner@example.com', password='OriginalSecure902!')
        self.customer = get_user_model().objects.create_user(username='customer', email='customer@example.com')
        self.store = Tienda.objects.create(nombre='Store', id_usuario_propietario=self.owner)
        self.api = APIClient()
        self.token = Token.objects.create(user=self.owner)
        self.api.credentials(HTTP_AUTHORIZATION='Token ' + self.token.key)

    def test_owner_reads_updates_email_and_keeps_store_and_session(self):
        self.assertEqual(self.api.get(self.url).status_code, 200)
        response = self.api.patch(self.url, {'email': 'updated@example.com'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.owner.refresh_from_db()
        self.store.refresh_from_db()
        self.assertEqual(self.owner.email, 'updated@example.com')
        self.assertEqual(self.store.id_usuario_propietario_id, self.owner.pk)
        self.assertEqual(self.api.get(self.url).data['data']['email'], 'updated@example.com')
        self.assertEqual(Token.objects.get(user=self.owner).key, self.token.key)
        self.assertNotIn('password', response.data['data'])
        self.assertNotIn('password_hash', response.data['data'])

    def test_duplicate_invalid_and_foreign_user_fields_rejected(self):
        for data in ({'email': 'CUSTOMER@example.com'}, {'email': 'bad'}, {'user_id': self.customer.pk, 'email': 'new@example.com'}, {'is_staff': True}):
            self.assertEqual(self.api.patch(self.url, data, format='json').status_code, 400)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.email, 'owner@example.com')

    def test_password_change_and_login_after_email_change(self):
        self.api.patch(self.url, {'email': 'updated@example.com'}, format='json')
        data = {'current_password': 'OriginalSecure902!', 'new_password': 'ReplacementSecure703!'}
        self.assertEqual(self.api.post(self.password_url, data, format='json').status_code, 200)
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.check_password(data['new_password']))
        self.assertFalse(self.owner.check_password(data['current_password']))
        self.assertEqual(self.api.get(self.url).status_code, 200)
        login = self.api.post('/api/auth/login/', {'username': 'updated@example.com', 'password': data['new_password']}, format='json')
        self.assertEqual(login.status_code, 200)
        self.assertTrue(login.data['data']['user']['is_store_owner'])

    def test_password_validation(self):
        for old, new in [('wrong', 'ReplacementSecure703!'), ('OriginalSecure902!', '123')]:
            self.assertEqual(self.api.post(self.password_url, {'current_password': old, 'new_password': new}, format='json').status_code, 400)
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.check_password('OriginalSecure902!'))

    def test_customer_staff_superuser_and_user_without_store_denied(self):
        for staff, superuser in ((False, False), (True, False), (True, True)):
            self.customer.is_staff = staff
            self.customer.is_superuser = superuser
            self.customer.save()
            self.api.force_authenticate(self.customer)
            self.assertEqual(self.api.get(self.url).status_code, 403)
            self.assertEqual(self.api.patch(self.url, {'email': 'blocked@example.com'}, format='json').status_code, 403)
            self.assertEqual(self.api.post(self.password_url, {}, format='json').status_code, 403)
            self.assertEqual(self.api.get('/api/catalog/productos/admin/').status_code, 403)
            self.assertEqual(self.api.get('/api/catalog/productos/admin/listado/').status_code, 403)
            self.assertEqual(self.api.post('/api/catalog/productos/crear/', {}, format='json').status_code, 403)
            self.assertEqual(self.api.delete('/api/catalog/productos/123/variantes/SKU/').status_code, 403)

    def test_anonymous_requires_token(self):
        self.api.credentials()
        self.assertEqual(self.api.get(self.url).status_code, 401)
        self.assertEqual(self.api.patch(self.url, {}, format='json').status_code, 401)
        self.assertEqual(self.api.post(self.password_url, {}, format='json').status_code, 401)

    def test_other_store_owner_is_denied(self):
        second = Tienda.objects.create(nombre='Other', id_usuario_propietario=self.customer)
        self.api.force_authenticate(self.customer)
        with patch('apps.core.infrastructure.tenant.Tienda.objects.get', return_value=self.store):
            self.assertEqual(self.api.get(self.url).status_code, 403)
        self.api.force_authenticate(self.owner)
        self.assertEqual(self.api.get(self.url + '?tienda_id=' + str(second.pk)).status_code, 403)

    def test_foreign_variant_is_denied_before_mutation(self):
        with patch('apps.catalog.infrastructure.repositories.ProductRepository.get_by_id', return_value={'tienda_id': '999'}):
            response = self.api.delete('/api/catalog/productos/123/variantes/SKU/')
            self.assertEqual(response.status_code, 403)

    def test_owner_without_a_store_is_denied(self):
        self.store.id_usuario_propietario = self.customer
        self.store.save(update_fields=['id_usuario_propietario'])
        self.assertEqual(self.api.get(self.url).status_code, 403)
