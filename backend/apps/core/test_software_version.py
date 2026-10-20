"""Pruebas para la funcionalidad «Implementar la consulta de la versión vigente del software»."""

from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.software_version import (
    SOFTWARE_NAME,
    SOFTWARE_PLATFORM,
    SOFTWARE_RELEASE_DATE,
    SOFTWARE_STATE,
    SOFTWARE_VERSION,
    get_software_version_info,
)


class SoftwareVersionTestCase(APITestCase):
    """Verifica la lógica de negocio y endpoints REST de la versión vigente del software."""

    def test_logica_dominio_retorna_version_vigente(self):
        """Verifica que la función de dominio retorne la estructura completa de versión vigente."""
        info = get_software_version_info()
        self.assertEqual(info["sistema"], SOFTWARE_NAME)
        self.assertEqual(info["version"], SOFTWARE_VERSION)
        self.assertEqual(info["version_vigente"], SOFTWARE_VERSION)
        self.assertEqual(info["fecha_vigencia"], SOFTWARE_RELEASE_DATE)
        self.assertEqual(info["estado"], SOFTWARE_STATE)
        self.assertTrue(info["vigente"])
        self.assertEqual(info["plataforma"], SOFTWARE_PLATFORM)
        self.assertIn("detalles", info)
        self.assertIn("backend", info["detalles"])

    def test_consulta_version_vigente_endpoint_principal(self):
        """Verifica que GET /api/software/version-vigente/ responda 200 OK con datos válidos."""
        response = self.client.get("/api/software/version-vigente/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["exito"])
        self.assertEqual(
            response.data["mensaje"],
            "Versión vigente del software obtenida correctamente.",
        )

        data = response.data["data"]
        self.assertEqual(data["version"], SOFTWARE_VERSION)
        self.assertEqual(data["version_vigente"], SOFTWARE_VERSION)
        self.assertEqual(data["estado"], "vigente")
        self.assertTrue(data["vigente"])
        self.assertEqual(data["sistema"], SOFTWARE_NAME)

    def test_consulta_version_vigente_alias_endpoints(self):
        """Verifica que los endpoints canónicos y de conveniencia respondan 200 OK."""
        rutas = [
            "/api/software/version-vigente/",
            "/api/software/version/",
            "/api/version-vigente/",
            "/api/version/",
            "/api/sistema/version-vigente/",
            "/api/sistema/version/",
        ]

        for ruta in rutas:
            response = self.client.get(ruta)
            self.assertEqual(
                response.status_code,
                status.HTTP_200_OK,
                f"Fallo en la ruta {ruta}",
            )
            self.assertTrue(response.data["exito"])
            self.assertEqual(response.data["data"]["version_vigente"], SOFTWARE_VERSION)

    def test_consulta_version_vigente_con_parametro_campo(self):
        """Verifica la consulta con validación de campo específico (?campo=version)."""
        # Campo válido
        response = self.client.get("/api/software/version-vigente/?campo=version")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["exito"])
        self.assertEqual(response.data["data"]["version"], SOFTWARE_VERSION)

        # Campo no existente debe devolver 400 con mensaje de validación
        bad_response = self.client.get("/api/software/version-vigente/?campo=campo_inexistente")
        self.assertEqual(bad_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(bad_response.data["exito"])
        self.assertIn("no encontrado", bad_response.data["mensaje"])
