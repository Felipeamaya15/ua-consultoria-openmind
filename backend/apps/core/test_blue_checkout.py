from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from apps.core.blue_checkout import blue_quote_for_checkout
from apps.core.shipping import ErrorCotizacion
from apps.shipping.infrastructure.blue_express.client import (
    BlueExpressAPIError,
)
from apps.shipping.infrastructure.blue_express.quote_tokens import (
    BlueExpressQuoteError,
)


MODULE = "apps.core.blue_checkout"

REGIONS = [{
    "code": 13,
    "name": "Metropolitana de Santiago",
    "communes": [{
        "code": 13123,
        "name": "PROVIDENCIA",
        "districts": [{
            "code": "PRO",
            "name": "PROVIDENCIA",
        }],
    }],
}]

QUOTE = {
    "servicio": "EX",
    "total": "2646",
    "fecha_estimada_entrega": None,
    "producto_mongo_id": "6af4059d339b3f569cf380a3",
    "sku": "BLUE-TEST-001",
    "cantidad": 1,
}


def checkout_data():
    return {
        "items": [{
            "producto_id": "6af4059d339b3f569cf380a3",
            "sku": "BLUE-TEST-001",
            "cantidad": 1,
        }],
        "cotizacion": "referencia-de-prueba",
        "destino_blue": {
            "region_code": 13,
            "commune_code": 13123,
            "district_code": "PRO",
        },
        "direccion": {
            "street": "Calle de prueba",
            "number": "123",
            "city": "Providencia",
            "region": "Metropolitana",
        },
    }


@override_settings(BLUE_EXPRESS_CHECKOUT_TOTAL_CONFIRMED=True)
class BlueCheckoutTests(SimpleTestCase):
    def setUp(self):
        self.store = SimpleNamespace(pk=2)

        validation_patch = patch(
            MODULE + ".validate_catalog_quote",
            return_value=deepcopy(QUOTE),
        )
        self.validation = validation_patch.start()
        self.addCleanup(validation_patch.stop)

        geography_patch = patch(
            MODULE + ".fetch_geography",
            return_value=deepcopy(REGIONS),
        )
        self.geography = geography_patch.start()
        self.addCleanup(geography_patch.stop)

    def calculate(self, data=None):
        return blue_quote_for_checkout(
            self.store,
            checkout_data() if data is None else data,
        )

    def test_utiliza_importe_validado_y_guarda_destino(self):
        result = self.calculate()

        self.assertEqual(result["monto"], "2646")
        self.assertEqual(result["moneda"], "CLP")
        self.assertEqual(result["operador"], "Blue Express")
        self.assertEqual(result["destino_blue"]["district_code"], "PRO")
        self.assertEqual(result["producto_mongo_id"], QUOTE["producto_mongo_id"])
        self.assertEqual(result["sku"], "BLUE-TEST-001")

        self.validation.assert_called_once_with(
            token="referencia-de-prueba",
            store_id=2,
            product_id=QUOTE["producto_mongo_id"],
            sku="BLUE-TEST-001",
            quantity=1,
            destination=checkout_data()["destino_blue"],
        )

    @override_settings(BLUE_EXPRESS_CHECKOUT_TOTAL_CONFIRMED=False)
    def test_bloqueo_comercial_no_consulta_servicios(self):
        with self.assertRaises(ErrorCotizacion) as caught:
            self.calculate()

        self.assertEqual(
            caught.exception.codigo_error,
            "BLUE_CHECKOUT_NO_DISPONIBLE",
        )
        self.validation.assert_not_called()
        self.geography.assert_not_called()

    def test_rechaza_comuna_distinta_de_la_cotizada(self):
        data = checkout_data()
        data["direccion"]["city"] = "Santiago"

        with self.assertRaises(ErrorCotizacion) as caught:
            self.calculate(data)

        self.assertEqual(caught.exception.codigo_error, "DESTINO_INVALIDO")

    def test_rechaza_region_distinta_de_la_cotizada(self):
        data = checkout_data()
        data["direccion"]["region"] = "Valparaíso"

        with self.assertRaises(ErrorCotizacion) as caught:
            self.calculate(data)

        self.assertEqual(caught.exception.codigo_error, "DESTINO_INVALIDO")

    def test_rechaza_cotizacion_invalida(self):
        self.validation.side_effect = BlueExpressQuoteError(
            "La cotización es inválida."
        )

        with self.assertRaises(ErrorCotizacion) as caught:
            self.calculate()

        self.assertEqual(
            caught.exception.codigo_error,
            "BLUE_COTIZACION_INVALIDA",
        )
        self.geography.assert_not_called()

    def test_rechaza_importes_invalidos_sin_redondearlos(self):
        for amount in ("-1", "NaN", "Infinity", "2646.25", None, True):
            with self.subTest(amount=amount):
                self.validation.return_value = {
                    **QUOTE,
                    "total": amount,
                }

                with self.assertRaises(ErrorCotizacion) as caught:
                    self.calculate()

                self.assertEqual(
                    caught.exception.codigo_error,
                    "BLUE_IMPORTE_INVALIDO",
                )

    def test_error_proveedor_no_expone_detalles_internos(self):
        self.validation.side_effect = BlueExpressAPIError(
            "ORA-20104: detalle interno"
        )

        with self.assertRaises(ErrorCotizacion) as caught:
            self.calculate()

        self.assertEqual(
            caught.exception.codigo_error,
            "BLUE_PROVEEDOR_ERROR",
        )
        self.assertNotIn("ORA-", str(caught.exception))

    def test_valida_carrito_completo_y_conserva_items(self):
        data = checkout_data()
        data["items"][0]["cantidad"] = 2
        with patch(MODULE + ".validate_catalog_cart", return_value={"servicio": "EX", "total": "4000"}) as validate:
            result = self.calculate(data)
        validate.assert_called_once_with(token=data["cotizacion"], store_id=self.store.pk,
            items=data["items"], destination=data["destino_blue"])
        self.assertEqual(result["monto"], "4000")
        self.assertEqual(result["items"], data["items"])
        self.validation.assert_not_called()
