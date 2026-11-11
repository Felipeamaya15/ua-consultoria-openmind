from copy import deepcopy
from uuid import uuid4

from django.test import SimpleTestCase

from apps.core.presentation.checkout import CheckoutSerializer


def checkout_payload():
    return {
        "clave_checkout": str(uuid4()),
        "items": [{
            "producto_id": "6af4059d339b3f569cf380a3",
            "sku": "BLUE-TEST-001",
            "cantidad": 1,
        }],
        "contacto": {
            "nombre": "Cliente de prueba",
            "email": "cliente@example.com",
            "telefono": "900000000",
        },
        "medio_pago": "Transferencia",
        "metodo_entrega": "Blue Express",
        "direccion": {
            "street": "Calle de prueba",
            "number": "123",
            "apt": "",
            "city": "Providencia",
            "region": "Metropolitana de Santiago",
        },
        "destino_blue": {
            "region_code": 13,
            "commune_code": 13123,
            "district_code": "PRO",
        },
        # Solo prueba el formato de entrada, no la autenticidad de la firma.
        "cotizacion": "referencia-de-prueba",
    }


class BlueCheckoutSerializerTests(SimpleTestCase):
    def test_acepta_formato_completo_de_blue(self):
        serializer = CheckoutSerializer(data=checkout_payload())

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(
            serializer.validated_data["destino_blue"]["district_code"],
            "PRO",
        )

    def test_exige_cotizacion(self):
        payload = checkout_payload()
        del payload["cotizacion"]

        serializer = CheckoutSerializer(data=payload)

        self.assertFalse(serializer.is_valid())
        self.assertIn("cotizacion", serializer.errors)

    def test_exige_destino_blue(self):
        payload = checkout_payload()
        del payload["destino_blue"]

        serializer = CheckoutSerializer(data=payload)

        self.assertFalse(serializer.is_valid())
        self.assertIn("destino_blue", serializer.errors)

    def test_exige_region_en_la_direccion(self):
        payload = checkout_payload()
        payload["direccion"]["region"] = ""

        serializer = CheckoutSerializer(data=payload)

        self.assertFalse(serializer.is_valid())
        self.assertIn("direccion", serializer.errors)

    def test_rechaza_mas_de_una_unidad(self):
        payload = checkout_payload()
        payload["items"][0]["cantidad"] = 2

        serializer = CheckoutSerializer(data=payload)

        self.assertFalse(serializer.is_valid())
        self.assertIn("items", serializer.errors)

    def test_rechaza_multiples_lineas_incluso_del_mismo_sku(self):
        payload = checkout_payload()
        payload["items"].append(deepcopy(payload["items"][0]))

        serializer = CheckoutSerializer(data=payload)

        self.assertFalse(serializer.is_valid())
        self.assertIn("items", serializer.errors)

    def test_rechaza_destino_blue_para_otro_transportista(self):
        payload = checkout_payload()
        payload["metodo_entrega"] = "Chilexpress"

        serializer = CheckoutSerializer(data=payload)

        self.assertFalse(serializer.is_valid())
        self.assertIn("destino_blue", serializer.errors)

    def test_rechaza_precio_de_envio_enviado_por_el_cliente(self):
        payload = checkout_payload()
        payload["costo_envio"] = "1"

        serializer = CheckoutSerializer(data=payload)

        self.assertFalse(serializer.is_valid())
        self.assertIn("costo_envio", serializer.errors)