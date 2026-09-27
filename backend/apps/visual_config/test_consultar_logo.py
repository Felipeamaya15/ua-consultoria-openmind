from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.core.models import Tienda
from apps.visual_config.models import ConfiguracionVisual


class ConsultarLogoNegocioAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = "/api/visual-config/logo-negocio/"

        self.propietario = get_user_model().objects.create_user(
            username="consultar-logo-owner",
            password="test-password",
        )

        self.tienda = Tienda.objects.create(
            nombre="Tienda Logo",
            id_usuario_propietario=self.propietario,
        )

    def test_consulta_publica_devuelve_logo_guardado(self):
        logo = "data:image/png;base64,LOGO_NEGOCIO"

        ConfiguracionVisual.objects.create(
            tienda=self.tienda,
            logo_negocio=logo,
        )

        response = self.client.get(self.url)

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            response.data["data"]["logo_negocio"],
            logo,
        )

    def test_devuelve_logo_vacio_si_no_existe_configuracion(self):
        response = self.client.get(self.url)

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            response.data["data"]["logo_negocio"],
            "",
        )

        self.assertFalse(
            ConfiguracionVisual.objects.filter(
                tienda=self.tienda
            ).exists()
        )

    def test_no_requiere_autenticacion(self):
        ConfiguracionVisual.objects.create(
            tienda=self.tienda,
            logo_negocio="data:image/png;base64,LOGO",
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

    def test_no_permite_modificar_logo_desde_consulta(self):
        response = self.client.post(
            self.url,
            {
                "logo_negocio": "data:image/png;base64,NUEVO",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
