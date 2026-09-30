import os
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.core.models import Tienda
from apps.core.services import configurar_tienda


@override_settings(DEBUG=True)
@patch.dict(os.environ, {'DEV_BOOTSTRAP': '1'})
class BootstrapDevTests(TestCase):
    def test_clean_database_login_and_restart_preserve_credentials(self):
        call_command('bootstrap_dev')
        user = get_user_model().objects.get(email='emprendedor@gmail.com')
        client = APIClient()
        response = client.post('/api/auth/login/', {
            'username': user.email, 'password': '123456',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        client.credentials(HTTP_AUTHORIZATION='Token ' + response.data['data']['token'])
        self.assertEqual(client.get('/api/auth/me/').status_code, 200)
        user.set_password('changed-password')
        user.save()
        saved_password = user.password
        tienda = Tienda.objects.get()
        tienda.nombre = 'Nombre personalizado'
        tienda.save()
        call_command('bootstrap_dev')
        user.refresh_from_db()
        tienda.refresh_from_db()
        self.assertEqual(user.password, saved_password)
        self.assertEqual(tienda.nombre, 'Nombre personalizado')
        self.assertEqual(Tienda.objects.count(), 1)
        self.assertEqual(get_user_model().objects.count(), 1)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    @override_settings(DEBUG=False)
    def test_rejects_non_debug_environment(self):
        with self.assertRaises(CommandError):
            call_command('bootstrap_dev')
        self.assertFalse(get_user_model().objects.exists())

    def test_disabled_by_default(self):
        with patch.dict(os.environ, {'DEV_BOOTSTRAP': '0'}):
            call_command('bootstrap_dev')
        self.assertFalse(get_user_model().objects.exists())

    def test_existing_owner_is_not_replaced(self):
        owner = get_user_model().objects.create_user(username='owner')
        tienda, _ = configurar_tienda(owner, nombre='Original')
        with self.assertRaises(CommandError):
            call_command('bootstrap_dev')
        tienda.refresh_from_db()
        self.assertEqual(tienda.id_usuario_propietario_id, owner.pk)
        self.assertEqual(get_user_model().objects.count(), 1)

    def test_ambiguous_email_is_rejected(self):
        for name in ('one', 'two'):
            get_user_model().objects.create_user(username=name, email='emprendedor@gmail.com')
        with self.assertRaises(CommandError):
            call_command('bootstrap_dev')
        self.assertFalse(Tienda.objects.exists())
