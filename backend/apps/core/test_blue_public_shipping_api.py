from copy import deepcopy
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.core.delivery import delivery_defaults
from apps.core.models import ConfiguracionEntrega, Tienda
from apps.shipping.infrastructure.blue_express.client import (
    BlueExpressAPIError,
)


SERVICE = (
    "apps.core.presentation.blue_public_shipping.quote_catalog_product"
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


@override_settings(
    BLUE_EXPRESS={"ENABLED": True},
    BLUE_EXPRESS_CHECKOUT_TOTAL_CONFIRMED=True,
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "blue-public-api-tests",
        },
    },
)
class BluePublicShippingAPITests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

        owner = get_user_model().objects.create_user(
            username="blue-public-owner",
        )
        self.store = Tienda.objects.create(
            nombre="Tienda pública de prueba",
            id_usuario_propietario=owner,
        )

        delivery = delivery_defaults()
        delivery["blue_express"]["enabled"] = True
        self.delivery = ConfiguracionEntrega.objects.create(
            tienda=self.store,
            datos=delivery,
        )

        self.api = APIClient()
        self.url = reverse("checkout-blue-express-cotizacion")

        patcher = patch(SERVICE)
        self.service = patcher.start()
        self.addCleanup(patcher.stop)
        self.service.return_value = {
            "proveedor": "BLUE_EXPRESS",
            "total": "2646",
            "cotizacion": "referencia-simulada",
        }

    def post(self, payload=None):
        return self.api.post(
            self.url,
            deepcopy(PAYLOAD) if payload is None else payload,
            format="json",
        )

    def test_comprador_invitado_puede_cotizar(self):
        response = self.post()

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertEqual(
            response.data["data"]["cotizacion"],
            "referencia-simulada",
        )
        self.service.assert_called_once_with(
            store_id=self.store.pk,
            product_id=PAYLOAD["producto_id"],
            sku=PAYLOAD["sku"],
            quantity=1,
            destination=PAYLOAD["destino"],
        )

    @override_settings(BLUE_EXPRESS_CHECKOUT_TOTAL_CONFIRMED=False)
    def test_bloqueo_comercial_no_consulta_blue(self):
        response = self.post()

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response["Cache-Control"], "no-store")
        self.service.assert_not_called()

    @override_settings(BLUE_EXPRESS={"ENABLED": False})
    def test_bloqueo_global_no_consulta_blue(self):
        response = self.post()

        self.assertEqual(response.status_code, 503)
        self.service.assert_not_called()

    def test_bloqueo_por_tienda_no_consulta_blue(self):
        self.delivery.datos["blue_express"]["enabled"] = False
        self.delivery.save()

        response = self.post()

        self.assertEqual(response.status_code, 503)
        self.service.assert_not_called()

    def test_no_acepta_precio_del_comprador(self):
        payload = deepcopy(PAYLOAD)
        payload["total"] = "1"

        response = self.post(payload)

        self.assertEqual(response.status_code, 400)
        self.service.assert_not_called()

    def test_no_permite_elegir_otra_tienda(self):
        payload = deepcopy(PAYLOAD)
        payload["tienda_id"] = self.store.pk + 1

        response = self.post(payload)

        self.assertEqual(response.status_code, 400)
        self.service.assert_not_called()

    def test_error_del_proveedor_no_expone_detalles(self):
        self.service.side_effect = BlueExpressAPIError(
            "ORA-20104: información interna"
        )

        response = self.post()

        self.assertEqual(response.status_code, 502)
        self.assertNotIn("ORA-", str(response.data))
        self.assertEqual(response["Cache-Control"], "no-store")

    def test_limita_solicitudes_por_ip(self):
        for _ in range(10):
            response = self.post()
            self.assertEqual(response.status_code, 200, response.data)

        response = self.post()

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertEqual(self.service.call_count, 10)