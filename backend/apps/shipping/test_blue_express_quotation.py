from decimal import Decimal
from unittest.mock import patch

from django.test import SimpleTestCase

from apps.shipping.infrastructure.blue_express.client import (
    BlueExpressAPIError,
)
from apps.shipping.infrastructure.blue_express.geography import (
    BlueExpressDestinationError,
)
from apps.shipping.infrastructure.blue_express.quotation import (
    BlueExpressPackageError,
    build_pricing_payload,
    quote_single_package,
)


REGIONS = [{
    "code": 13,
    "name": "Metropolitana de Santiago",
    "communes": [
        {
            "code": 13124,
            "name": "PUDAHUEL",
            "districts": [{"code": "PUD", "name": "PUDAHUEL"}],
        },
        {
            "code": 13101,
            "name": "SANTIAGO",
            "districts": [{"code": "SCL", "name": "SANTIAGO"}],
        },
    ],
}]

CLIENT_REQUEST = (
    "apps.shipping.infrastructure.blue_express."
    "quotation.BlueExpressClient.request_json"
)


def package_args():
    return {
        "origin": {
            "region_code": 13,
            "commune_code": 13124,
            "district_code": "PUD",
        },
        "destination": {
            "region_code": 13,
            "commune_code": 13101,
            "district_code": "SCL",
        },
        "weight_kg": "0.10",
        "length_cm": "10",
        "width_cm": "10",
        "height_cm": "10",
    }


class BlueExpressQuotationTests(SimpleTestCase):
    def test_construye_request_del_ejemplo(self):
        payload = build_pricing_payload(REGIONS, **package_args())

        self.assertEqual(payload, {
            "from": {"country": "CL", "district": "PUD"},
            "to": {
                "country": "CL",
                "state": 13,
                "district": "SCL",
            },
            "serviceType": "EX",
            "serviciosComplementarios": None,
            "datosProducto": {
                "producto": "P",
                "familiaProducto": "PAQU",
                "largo": "10",
                "ancho": "10",
                "alto": "10",
                "pesoFisico": "0.1",
                "cantidadPiezas": 1,
                "unidades": 1,
            },
        })

    @patch(CLIENT_REQUEST)
    def test_medidas_invalidas_no_consultan_blue(self, request):
        for field in (
            "weight_kg", "length_cm", "width_cm", "height_cm"
        ):
            for value in (0, -1, True, None, "NaN", "Infinity", "texto"):
                with self.subTest(field=field, value=value):
                    arguments = package_args()
                    arguments[field] = value

                    with self.assertRaises(BlueExpressPackageError):
                        quote_single_package(REGIONS, **arguments)

        request.assert_not_called()

    @patch(CLIENT_REQUEST)
    def test_destino_incorrecto_no_consulta_blue(self, request):
        arguments = package_args()
        arguments["destination"]["district_code"] = "PUD"

        with self.assertRaises(BlueExpressDestinationError):
            quote_single_package(REGIONS, **arguments)

        request.assert_not_called()

    @patch(CLIENT_REQUEST)
    def test_origen_incorrecto_no_consulta_blue(self, request):
        arguments = package_args()
        arguments["origin"]["district_code"] = "SCL"

        with self.assertRaises(BlueExpressDestinationError):
            quote_single_package(REGIONS, **arguments)

        request.assert_not_called()

    @patch(CLIENT_REQUEST)
    def test_cotiza_y_normaliza_respuesta(self, request):
        request.return_value = {
            "status": True,
            "data": {
                "tarifa": 10584.0,
                "flete": 2646.0,
                "servicioAdicional": 0.0,
                "total": 2646.0,
                "fechaEstimadaEntrega": "25-01-2023",
            },
        }

        result = quote_single_package(REGIONS, **package_args())

        self.assertEqual(result["total"], Decimal("2646"))
        self.assertEqual(result["servicio"], "EX")
        request.assert_called_once_with(
            "pricing",
            method="POST",
            payload=build_pricing_payload(REGIONS, **package_args()),
        )

    @patch(CLIENT_REQUEST)
    def test_error_del_proveedor_no_se_convierte_en_envio_gratis(
        self, request
    ):
        request.side_effect = BlueExpressAPIError(
            "Blue Express rechazó la operación."
        )

        with self.assertRaises(BlueExpressAPIError):
            quote_single_package(REGIONS, **package_args())

        request.assert_called_once()