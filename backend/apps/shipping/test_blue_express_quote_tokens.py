from copy import deepcopy
from unittest.mock import patch

from django.test import SimpleTestCase

from apps.shipping.infrastructure.blue_express.quote_tokens import (
    BlueExpressQuoteError,
    QUOTE_MAX_AGE,
    issue_quote_token,
    validate_quote_token,
)


CONTEXT = {
    "store_id": 2,
    "product_id": "6af4059d339b3f569cf380a3",
    "sku": "BLUE-TEST-001",
    "quantity": 1,
    "destination": {
        "region_code": 13,
        "commune_code": 13123,
        "district_code": "PRO",
    },
    "origin": {
        "region_code": 13,
        "commune_code": 13124,
        "district_code": "PUD",
    },
    "measures": {
        "weight_kg": "0.500",
        "length_cm": "20.00",
        "width_cm": "15.00",
        "height_cm": "10.00",
    },
    "service": "EX",
}

# Importe ficticio para probar firmas, no una tarifa para cobrar.
QUOTE = {
    "total": "2646.00",
    "service": "EX",
}


class BlueExpressQuoteTokenTests(SimpleTestCase):
    def issue(self):
        return issue_quote_token(context=CONTEXT, quote=QUOTE)

    def test_acepta_cotizacion_sin_cambios(self):
        result = validate_quote_token(
            token=self.issue(),
            expected_context=deepcopy(CONTEXT),
        )
        self.assertEqual(result, QUOTE)

    def test_rechaza_firma_modificada(self):
        token = self.issue()
        body, signature = token.rsplit(":", 1)
        replacement = "A" if signature[0] != "A" else "B"
        modified = body + ":" + replacement + signature[1:]

        with self.assertRaises(BlueExpressQuoteError):
            validate_quote_token(
                token=modified,
                expected_context=CONTEXT,
            )

    def test_rechaza_cambios_en_tienda_producto_sku_o_cantidad(self):
        for key, value in (
            ("store_id", 3),
            ("product_id", "otro-producto"),
            ("sku", "OTRO-SKU"),
            ("quantity", 2),
        ):
            with self.subTest(key=key):
                context = deepcopy(CONTEXT)
                context[key] = value

                with self.assertRaises(BlueExpressQuoteError):
                    validate_quote_token(
                        token=self.issue(),
                        expected_context=context,
                    )

    def test_rechaza_cambios_de_destino_origen_o_medidas(self):
        for section, key, value in (
            ("destination", "district_code", "SCL"),
            ("origin", "district_code", "PRO"),
            ("measures", "weight_kg", "1.000"),
        ):
            with self.subTest(section=section):
                context = deepcopy(CONTEXT)
                context[section][key] = value

                with self.assertRaises(BlueExpressQuoteError):
                    validate_quote_token(
                        token=self.issue(),
                        expected_context=context,
                    )

    def test_rechaza_cotizacion_vencida(self):
        with patch("django.core.signing.time.time", return_value=1000):
            token = self.issue()

        with patch(
            "django.core.signing.time.time",
            return_value=1000 + QUOTE_MAX_AGE + 1,
        ):
            with self.assertRaisesRegex(BlueExpressQuoteError, "venció"):
                validate_quote_token(
                    token=token,
                    expected_context=CONTEXT,
                )

    def test_rechaza_token_vacio(self):
        with self.assertRaises(BlueExpressQuoteError):
            validate_quote_token(
                token="",
                expected_context=CONTEXT,
            )