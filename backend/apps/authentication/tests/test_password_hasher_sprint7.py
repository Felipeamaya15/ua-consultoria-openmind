"""RNF-03 / SCRUM-497: hash de claves con Argon2 y compatibilidad PBKDF2."""
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.test import SimpleTestCase


class PasswordHasherSprint7Tests(SimpleTestCase):
    def test_argon2_para_password_nueva(self):
        self.assertEqual(settings.PASSWORD_HASHERS[0], 'django.contrib.auth.hashers.Argon2PasswordHasher')
        value = make_password('ClaveDePruebaTemporaria!902')
        self.assertTrue(value.startswith('argon2$'))
        self.assertTrue(check_password('ClaveDePruebaTemporaria!902', value))

    def test_pbkdf2_historico_sigue_verificable(self):
        value = make_password('ClaveHistoricaQA!903', hasher='pbkdf2_sha256')
        self.assertTrue(check_password('ClaveHistoricaQA!903', value))
