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
    BlueExpressTimeoutError,
)


MODULE = "apps.core.presentation.blue_territory"

CONFIG = {
    "ENABLED": True,
    "ENVIRONMENT": "qa",
    "TOKEN": "token-ficticio",
    "USERCODE": "usuario-ficticio",
    "CLIENT_ACCOUNT": "cuenta-ficticia",
    "GEO_URL": "https://example.invalid/geo",
    "CONNECT_TIMEOUT": "5",
    "READ_TIMEOUT": "20",
}

REGIONS = [{
    "code": 13,
    "name": "Metropolitana de Santiago",
    "communes": [{
        "code": 13123,
        "name": "PROVIDENCIA",
        "districts": [{"code": "PRO", "name": "PROVIDENCIA"}],
    }],
}]


@override_settings(
    BLUE_EXPRESS=CONFIG,
    BLUE_EXPRESS_CHECKOUT_TOTAL_CONFIRMED=True,
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "blue-territory-api-tests",
        },
    },
)
class BlueTerritoryAPITests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

        owner = get_user_model().objects.create_user(
            username="blue-territory-owner",
        )
        self.store = Tienda.objects.create(
            nombre="Tienda territorial de prueba",
            id_usuario_propietario=owner,
        )
        delivery = delivery_defaults()
        delivery["blue_express"]["enabled"] = True
        ConfiguracionEntrega.objects.create(
            tienda=self.store,
            datos=delivery,
        )

        self.api = APIClient()
        self.url = reverse("checkout-blue-express-territorio")

        patcher = patch(
            MODULE + ".fetch_geography",
            return_value=deepcopy(REGIONS),
        )
        self.fetch = patcher.start()
        self.addCleanup(patcher.stop)

    def test_devuelve_catalogo_sin_credenciales(self):
        response = self.api.get(self.url)

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["data"]["regiones"], REGIONS)
        self.assertEqual(response["Cache-Control"], "no-store")

        for secret in ("token-ficticio", "usuario-ficticio", "cuenta-ficticia"):
            self.assertNotIn(secret, str(response.data))

    def test_segunda_consulta_utiliza_cache(self):
        first = self.api.get(self.url)
        second = self.api.get(self.url)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data, second.data)
        self.fetch.assert_called_once()

    def test_cache_tiene_vencimiento_de_una_hora(self):
        with patch(MODULE + ".cache.set", wraps=cache.set) as save:
            response = self.api.get(self.url)

        self.assertEqual(response.status_code, 200)

        territory_calls = [
            recorded
            for recorded in save.call_args_list
            if recorded.args
            and str(recorded.args[0]).startswith("blue:territory:v1:")
        ]

        self.assertEqual(len(territory_calls), 1)
        territory_call = territory_calls[0]

        self.assertEqual(territory_call.args[1], REGIONS)
        self.assertEqual(territory_call.kwargs["timeout"], 3600)

    def test_cambio_de_credencial_no_reutiliza_cache_anterior(self):
        self.assertEqual(self.api.get(self.url).status_code, 200)

        with override_settings(
            BLUE_EXPRESS={**CONFIG, "TOKEN": "otro-token-ficticio"}
        ):
            self.assertEqual(self.api.get(self.url).status_code, 200)

        self.assertEqual(self.fetch.call_count, 2)

    def test_error_no_se_guarda_en_cache(self):
        self.fetch.side_effect = [
            BlueExpressAPIError("Error interno"),
            deepcopy(REGIONS),
        ]

        first = self.api.get(self.url)
        second = self.api.get(self.url)

        self.assertEqual(first.status_code, 502)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(self.fetch.call_count, 2)

    def test_timeout_devuelve_504(self):
        self.fetch.side_effect = BlueExpressTimeoutError("Timeout interno")

        response = self.api.get(self.url)

        self.assertEqual(response.status_code, 504)
        self.assertEqual(response.data["error"]["codigo"], "BLUE_TIMEOUT")
        self.assertEqual(response["Cache-Control"], "no-store")

    def test_deshabilitado_no_entrega_catalogo_aunque_exista_cache(self):
        self.assertEqual(self.api.get(self.url).status_code, 200)

        with override_settings(
            BLUE_EXPRESS={**CONFIG, "ENABLED": False}
        ):
            response = self.api.get(self.url)

        self.assertEqual(response.status_code, 503)
        self.fetch.assert_called_once()