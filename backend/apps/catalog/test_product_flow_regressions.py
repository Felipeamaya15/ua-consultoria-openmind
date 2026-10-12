from copy import deepcopy
from unittest.mock import Mock

from django.test import SimpleTestCase

from apps.catalog.application.use_cases import GetPublicProductDetailUseCase, resolver_datos_item
from apps.catalog.presentation.serializers import ProductPublicListItemSerializer
from apps.core.test_checkout import CheckoutOrderTests
from apps.core.models import Producto


class PublicVariantRegressionTests(SimpleTestCase):
    def setUp(self):
        self.product = {'_id': 'test', 'nombre': 'Producto', 'slug': 'producto', 'categoria': 'Prueba',
                        'activo': True, 'variantes': [
                            {'sku': 'A', 'precio': 100, 'stock': 2},
                            {'sku': 'B', 'precio': 200, 'precio_oferta': 150, 'stock': 3},
                            {'sku': 'OFF', 'precio': 1, 'stock': 9, 'es_activa': False}]}

    def test_list_price_and_offer_belong_to_same_active_variant(self):
        result = ProductPublicListItemSerializer(self.product).data
        self.assertEqual(result['precio'], 100)
        self.assertIsNone(result['precio_oferta'])
        self.product['variantes'][1]['precio_oferta'] = 80
        result = ProductPublicListItemSerializer(self.product).data
        self.assertEqual((result['precio'], result['precio_oferta']), (200, 80))

    def test_soft_deleted_variants_do_not_reach_detail_or_availability(self):
        original = deepcopy(self.product)
        repo = Mock()
        repo.get_by_slug.return_value = self.product
        detail = GetPublicProductDetailUseCase(repo).execute('37', 'producto')
        self.assertEqual([v['sku'] for v in detail['variantes']], ['A', 'B'])
        self.assertEqual(self.product, original)
        self.product['variantes'] = self.product['variantes'][2:]
        self.assertFalse(ProductPublicListItemSerializer(self.product).data['disponible'])

    def test_persisted_cart_marks_inactive_variant_as_unavailable(self):
        item = Mock(sku='OFF')
        item.id_producto.activo = True
        item.id_producto.precio = 100
        service = Mock()
        service.get_variant_by_sku.return_value = self.product['variantes'][2]
        self.assertEqual(resolver_datos_item(item, service)[0], 0)

    def test_cart_detail_link_resolves_mongo_id_in_same_store_only(self):
        repo = Mock()
        repo.get_by_slug.return_value = None
        repo.get_by_id.return_value = self.product
        product_id = '0123456789abcdef01234567'
        self.assertEqual(GetPublicProductDetailUseCase(repo).execute('37', product_id)['slug'], 'producto')
        repo.get_by_id.assert_called_once_with('37', product_id)
        repo.get_by_id.return_value = None
        self.assertIsNone(GetPublicProductDetailUseCase(repo).execute('92', product_id))


class CheckoutVariantRegressionTests(CheckoutOrderTests):
    # Reutiliza únicamente la fixture; la suite original se ejecuta por separado.
    def test_checkout_rejects_legacy_soft_deleted_variant_without_order_or_stock_change(self):
        from apps.core.models import Pedido
        from bson import ObjectId
        self.repo.collection.update_one({'_id': ObjectId(self.product_id)},
                                        {'$set': {'variantes.0.es_activa': False}})
        self.assertEqual(self.create().status_code, 400)
        self.assertFalse(Pedido.objects.exists())
        self.assertEqual(self.repo.get_by_id(str(self.store.pk), self.product_id)['variantes'][0]['stock'], 7)

    def test_checkout_refreshes_stale_sql_stock_from_mongo_without_negative_stock(self):
        from bson import ObjectId
        product = Producto.objects.create(id_tienda=self.store, nombre='Espejo', precio=10000, stock=0)
        self.repo.collection.update_one({'_id': ObjectId(self.product_id)}, {'$set': {'id_producto': product.pk}})
        self.assertEqual(self.create().status_code, 201)
        product.refresh_from_db()
        self.assertEqual(product.stock, 12)  # 7 + 8 - 2 - 1, una sola reserva por línea.


def load_tests(loader, tests, pattern):
    import unittest
    suite = loader.loadTestsFromTestCase(PublicVariantRegressionTests)
    suite.addTests(unittest.TestSuite(CheckoutVariantRegressionTests(name) for name in (
        'test_checkout_rejects_legacy_soft_deleted_variant_without_order_or_stock_change',
        'test_checkout_refreshes_stale_sql_stock_from_mongo_without_negative_stock',
    )))
    return suite
