from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import (
    Tienda,
    ConfiguracionTransbank,
    ConfiguracionPayPal,
    ConfiguracionMercadoPago,
)


class SeguridadCredencialesAPITests(TestCase):
    def setUp(self):
        usuarios = get_user_model()
        self.propietario = usuarios.objects.create_user(
            username="qa-propietario",
            password="ClaveTemporalQA123!"
        )
        self.cliente = usuarios.objects.create_user(
            username="qa-cliente",
            password="ClaveTemporalQA456!"
        )
        self.tienda = Tienda.objects.create(
            nombre="Tienda QA Seguridad",
            id_usuario_propietario=self.propietario
        )
        self.api = APIClient()

        ConfiguracionTransbank.objects.create(
            id_tienda=self.tienda,
            codigo_comercio="COMERCIO-QA",
            api_key="SECRETO_TRANSBANK_QA_1234",
            ambiente="INTEGRACION",
            activo=False
        )
        ConfiguracionPayPal.objects.create(
            id_tienda=self.tienda,
            client_id="PUBLICO-PAYPAL-QA",
            client_secret="SECRETO_PAYPAL_QA_1234",
            ambiente="SANDBOX",
            activo=False
        )
        ConfiguracionMercadoPago.objects.create(
            id_tienda=self.tienda,
            public_key="PUBLICO-MP-QA",
            access_token="SECRETO_MERCADOPAGO_QA_1234",
            ambiente="SANDBOX",
            activo=False
        )

        self.proveedores = {
            "transbank": "SECRETO_TRANSBANK_QA_1234",
            "paypal": "SECRETO_PAYPAL_QA_1234",
            "mercadopago": "SECRETO_MERCADOPAGO_QA_1234",
        }

    def url(self, proveedor, tienda_id=None):
        tienda_id = tienda_id or self.tienda.pk
        return (
            f"/api/catalog/tiendas/{tienda_id}/"
            f"configuracion/{proveedor}/"
        )

    def test_usuarios_anonimos_no_pueden_consultar_ni_modificar(self):
        for proveedor in self.proveedores:
            with self.subTest(proveedor=proveedor):
                self.api.force_authenticate(user=None)

                respuesta_get = self.api.get(self.url(proveedor))
                respuesta_post = self.api.post(
                    self.url(proveedor), {}, format="json"
                )

                self.assertIn(respuesta_get.status_code, (401, 403))
                self.assertIn(respuesta_post.status_code, (401, 403))

    def test_cliente_autenticado_no_puede_acceder(self):
        self.api.force_authenticate(user=self.cliente)

        for proveedor in self.proveedores:
            with self.subTest(proveedor=proveedor):
                respuesta_get = self.api.get(self.url(proveedor))
                respuesta_post = self.api.post(
                    self.url(proveedor), {}, format="json"
                )

                self.assertEqual(respuesta_get.status_code, 403)
                self.assertEqual(respuesta_post.status_code, 403)

    def test_propietario_no_puede_usar_id_tienda_ajeno(self):
        self.api.force_authenticate(user=self.propietario)

        for proveedor in self.proveedores:
            with self.subTest(proveedor=proveedor):
                respuesta_get = self.api.get(
                    self.url(proveedor, tienda_id=999999)
                )
                respuesta_post = self.api.post(
                    self.url(proveedor, tienda_id=999999),
                    {},
                    format="json"
                )

                self.assertIn(respuesta_get.status_code, (403, 404))
                self.assertIn(respuesta_post.status_code, (403, 404))

    def test_propietario_no_recibe_credenciales_completas(self):
        self.api.force_authenticate(user=self.propietario)

        for proveedor, secreto in self.proveedores.items():
            with self.subTest(proveedor=proveedor):
                respuesta = self.api.get(self.url(proveedor))

                self.assertEqual(
                    respuesta.status_code, 200, respuesta.data
                )

                contenido = respuesta.content.decode("utf-8")

                self.assertNotIn(secreto, contenido)

                datos = respuesta.data["data"]
                self.assertIsInstance(datos, dict)

                for nombre_campo in (
                    "api_key", "client_secret", "access_token"
                ):
                    self.assertNotIn(nombre_campo, datos)

    def test_respuestas_no_revelan_secretos_ante_errores(self):
        self.api.force_authenticate(user=self.cliente)

        for proveedor, secreto in self.proveedores.items():
            with self.subTest(proveedor=proveedor):
                respuesta = self.api.post(
                    self.url(proveedor),
                    {"credencial": secreto},
                    format="json"
                )

                self.assertEqual(respuesta.status_code, 403)
                self.assertNotIn(
                    secreto, respuesta.content.decode("utf-8")
                )

    def test_accesos_rechazados_no_modifican_credenciales(self):
        configuraciones = [
            (
                "transbank",
                ConfiguracionTransbank,
                "api_key",
                "SECRETO_TRANSBANK_QA_1234",
            ),
            (
                "paypal",
                ConfiguracionPayPal,
                "client_secret",
                "SECRETO_PAYPAL_QA_1234",
            ),
            (
                "mercadopago",
                ConfiguracionMercadoPago,
                "access_token",
                "SECRETO_MERCADOPAGO_QA_1234",
            ),
        ]

        self.api.force_authenticate(user=self.cliente)

        for proveedor, modelo, campo, secreto_original in configuraciones:
            with self.subTest(proveedor=proveedor):
                respuesta = self.api.post(
                    self.url(proveedor),
                    {
                        campo: "CREDENCIAL_MODIFICADA_SIN_PERMISO",
                        "activo": True,
                    },
                    format="json",
                )

                self.assertEqual(respuesta.status_code, 403)

                configuracion = modelo.objects.get(
                    id_tienda=self.tienda
                )

                self.assertEqual(
                    getattr(configuracion, campo),
                    secreto_original,
                )

    def test_guardado_exitoso_no_revela_credenciales(self):
        self.api.force_authenticate(user=self.propietario)

        casos = [
            (
                "transbank",
                "api_key",
                {
                    "codigo_comercio": "COMERCIO-QA",
                    "api_key": "SECRETO_TRANSBANK_NUEVO_5678",
                    "ambiente": "INTEGRACION",
                    "activo": False,
                },
            ),
            (
                "paypal",
                "client_secret",
                {
                    "client_id": "PUBLICO-PAYPAL-QA",
                    "client_secret": "SECRETO_PAYPAL_NUEVO_5678",
                    "ambiente": "SANDBOX",
                    "activo": False,
                },
            ),
            (
                "mercadopago",
                "access_token",
                {
                    "public_key": "PUBLICO-MP-QA",
                    "access_token": "SECRETO_MERCADOPAGO_NUEVO_5678",
                    "ambiente": "SANDBOX",
                    "activo": False,
                },
            ),
        ]

        for proveedor, campo, datos in casos:
            with self.subTest(proveedor=proveedor):
                respuesta = self.api.post(
                    self.url(proveedor),
                    datos,
                    format="json",
                )

                self.assertEqual(
                    respuesta.status_code,
                    200,
                    respuesta.data,
                )

                contenido = respuesta.content.decode("utf-8")
                self.assertNotIn(datos[campo], contenido)
                self.assertNotIn(campo, respuesta.data["data"])