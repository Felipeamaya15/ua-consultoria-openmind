from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.core.models import (
    FichaLogistica,
    Producto,
    Tienda,
    VarianteProducto,
)
from apps.shipping.infrastructure.blue_express.packages import (
    BlueExpressCatalogError,
    package_for_product,
)


class BlueExpressPackagesTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        owner = get_user_model().objects.create_user(
            username="blue-packages-test",
        )
        cls.store = Tienda.objects.create(
            nombre="Tienda de prueba Blue",
            id_usuario_propietario=owner,
        )
        cls.other_store = Tienda.objects.create(
            nombre="Otra tienda de prueba",
            id_usuario_propietario=owner,
        )
        cls.product = Producto.objects.create(
            nombre="Producto de prueba",
            precio=Decimal("10000"),
            stock=10,
            activo=True,
            id_tienda=cls.store,
        )
        FichaLogistica.objects.create(
            producto=cls.product,
            peso_kg=Decimal("0.500"),
            largo_cm=Decimal("20"),
            ancho_cm=Decimal("15"),
            alto_cm=Decimal("10"),
        )

    def get_package(self, **changes):
        arguments = {
            "store_id": self.store.pk,
            "product_id": self.product.pk,
        }
        arguments.update(changes)
        return package_for_product(**arguments)

    def create_variant(self, product=None):
        return VarianteProducto.objects.create(
            id_producto=product or self.product,
            sku="BLUE-TEST-VARIANT",
            precio=Decimal("12000"),
            stock=5,
            atributos={"talla": "M"},
            es_activa=True,
        )

    def test_obtiene_medidas_del_producto(self):
        self.assertEqual(self.get_package(), {
            "weight_kg": Decimal("0.500"),
            "length_cm": Decimal("20"),
            "width_cm": Decimal("15"),
            "height_cm": Decimal("10"),
        })

    def test_rechaza_producto_de_otra_tienda(self):
        with self.assertRaises(BlueExpressCatalogError):
            self.get_package(store_id=self.other_store.pk)

    def test_rechaza_producto_inactivo(self):
        self.product.activo = False
        self.product.save(update_fields=["activo"])

        with self.assertRaises(BlueExpressCatalogError):
            self.get_package()

    def test_rechaza_producto_sin_ficha(self):
        FichaLogistica.objects.filter(
            producto=self.product,
        ).delete()

        with self.assertRaises(BlueExpressCatalogError):
            self.get_package()

    def test_exige_seleccionar_variante_activa(self):
        self.create_variant()

        with self.assertRaises(BlueExpressCatalogError):
            self.get_package()

    def test_variante_sin_ficha_no_hereda_medidas(self):
        variant = self.create_variant()

        with self.assertRaises(BlueExpressCatalogError):
            self.get_package(variant_id=variant.pk)

    def test_obtiene_medidas_propias_de_variante(self):
        variant = self.create_variant()
        FichaLogistica.objects.create(
            variante=variant,
            peso_kg=Decimal("0.750"),
            largo_cm=Decimal("25"),
            ancho_cm=Decimal("18"),
            alto_cm=Decimal("12"),
        )

        self.assertEqual(
            self.get_package(variant_id=variant.pk),
            {
                "weight_kg": Decimal("0.750"),
                "length_cm": Decimal("25"),
                "width_cm": Decimal("18"),
                "height_cm": Decimal("12"),
            },
        )

    def test_rechaza_variante_de_otro_producto(self):
        other_product = Producto.objects.create(
            nombre="Otro producto",
            precio=Decimal("8000"),
            stock=5,
            id_tienda=self.store,
        )
        variant = self.create_variant(product=other_product)

        with self.assertRaises(BlueExpressCatalogError):
            self.get_package(variant_id=variant.pk)

    def test_rechaza_variante_inactiva(self):
        variant = self.create_variant()
        variant.es_activa = False
        variant.save(update_fields=["es_activa"])

        with self.assertRaises(BlueExpressCatalogError):
            self.get_package(variant_id=variant.pk)