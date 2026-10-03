from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient
from apps.authentication.infrastructure.models import UserProfile


class CustomerProfileTests(TestCase):
    url = '/api/auth/perfil/'
    password_url = '/api/auth/perfil/password/'

    def setUp(self):
        self.user = get_user_model().objects.create_user(username='customer', email='customer@example.com', password='OriginalSecure902!')
        self.other = get_user_model().objects.create_user(username='other', email='other@example.com')
        self.token = Token.objects.create(user=self.user)
        self.api = APIClient()
        self.api.credentials(HTTP_AUTHORIZATION='Token ' + self.token.key)

    def test_get_existing_and_missing_phone_profile(self):
        response = self.api.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data'], {'first_name': '', 'last_name': '', 'email': self.user.email, 'phone': ''})
        self.assertFalse(UserProfile.objects.filter(user=self.user).exists())
        UserProfile.objects.create(user=self.user, phone='+56 912345678')
        self.assertEqual(self.api.get(self.url).data['data']['phone'], '+56 912345678')

    def test_update_persists_and_preserves_token_and_other_user(self):
        data = {'first_name': 'Ana', 'last_name': 'Pérez', 'email': 'new@example.com', 'phone': '+56 912345678'}
        response = self.api.patch(self.url, data, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.api.get(self.url).data['data'], data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, 'Ana')
        self.assertEqual(UserProfile.objects.get(user=self.user).phone, data['phone'])
        self.other.refresh_from_db()
        self.assertEqual(self.other.email, 'other@example.com')
        self.assertEqual(Token.objects.get(user=self.user).key, self.token.key)
        self.assertEqual(self.api.patch(self.url, {'phone': ''}, format='json').status_code, 200)
        self.assertEqual(self.api.get(self.url).data['data']['first_name'], 'Ana')

    def test_unauthenticated_and_invalid_token_return_401(self):
        for header in ('', 'Token invalid'):
            self.api.credentials(HTTP_AUTHORIZATION=header)
            self.assertEqual(self.api.get(self.url).status_code, 401)
            self.assertEqual(self.api.patch(self.url, {}, format='json').status_code, 401)
            self.assertEqual(self.api.post(self.password_url, {}, format='json').status_code, 401)

    def test_invalid_and_duplicate_email_fail_atomically(self):
        for data in ({'email': 'invalid'}, {'email': 'OTHER@example.com'}, {'phone': 'letters'},
                     {'phone': '123'}, {'first_name': 'x' * 151}, {'email': '', 'phone': '+56 912345678'}):
            response = self.api.patch(self.url, data, format='json')
            self.assertEqual(response.status_code, 400, response.data)
            self.assertFalse(response.data['exito'])
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'customer@example.com')
        self.assertFalse(UserProfile.objects.filter(user=self.user).exists())

    def test_cannot_select_other_user_or_change_privileges_or_password(self):
        for field in ('id', 'user_id', 'username', 'is_staff', 'password', 'rut'):
            response = self.api.patch(self.url, {field: self.other.pk, 'first_name': 'changed'}, format='json')
            self.assertEqual(response.status_code, 400)
        response = self.api.patch(self.url + '?user_id=' + str(self.other.pk), {'first_name': 'Own'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.other.refresh_from_db()
        self.assertEqual(self.other.first_name, '')

    def test_password_change_uses_hash_and_existing_token(self):
        response = self.api.post(self.password_url, {'current_password': 'OriginalSecure902!', 'new_password': 'ReplacementSecure703!'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data'], {})
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('ReplacementSecure703!'))
        self.assertFalse(self.user.check_password('OriginalSecure902!'))
        self.assertNotEqual(self.user.password, 'ReplacementSecure703!')
        self.assertEqual(self.api.get(self.url).status_code, 200)
        login = self.api.post('/api/auth/login/', {'username': self.user.email, 'password': 'ReplacementSecure703!'}, format='json')
        self.assertEqual(login.status_code, 200)

    def test_wrong_current_and_weak_new_password_fail(self):
        for old, new in [('wrong', 'ReplacementSecure703!'), ('OriginalSecure902!', '123'), ('OriginalSecure902!', 'password')]:
            self.assertEqual(self.api.post(self.password_url, {'current_password': old, 'new_password': new}, format='json').status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('OriginalSecure902!'))

    def test_google_user_without_password_cannot_change_without_current_password(self):
        self.user.set_unusable_password()
        self.user.save()
        self.assertEqual(self.api.post(self.password_url, {'current_password': 'anything', 'new_password': 'ReplacementSecure703!'}, format='json').status_code, 400)

    def test_store_owner_and_staff_cannot_use_customer_endpoints(self):
        from apps.core.models import Tienda
        Tienda.objects.create(nombre='Owner store', id_usuario_propietario=self.user)
        self.assertEqual(self.api.get('/api/auth/me/').data['data']['is_store_owner'], True)
        for staff in (False, True):
            self.user.is_staff = staff
            self.user.save()
            self.assertEqual(self.api.get(self.url).status_code, 403)
            self.assertEqual(self.api.patch(self.url, {'first_name': 'Denied'}, format='json').status_code, 403)
            self.assertEqual(self.api.post(self.password_url, {'current_password': 'OriginalSecure902!', 'new_password': 'ReplacementSecure703!'}, format='json').status_code, 403)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, '')
        self.assertTrue(self.user.check_password('OriginalSecure902!'))
        self.assertEqual(Token.objects.get(user=self.user).key, self.token.key)

    def test_staff_without_store_is_not_a_customer(self):
        self.user.is_staff = True
        self.user.save()
        self.assertEqual(self.api.get(self.url).status_code, 403)

    def test_customer_identity_reports_real_flags(self):
        data = self.api.get('/api/auth/me/').data['data']
        self.assertFalse(data['is_staff'])
        self.assertFalse(data['is_store_owner'])
