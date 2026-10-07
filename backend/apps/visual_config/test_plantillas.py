from django.test import SimpleTestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.visual_config.models import ConfiguracionVisual


class PlantillasDisponiblesAPITests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = "/api/visual-config/plantillas/"

    def test_consulta_publica_devuelve_las_cuatro_plantillas(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        plantillas = response.data["data"]

        self.assertEqual(len(plantillas), 4)
        self.assertEqual(
            [plantilla["id"] for plantilla in plantillas],
            ["editorial", "minimal", "visual", "catalog"],
        )

    def test_plantillas_coinciden_con_las_definidas_en_el_modelo(self):
        response = self.client.get(self.url)

        ids_endpoint = {
            plantilla["id"]
            for plantilla in response.data["data"]
        }

        self.assertEqual(
            ids_endpoint,
            set(ConfiguracionVisual.Plantilla.values),
        )

    def test_cada_plantilla_contiene_los_datos_necesarios_para_el_selector(self):
        response = self.client.get(self.url)

        for plantilla in response.data["data"]:
            self.assertEqual(
                set(plantilla.keys()),
                {"id", "name", "description", "tags", "preview"},
            )
            self.assertTrue(plantilla["name"])
            self.assertTrue(plantilla["description"])
            self.assertIsInstance(plantilla["tags"], list)
            self.assertTrue(plantilla["preview"])

    def test_endpoint_no_requiere_autenticacion(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_no_permite_crear_plantillas_desde_este_endpoint(self):
        response = self.client.post(
            self.url,
            {"id": "otra"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )