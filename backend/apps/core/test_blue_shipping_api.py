from copy import deepcopy
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.core.models import Tienda
from apps.shipping.infrastructure.blue_express.client import (
    BlueExpressAPIError,
    BlueExpressTimeoutError,
)
from apps.shipping.infrastructure.blue_express.config import (
    BlueExpressConfigurationError,
)
from apps.shipping.infrastructure.blue_express.packages import (
    BlueExpressCatalogError,
)


QUOTE_SERVICE = (
    "apps.core.presentation.blue_shipping.quote_catalog_product"
)

PAYLOAD = {
    "producto_id": "6af4059d339b3f569cf380a3",
    "sku": "BLUE-TEST-001",
    "cantidad": 1,
    "destino": {
        "region_code": 13,
        "commune_code": 13123,
        "district_code": "PRO",
    },
}


class BlueShippingAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        users = get_user_model()
        cls.owner = users.objects.create_user(
            username="blue-api-owner",
            is_active=True,
        )
        cls.other_user = users.objects.create_user(
            username="blue-api-other",
            is_active=True,
        )
        cls.store = Tienda.objects.create(
            nombre="Tienda API Blue",
            id_usuario_propietario=cls.owner,
        )

    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(user=self.owner)
        self.url = reverse("blue-express-cotizacion")

    def post(self, payload=None):
        return self.api.post(
            self.url,
            deepcopy(PAYLOAD) if payload is None else payload,
            format="json",
        )

    @patch(QUOTE_SERVICE)
    def test_propietario_puede_cotizar(self, service):
        service.return_value = {
            "proveedor": "BLUE_EXPRESS",
            "total": "2646",
            "cotizacion": "referencia-simulada",
        }

        response = self.post()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["exito"])
        self.assertEqual(
            response.data["data"]["cotizacion"],
            "referencia-simulada",
        )
        self.assertEqual(response["Cache-Control"], "no-store")
        service.assert_called_once_with(
            store_id=self.store.pk,
            product_id=PAYLOAD["producto_id"],
            sku=PAYLOAD["sku"],
            quantity=1,
            destination=PAYLOAD["destino"],
        )

    @patch(QUOTE_SERVICE)
    def test_rechaza_usuario_anonimo(self, service):
        self.api.force_authenticate(user=None)

        response = self.post()

        self.assertIn(response.status_code, (401, 403))
        service.assert_not_called()

    @patch(QUOTE_SERVICE)
    def test_rechaza_usuario_que_no_es_propietario(self, service):
        self.api.force_authenticate(user=self.other_user)

        response = self.post()

        self.assertEqual(response.status_code, 403)
        service.assert_not_called()

    @patch(QUOTE_SERVICE)
    def test_rechaza_precios_medidas_y_tienda_en_payload(self, service):
        for field, value in (
            ("total", "1"),
            ("peso_kg", "0.001"),
            ("tienda_id", self.store.pk),
        ):
            with self.subTest(field=field):
                payload = deepcopy(PAYLOAD)
                payload[field] = value

                response = self.post(payload)

                self.assertEqual(response.status_code, 400)

        service.assert_not_called()

    @patch(QUOTE_SERVICE)
    def test_rechaza_cantidades_no_soportadas(self, service):
        for quantity in (0, 2, True, "1", 1.0):
            with self.subTest(quantity=quantity):
                payload = deepcopy(PAYLOAD)
                payload["cantidad"] = quantity

                response = self.post(payload)

                self.assertEqual(response.status_code, 400)

        service.assert_not_called()

    @patch(QUOTE_SERVICE)
    def test_rechaza_destino_incompleto(self, service):
        payload = deepcopy(PAYLOAD)
        del payload["destino"]["district_code"]

        response = self.post(payload)

        self.assertEqual(response.status_code, 400)
        service.assert_not_called()

    @patch(QUOTE_SERVICE)
    def test_configuracion_incompleta_devuelve_503(self, service):
        service.side_effect = BlueExpressConfigurationError(
            "Detalle interno de configuración."
        )

        response = self.post()

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.data["error"]["codigo"],
            "BLUE_NO_DISPONIBLE",
        )
        self.assertNotIn("Detalle interno", str(response.data))

    @patch(QUOTE_SERVICE)
    def test_timeout_devuelve_504(self, service):
        service.side_effect = BlueExpressTimeoutError("Timeout interno.")

        response = self.post()

        self.assertEqual(response.status_code, 504)
        self.assertEqual(
            response.data["error"]["codigo"],
            "BLUE_TIMEOUT",
        )

    @patch(QUOTE_SERVICE)
    def test_error_proveedor_devuelve_502_sin_detalles_internos(
        self, service
    ):
        service.side_effect = BlueExpressAPIError(
            "ORA-20104: detalle interno del proveedor"
        )

        response = self.post()

        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.data["error"]["codigo"],
            "BLUE_PROVEEDOR_ERROR",
        )
        self.assertNotIn("ORA-", str(response.data))

    @patch(QUOTE_SERVICE)
    def test_ficha_faltante_devuelve_400(self, service):
        service.side_effect = BlueExpressCatalogError(
            "Faltan el peso y las dimensiones de este SKU."
        )

        response = self.post()

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["error"]["codigo"],
            "BLUE_DATOS_INVALIDOS",
        )