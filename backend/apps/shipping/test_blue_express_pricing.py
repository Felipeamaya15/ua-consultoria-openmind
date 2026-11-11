from copy import deepcopy
from datetime import date
from decimal import Decimal

from django.test import SimpleTestCase

from apps.shipping.infrastructure.blue_express.client import (
    BlueExpressAPIError,
)
from apps.shipping.infrastructure.blue_express.pricing import (
    parse_pricing_response,
)


# Importes y fecha del ejemplo documental, no una tarifa vigente.
PRICING_RESPONSE = {
    "status": True,
    "data": {
        "tarifa": 10584.0,
        "flete": 2646.0,
        "servicioAdicional": 0.0,
        "fechaEstimadaEntrega": "25-01-2023",
        "total": 2646.0,
    },
}


class BlueExpressPricingTests(SimpleTestCase):
    def test_conserva_importes_distintos_del_ejemplo(self):
        result = parse_pricing_response(deepcopy(PRICING_RESPONSE))

        self.assertEqual(result["proveedor"], "BLUE_EXPRESS")
        self.assertEqual(result["tarifa"], Decimal("10584"))
        self.assertEqual(result["flete"], Decimal("2646"))
        self.assertEqual(result["servicio_adicional"], Decimal("0"))
        self.assertEqual(result["total"], Decimal("2646"))
        self.assertEqual(
            result["fecha_estimada_entrega"],
            date(2023, 1, 25),
        )

    def test_rechaza_operacion_fallida(self):
        with self.assertRaises(BlueExpressAPIError):
            parse_pricing_response({
                "status": False,
                "data": "Error interno del proveedor",
            })

    def test_rechaza_datos_invalidos(self):
        with self.assertRaises(BlueExpressAPIError):
            parse_pricing_response({
                "status": True,
                "data": None,
            })

    def test_rechaza_total_ausente(self):
        payload = deepcopy(PRICING_RESPONSE)
        del payload["data"]["total"]

        with self.assertRaises(BlueExpressAPIError):
            parse_pricing_response(payload)

    def test_rechaza_importes_invalidos(self):
        for value in (-1, "NaN", "Infinity", True, None, "texto"):
            with self.subTest(value=value):
                payload = deepcopy(PRICING_RESPONSE)
                payload["data"]["total"] = value

                with self.assertRaises(BlueExpressAPIError):
                    parse_pricing_response(payload)

    def test_conserva_decimales_sin_redondear(self):
        payload = deepcopy(PRICING_RESPONSE)
        payload["data"]["total"] = "2646.25"

        result = parse_pricing_response(payload)

        self.assertEqual(result["total"], Decimal("2646.25"))

    def test_admite_fecha_ausente(self):
        payload = deepcopy(PRICING_RESPONSE)
        del payload["data"]["fechaEstimadaEntrega"]

        result = parse_pricing_response(payload)

        self.assertIsNone(result["fecha_estimada_entrega"])

    def test_rechaza_fecha_invalida(self):
        payload = deepcopy(PRICING_RESPONSE)
        payload["data"]["fechaEstimadaEntrega"] = "31-02-2026"

        with self.assertRaises(BlueExpressAPIError):
            parse_pricing_response(payload)