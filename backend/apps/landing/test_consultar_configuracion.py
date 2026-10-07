from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.core.models import Tienda
from apps.landing.models import ConfiguracionLanding


class ConsultarConfiguracionLandingAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = "/api/landing/configuracion/"

        self.propietario = get_user_model().objects.create_user(
            username="consultar-landing-owner",
            password="test-password",
        )

        self.tienda = Tienda.objects.create(
            nombre="Tienda Landing",
            id_usuario_propietario=self.propietario,
        )

    def test_consulta_publica_devuelve_configuracion(self):
        ConfiguracionLanding.objects.create(
            tienda=self.tienda,
            titulo="Mi tienda",
            descripcion="Descripción pública",
            texto_boton="Ver productos",
            secciones={
                "productos_destacados": True,
            },
        )

        response = self.client.get(self.url)

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            response.data["data"]["titulo"],
            "Mi tienda",
        )
        self.assertEqual(
            response.data["data"]["texto_boton"],
            "Ver productos",
        )
        self.assertEqual(
            response.data["data"]["secciones"],
            {
                "productos_destacados": True,
            },
        )

    def test_devuelve_data_nula_si_no_existe_configuracion(self):
        response = self.client.get(self.url)

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertIsNone(
            response.data["data"],
        )

        self.assertFalse(
            ConfiguracionLanding.objects.filter(
                tienda=self.tienda
            ).exists()
        )

    def test_no_requiere_autenticacion(self):
        ConfiguracionLanding.objects.create(
            tienda=self.tienda,
            titulo="Mi tienda",
            texto_boton="Entrar",
        )

        response = self.client.get(self.url)

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

    def test_rechaza_identificador_de_otra_tienda(self):
        response = self.client.get(
            self.url,
            {
                "tienda_id": self.tienda.pk + 1000,
            },
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_consulta_no_crea_configuracion(self):
        self.client.get(self.url)

        self.assertFalse(
            ConfiguracionLanding.objects.filter(
                tienda=self.tienda
            ).exists()
        )
