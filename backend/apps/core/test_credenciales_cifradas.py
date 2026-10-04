from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings
from django.contrib.auth import get_user_model
from cryptography.fernet import Fernet

from apps.core.infrastructure.encryption import PREFIJO, cifrar, descifrar
from apps.core.models import (
    ConfiguracionMercadoPago,
    ConfiguracionPayPal,
    ConfiguracionTransbank,
    Tienda,
)


class CifradoTests(SimpleTestCase):

    def test_cifrar_y_descifrar(self):
        cifrado = cifrar("APP_USR-1234567890")
        self.assertTrue(cifrado.startswith(PREFIJO))
        self.assertNotIn("1234567890", cifrado)
        self.assertEqual(descifrar(cifrado), "APP_USR-1234567890")

    def test_no_cifra_dos_veces_ni_vacios(self):
        cifrado = cifrar("secreto")
        self.assertEqual(cifrar(cifrado), cifrado)
        self.assertEqual(cifrar(""), "")

    def test_valor_legado_en_texto_plano_se_lee_igual(self):
        self.assertEqual(descifrar("clave-antigua"), "clave-antigua")

    @override_settings(PAYMENT_CREDENTIALS_KEY="")
    def test_sin_clave_dedicada_usa_secret_key(self):
        self.assertEqual(descifrar(cifrar("secreto")), "secreto")

    def test_clave_distinta_no_descifra(self):
        from django.core.exceptions import ImproperlyConfigured
        with override_settings(PAYMENT_CREDENTIALS_KEY=Fernet.generate_key().decode()):
            cifrado = cifrar("secreto")
        with override_settings(PAYMENT_CREDENTIALS_KEY=Fernet.generate_key().decode()):
            with self.assertRaises(ImproperlyConfigured):
                descifrar(cifrado)


class CredencialesEnBaseDeDatosTests(TestCase):

    def setUp(self):
        owner = get_user_model().objects.create_user(username="owner-pagos")
        self.tienda = Tienda.objects.create(nombre="Tienda pagos", id_usuario_propietario=owner)

    def _crudo(self, tabla, columna):
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT {columna} FROM {tabla}")
            return cursor.fetchone()[0]

    def test_access_token_se_guarda_cifrado_y_se_lee_en_claro(self):
        ConfiguracionMercadoPago.objects.create(id_tienda=self.tienda, access_token="APP_USR-TOKEN-9876")
        self.assertTrue(self._crudo("configuracion_mercadopago", "access_token").startswith(PREFIJO))
        config = ConfiguracionMercadoPago.objects.get(pk=self.tienda.pk)
        self.assertEqual(config.access_token, "APP_USR-TOKEN-9876")
        self.assertTrue(config.access_token_enmascarado.endswith("9876"))
        self.assertNotIn("TOKEN", config.access_token_enmascarado)

    def test_api_key_transbank_cifrada(self):
        ConfiguracionTransbank.objects.create(id_tienda=self.tienda, codigo_comercio="1", api_key="K" * 40)
        self.assertNotIn("KKKK", self._crudo("configuracion_transbank", "api_key"))
        self.assertEqual(ConfiguracionTransbank.objects.get().api_key, "K" * 40)

    def test_client_secret_paypal_cifrado(self):
        ConfiguracionPayPal.objects.create(id_tienda=self.tienda, client_id="id", client_secret="PP-SECRET-1234")
        self.assertNotIn("SECRET", self._crudo("configuracion_paypal", "client_secret"))
        self.assertEqual(ConfiguracionPayPal.objects.get().client_secret, "PP-SECRET-1234")
