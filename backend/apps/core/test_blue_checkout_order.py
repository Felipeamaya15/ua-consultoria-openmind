from copy import deepcopy
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.core.delivery import delivery_defaults
from apps.core.models import (
    ConfiguracionEntrega,
    ConfiguracionPago,
    ItemPedido,
    Pedido,
    Tienda,
)
from apps.core.payments import TRANSFER_PUBLIC_FIELDS
from apps.shipping.infrastructure.blue_express.quote_tokens import (
    BlueExpressQuoteError,
)


REGIONS = [{
    "code": 13,
    "name": "Metropolitana de Santiago",
    "communes": [{
        "code": 13123,
        "name": "PROVIDENCIA",
        "districts": [{"code": "PRO", "name": "PROVIDENCIA"}],
    }],
}]

QUOTE = {
    "servicio": "EX",
    "total": "2646",
    "fecha_estimada_entrega": None,
    "producto_mongo_id": "blue-product-test",
    "sku": "BLUE-TEST-001",
    "cantidad": 1,
}


@override_settings(
    BLUE_EXPRESS={"ENABLED": True},
    BLUE_EXPRESS_CHECKOUT_TOTAL_CONFIRMED=True,
)
class BlueCheckoutOrderTests(TestCase):
    def setUp(self):
        owner = get_user_model().objects.create_user(
            username="blue-order-owner",
        )
        self.store = Tienda.objects.create(
            nombre="Tienda prueba pedido Blue",
            id_usuario_propietario=owner,
        )

        delivery = delivery_defaults()
        delivery["blue_express"]["enabled"] = True
        self.delivery = ConfiguracionEntrega.objects.create(
            tienda=self.store,
            datos=delivery,
        )
        ConfiguracionPago.objects.create(
            tienda=self.store,
            datos={
                "transfer": {
                    "enabled": True,
                    "fields": {
                        field: "qa"
                        for field in TRANSFER_PUBLIC_FIELDS
                    },
                },
            },
        )

        self.api = APIClient()
        self.payload = {
            "clave_checkout": str(uuid4()),
            "items": [{
                "producto_id": "blue-product-test",
                "sku": "BLUE-TEST-001",
                "cantidad": 1,
            }],
            "contacto": {
                "nombre": "Comprador de prueba",
                "email": "buyer@example.com",
            },
            "medio_pago": "Transferencia",
            "metodo_entrega": "Blue Express",
            "direccion": {
                "street": "Calle de prueba",
                "number": "123",
                "apt": "",
                "city": "Providencia",
                "region": "Metropolitana",
            },
            "destino_blue": {
                "region_code": 13,
                "commune_code": 13123,
                "district_code": "PRO",
            },
            "cotizacion": "referencia-simulada",
        }

        repository_patch = patch(
            "apps.core.presentation.checkout.ProductRepository"
        )
        self.repository_class = repository_patch.start()
        self.addCleanup(repository_patch.stop)

        self.repository_class.return_value.get_by_id.return_value = {
            "_id": "blue-product-test",
            "tienda_id": str(self.store.pk),
            "nombre": "Producto de prueba",
            "activo": True,
            "variantes": [{
                "sku": "BLUE-TEST-001",
                "precio": 10000,
                "stock": 10,
                "atributos_variante": [],
            }],
        }

        validation_patch = patch(
            "apps.core.blue_checkout.validate_catalog_quote",
            return_value=deepcopy(QUOTE),
        )
        self.validation = validation_patch.start()
        self.addCleanup(validation_patch.stop)

        geography_patch = patch(
            "apps.core.blue_checkout.fetch_geography",
            return_value=deepcopy(REGIONS),
        )
        geography_patch.start()
        self.addCleanup(geography_patch.stop)

    def submit(self):
        return self.api.post(
            "/api/checkout/pedidos/",
            deepcopy(self.payload),
            format="json",
        )

    def test_crea_pedido_con_importe_y_destino_blue(self):
        response = self.submit()

        self.assertEqual(response.status_code, 201, response.data)

        order = Pedido.objects.get()
        self.assertEqual(order.costo_envio, Decimal("2646"))
        self.assertEqual(order.monto_total, Decimal("12646"))
        self.assertEqual(order.entrega["metodo"], "Blue Express")
        self.assertEqual(
            order.entrega["cotizacion"]["destino_blue"]["district_code"],
            "PRO",
        )
        self.assertEqual(order.entrega["cotizacion"]["sku"], "BLUE-TEST-001")
        self.assertEqual(ItemPedido.objects.count(), 1)
        self.validation.assert_called_once()

    def test_cotizacion_rechazada_no_crea_pedido(self):
        self.validation.side_effect = BlueExpressQuoteError(
            "La cotización venció."
        )

        response = self.submit()

        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(Pedido.objects.exists())
        self.assertFalse(ItemPedido.objects.exists())
        self.repository_class.assert_not_called()

    @override_settings(BLUE_EXPRESS_CHECKOUT_TOTAL_CONFIRMED=False)
    def test_bloqueo_comercial_no_crea_pedido(self):
        response = self.submit()

        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(Pedido.objects.exists())
        self.assertFalse(ItemPedido.objects.exists())
        self.validation.assert_not_called()

    def test_deshabilitado_en_tienda_no_crea_pedido(self):
        self.delivery.datos["blue_express"]["enabled"] = False
        self.delivery.save()

        response = self.submit()

        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(Pedido.objects.exists())
        self.validation.assert_not_called()

    def test_direccion_distinta_no_crea_pedido(self):
        self.payload["direccion"]["city"] = "Santiago"

        response = self.submit()

        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(Pedido.objects.exists())
        self.assertFalse(ItemPedido.objects.exists())

    def test_reintento_no_duplica_pedido_ni_revalida_cotizacion(self):
        first = self.submit()
        self.assertEqual(first.status_code, 201, first.data)

        # Un pedido ya registrado debe conservar su resultado,
        # aunque posteriormente la referencia deje de ser válida.
        self.validation.side_effect = BlueExpressQuoteError(
            "La cotización venció."
        )

        second = self.submit()

        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(second.data["data"], first.data["data"])
        self.assertEqual(Pedido.objects.count(), 1)
        self.assertEqual(ItemPedido.objects.count(), 1)
        self.validation.assert_called_once()