from unittest.mock import Mock, patch

import requests
from django.test import SimpleTestCase, override_settings

from apps.shipping.infrastructure.blue_express.client import (
    BlueExpressAPIError,
    BlueExpressClient,
    BlueExpressTimeoutError,
)
from apps.shipping.infrastructure.blue_express.config import (
    BlueExpressConfigurationError,
)


TEST_CONFIG = {
    "ENABLED": True,
    "ENVIRONMENT": "qa",
    "TOKEN": "token-ficticio",
    "USERCODE": "usuario-ficticio",
    "CLIENT_ACCOUNT": "cuenta-ficticia",
    "USERNAME": "",
    "GEO_URL": "https://example.invalid/geo",
    "PRICING_URL": "https://example.invalid/pricing",
    "CONNECT_TIMEOUT": "5",
    "READ_TIMEOUT": "20",
}

HTTP_REQUEST = (
    "apps.shipping.infrastructure.blue_express.client.requests.request"
)


@override_settings(BLUE_EXPRESS=TEST_CONFIG)
class BlueExpressClientTests(SimpleTestCase):
    def setUp(self):
        self.client = BlueExpressClient()

    @patch(HTTP_REQUEST)
    def test_consulta_envia_headers_y_timeout(self, request):
        response = Mock(status_code=200)
        response.json.return_value = {"data": []}
        request.return_value = response

        result = self.client.request_json("geo")

        self.assertEqual(result, {"data": []})
        request.assert_called_once_with(
            method="GET",
            url=TEST_CONFIG["GEO_URL"],
            headers={
                "BX-TOKEN": "token-ficticio",
                "BX-USERCODE": "usuario-ficticio",
                "BX-CLIENT_ACCOUNT": "cuenta-ficticia",
                "Accept": "application/json",
            },
            json=None,
            timeout=(5.0, 20.0),
            allow_redirects=False,
        )
        response.close.assert_called_once()

    @patch(HTTP_REQUEST)
    def test_deshabilitado_no_hace_solicitudes(self, request):
        with override_settings(
            BLUE_EXPRESS={**TEST_CONFIG, "ENABLED": False}
        ):
            with self.assertRaises(BlueExpressConfigurationError):
                self.client.request_json("geo")

        request.assert_not_called()

    @patch(HTTP_REQUEST)
    def test_timeout_no_se_reintenta(self, request):
        request.side_effect = requests.Timeout()

        with self.assertRaises(BlueExpressTimeoutError):
            self.client.request_json("geo")

        request.assert_called_once()

    @patch(HTTP_REQUEST)
    def test_rechaza_credenciales_invalidas(self, request):
        response = Mock(status_code=401)
        request.return_value = response

        with self.assertRaisesRegex(
            BlueExpressAPIError, "credenciales"
        ):
            self.client.request_json("geo")

        response.json.assert_not_called()
        response.close.assert_called_once()

    @patch(HTTP_REQUEST)
    def test_rechaza_json_invalido(self, request):
        response = Mock(status_code=200)
        response.json.side_effect = ValueError("Respuesta HTML")
        request.return_value = response

        with self.assertRaisesRegex(
            BlueExpressAPIError, "JSON válido"
        ):
            self.client.request_json("geo")

        response.close.assert_called_once()

    @patch(HTTP_REQUEST)
    def test_no_sigue_redirecciones(self, request):
        response = Mock(status_code=302)
        request.return_value = response

        with self.assertRaisesRegex(BlueExpressAPIError, "HTTP 302"):
            self.client.request_json("geo")

        self.assertFalse(request.call_args.kwargs["allow_redirects"])
        response.close.assert_called_once()

    @patch(HTTP_REQUEST)
    def test_rechaza_error_de_negocio_con_http_200(self, request):
        response = Mock(status_code=200)
        response.json.return_value = {
            "status": False,
            "data": "ORA-20104: error_pkg.app_invalid_user_session",
        }
        request.return_value = response

        with self.assertRaises(BlueExpressAPIError) as captured:
            self.client.request_json(
                "pricing",
                method="POST",
                payload={},
            )

        self.assertIn("rechazó la operación", str(captured.exception))
        self.assertNotIn("ORA-", str(captured.exception))
        request.assert_called_once()
        response.close.assert_called_once()