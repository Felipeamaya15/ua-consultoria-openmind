from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.core.models import Tienda
from apps.visual_config.models import ConfiguracionVisual


class ConsultarPlantillaSeleccionadaAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = "/api/visual-config/plantilla-seleccionada/"

        self.propietario = get_user_model().objects.create_user(
            username="consultar-plantilla-owner",
            password="test-password",
        )

        self.tienda = Tienda.objects.create(
            nombre="Tienda Plantilla",
            id_usuario_propietario=self.propietario,
        )

    def test_consulta_publica_devuelve_plantilla_seleccionada(self):
        ConfiguracionVisual.objects.create(
            tienda=self.tienda,
            plantilla_seleccionada="editorial",
        )

        response = self.client.get(self.url)

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            response.data["data"]["plantilla_seleccionada"],
            "editorial",
        )

    def test_devuelve_valor_vacio_si_no_existe_configuracion(self):
        response = self.client.get(self.url)

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            response.data["data"]["plantilla_seleccionada"],
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
            plantilla_seleccionada="minimal",
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
            ConfiguracionVisual.objects.filter(
                tienda=self.tienda
            ).exists()
        )
