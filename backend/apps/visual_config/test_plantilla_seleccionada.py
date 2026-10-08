from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.core.models import Tienda
from apps.visual_config.models import ConfiguracionVisual


class PlantillaSeleccionadaAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = "/api/visual-config/plantilla-seleccionada/"

        self.propietario = get_user_model().objects.create_user(
            username="visual-owner",
            password="test-password",
        )

        self.tienda = Tienda.objects.create(
            nombre="Tienda Visual",
            id_usuario_propietario=self.propietario,
        )

    def test_propietario_puede_guardar_plantilla(self):
        self.client.force_authenticate(user=self.propietario)

        response = self.client.put(
            self.url,
            {
                "plantilla_seleccionada": "editorial",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        configuracion = ConfiguracionVisual.objects.get(
            tienda=self.tienda
        )

        self.assertEqual(
            configuracion.plantilla_seleccionada,
            "editorial",
        )

        self.assertEqual(
            response.data["data"]["plantilla_seleccionada"],
            "editorial",
        )

    def test_actualiza_plantilla_existente(self):
        ConfiguracionVisual.objects.create(
            tienda=self.tienda,
            plantilla_seleccionada="editorial",
        )

        self.client.force_authenticate(user=self.propietario)

        response = self.client.put(
            self.url,
            {
                "plantilla_seleccionada": "minimal",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        configuracion = ConfiguracionVisual.objects.get(
            tienda=self.tienda
        )

        self.assertEqual(
            configuracion.plantilla_seleccionada,
            "minimal",
        )

    def test_cambiar_plantilla_no_modifica_logo_ni_personalizacion(self):
        personalizacion = {
            "primaryColor": "#111111",
            "secondaryColor": "#ffffff",
        }

        ConfiguracionVisual.objects.create(
            tienda=self.tienda,
            plantilla_seleccionada="editorial",
            logo_negocio="data:image/png;base64,LOGO",
            personalizacion=personalizacion,
        )

        self.client.force_authenticate(user=self.propietario)

        response = self.client.put(
            self.url,
            {
                "plantilla_seleccionada": "visual",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        configuracion = ConfiguracionVisual.objects.get(
            tienda=self.tienda
        )

        self.assertEqual(
            configuracion.plantilla_seleccionada,
            "visual",
        )
        self.assertEqual(
            configuracion.logo_negocio,
            "data:image/png;base64,LOGO",
        )
        self.assertEqual(
            configuracion.personalizacion,
            personalizacion,
        )

    def test_rechaza_plantilla_no_disponible(self):
        self.client.force_authenticate(user=self.propietario)

        response = self.client.put(
            self.url,
            {
                "plantilla_seleccionada": "plantilla-inexistente",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.assertFalse(
            ConfiguracionVisual.objects.filter(
                tienda=self.tienda
            ).exists()
        )

    def test_rechaza_solicitud_no_autenticada(self):
        response = self.client.put(
            self.url,
            {
                "plantilla_seleccionada": "editorial",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_otro_usuario_no_puede_modificar_la_tienda(self):
        otro_usuario = get_user_model().objects.create_user(
            username="otro-usuario",
            password="test-password",
        )

        self.client.force_authenticate(user=otro_usuario)

        response = self.client.put(
            self.url,
            {
                "plantilla_seleccionada": "catalog",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
        )

        self.assertFalse(
            ConfiguracionVisual.objects.filter(
                tienda=self.tienda
            ).exists()
        )
