from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import uuid4

from django.test import SimpleTestCase

from apps.catalog.domain.exceptions import (
    TransbankTransaccionException,
)
from apps.landing import mixed_activity_orders as mixed


class FakeCollection:
    """MongoDB simulado. Nunca conecta con una base real."""

    def __init__(self, stocks):
        self.stocks = dict(stocks)
        self.operations = set()
        self.calls = 0
        self.fail_after_update = False

    def with_options(self, **kwargs):
        return self

    def update_one(self, query, update):
        self.calls += 1

        operation = query[mixed.OPS]["$ne"]
        selection = query["variantes"]["$elemMatch"]
        sku = selection["sku"]
        required = selection["stock"]["$gte"]
        delta = update["$inc"]["variantes.$.stock"]

        if (
            operation in self.operations
            or self.stocks.get(sku, 0) < required
        ):
            return SimpleNamespace(modified_count=0)

        self.stocks[sku] += delta
        self.operations.add(operation)

        if self.fail_after_update:
            self.fail_after_update = False
            raise TimeoutError("Respuesta de MongoDB perdida")

        return SimpleNamespace(modified_count=1)

    def find_one(self, query, projection):
        operation = query.get(mixed.OPS)

        if operation is not None:
            if operation in self.operations:
                return {"_id": query["_id"]}
            return None

        return {mixed.OPS: list(self.operations)}


class MixedStockSafetyTests(SimpleTestCase):

    def setUp(self):
        self.order = SimpleNamespace(
            clave_checkout=uuid4(),
            tienda_id=1,
            stock_descontado=False,
            save=Mock(),
        )

    def line(self, sku="SKU-A", quantity=2, pk=11):
        return SimpleNamespace(
            pk=pk,
            producto_mongo_id="a" * 24,
            sku=sku,
            cantidad=quantity,
            id_producto_id=None,
            precio_unitario=Decimal("5000"),
        )

    def repository(self, collection):
        return patch(
            "apps.landing.mixed_activity_orders.ProductRepository",
            return_value=SimpleNamespace(collection=collection),
        )

    def test_descontar_stock_una_vez(self):
        collection = FakeCollection({"SKU-A": 8})
        line = self.line()

        with self.repository(collection):
            mixed.deduct_locked(self.order, [line])
            mixed.deduct_locked(self.order, [line])

        self.assertEqual(collection.stocks["SKU-A"], 6)
        self.assertEqual(len(collection.operations), 1)
        self.assertEqual(collection.calls, 1)
        self.assertTrue(self.order.stock_descontado)

    def test_reintento_no_descontar_dos_veces(self):
        collection = FakeCollection({"SKU-A": 8})
        line = self.line()

        with self.repository(collection):
            mixed.deduct_locked(self.order, [line])

            # Simula que SQL no conservó el indicador.
            self.order.stock_descontado = False

            mixed.deduct_locked(self.order, [line])

        self.assertEqual(collection.stocks["SKU-A"], 6)
        self.assertEqual(len(collection.operations), 1)
        self.assertTrue(self.order.stock_descontado)

    def test_timeout_no_duplica_descuento(self):
        collection = FakeCollection({"SKU-A": 8})
        collection.fail_after_update = True
        line = self.line()

        with self.repository(collection):
            with self.assertRaises(TransbankTransaccionException):
                mixed.deduct_locked(self.order, [line])

            self.assertFalse(self.order.stock_descontado)

            # Reconciliación tras un resultado incierto.
            mixed.deduct_locked(self.order, [line])

        self.assertEqual(collection.stocks["SKU-A"], 6)
        self.assertEqual(len(collection.operations), 1)
        self.assertTrue(self.order.stock_descontado)

    def test_stock_insuficiente_no_descontar(self):
        collection = FakeCollection({"SKU-A": 1})

        with self.repository(collection):
            with self.assertRaises(TransbankTransaccionException):
                mixed.deduct_locked(self.order, [self.line()])

        self.assertEqual(collection.stocks["SKU-A"], 1)
        self.assertFalse(collection.operations)
        self.assertFalse(self.order.stock_descontado)

    def test_dos_variantes_recuperan_operacion_parcial(self):
        collection = FakeCollection({
            "SKU-A": 5,
            "SKU-B": 0,
        })

        first = self.line("SKU-A", 2, 11)
        second = self.line("SKU-B", 2, 12)

        with self.repository(collection):
            with self.assertRaises(TransbankTransaccionException):
                mixed.deduct_locked(
                    self.order, [first, second]
                )

            self.assertEqual(collection.stocks["SKU-A"], 3)
            self.assertFalse(self.order.stock_descontado)

            # Se repone stock de la segunda variante.
            collection.stocks["SKU-B"] = 4

            mixed.deduct_locked(
                self.order, [first, second]
            )

        self.assertEqual(collection.stocks["SKU-A"], 3)
        self.assertEqual(collection.stocks["SKU-B"], 2)
        self.assertEqual(len(collection.operations), 2)
        self.assertTrue(self.order.stock_descontado)

    def test_detectar_descuento_inconcluso(self):
        collection = FakeCollection({"SKU-A": 8})
        line = self.line()

        with self.repository(collection), patch(
            "apps.landing.mixed_activity_orders.physical_lines",
            return_value=[line],
        ):
            self.assertFalse(
                mixed.has_stock_effects(self.order)
            )

            mixed.deduct_locked(self.order, [line])

            self.order.stock_descontado = False

            self.assertTrue(
                mixed.has_stock_effects(self.order)
            )

    def test_total_mixto_debe_coincidir(self):
        order = SimpleNamespace(
            monto_total=Decimal("35000"),
            descuento=Decimal("0"),
            costo_envio=Decimal("0"),
        )

        activity = SimpleNamespace(
            precio_unitario=Decimal("15000"),
            cantidad=2,
        )

        product = self.line(quantity=1)

        self.assertEqual(
            mixed.validate_total(
                order, [activity], [product]
            ),
            Decimal("35000"),
        )

        order.monto_total = Decimal("34999")

        with self.assertRaises(TransbankTransaccionException):
            mixed.validate_total(
                order, [activity], [product]
            )
