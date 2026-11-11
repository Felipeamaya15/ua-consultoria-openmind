from copy import deepcopy
from decimal import Decimal
from unittest.mock import patch
from django.test import SimpleTestCase
from apps.shipping.infrastructure.blue_express.cart import normalize_items, package_for_cart, BlueExpressCartError
from apps.shipping.infrastructure.blue_express import service
from apps.shipping.infrastructure.blue_express.quote_tokens import BlueExpressQuoteError, QUOTE_MAX_AGE

CART = [{"producto_id": "A", "sku": "SKU-A", "cantidad": 2},
        {"producto_id": "B", "sku": "SKU-B", "cantidad": 3}]
DEST = {"region_code": 13, "commune_code": 13123, "district_code": "PRO"}
REGIONS = [{"code": 13, "name": "Metropolitana", "communes": [{"code": 13123, "name": "Providencia", "districts": [{"code": "PRO", "name": "Providencia"}]}]}]


def catalog(**kwargs):
    return {"product_id": kwargs["product_id"], "sku": kwargs["sku"],
        "measures": {"weight_kg": Decimal("0.5"), "length_cm": Decimal("20"),
                     "width_cm": Decimal("10"), "height_cm": Decimal("5")}}


class BlueCartTests(SimpleTestCase):
    def setUp(self):
        self.patcher = patch('apps.shipping.infrastructure.blue_express.cart.package_for_catalog_item', side_effect=catalog)
        self.lookup = self.patcher.start()
        self.addCleanup(self.patcher.stop)

    def test_suma_peso_y_volumen_por_cantidad(self):
        result = package_for_cart(store_id=1, items=CART)
        self.assertEqual(Decimal(result['measures']['weight_kg']), Decimal('2.5'))
        side = Decimal(result['measures']['length_cm'])
        self.assertGreaterEqual(side ** 3, Decimal(5000))
        self.assertLess((side - Decimal('0.01')) ** 3, Decimal(5000))
        self.assertEqual(self.lookup.call_count, 2)  # Una lectura por SKU, no por unidad.

    def test_raiz_exacta_no_agrega_centimetros(self):
        result = package_for_cart(store_id=1, items=[{**CART[0], 'cantidad': 8}])
        self.assertEqual(Decimal(result['measures']['height_cm']), Decimal(20))

    def test_normaliza_orden_sin_mutar_entrada(self):
        original = deepcopy(CART)
        self.assertEqual(normalize_items(list(reversed(CART))), CART)
        self.assertEqual(CART, original)

    def test_rechaza_cantidades_y_precios_del_cliente(self):
        for quantity in (0, -1, True, 1.5, '2', 100001):
            with self.subTest(quantity=quantity), self.assertRaises(BlueExpressCartError):
                normalize_items([{**CART[0], 'cantidad': quantity}])
        for payload in ([], CART * 51, [{**CART[0], 'precio': 1}], [CART[0], CART[0]]):
            with self.assertRaises(BlueExpressCartError):
                normalize_items(payload)
        self.lookup.assert_not_called()

    def test_no_permite_duplicar_producto_por_alias(self):
        self.lookup.side_effect = lambda **kw: {**catalog(**kw), 'product_id': 'same', 'sku': 'same'}
        with self.assertRaises(BlueExpressCartError):
            package_for_cart(store_id=1, items=CART)

    def test_ficha_incompleta_no_cotiza(self):
        self.lookup.side_effect = ValueError('Falta ficha logística')
        with self.assertRaises(ValueError):
            package_for_cart(store_id=1, items=CART)


class BlueCartSignatureTests(SimpleTestCase):
    def setUp(self):
        BlueCartTests.setUp(self)
        self.patches = [
            patch.object(service, 'get_service_config', return_value={'environment':'qa', 'url':'https://example.invalid/pricing', 'client_account':'test'}),
            patch.object(service, 'fetch_geography', return_value=REGIONS),
            patch.object(service, 'origin_for_store', return_value=DEST),
            patch.object(service.BlueExpressClient, 'request_json', return_value={}),
            patch.object(service, 'parse_pricing_response', return_value={
                'proveedor':'BLUE_EXPRESS', 'tarifa':Decimal('1000'), 'flete':Decimal('3000'),
                'servicio_adicional':Decimal('0'), 'total':Decimal('4000'), 'fecha_estimada_entrega':None}),
        ]
        self.mocks = [p.start() for p in self.patches]
        for p in self.patches:
            self.addCleanup(p.stop)

    def issue(self):
        return service.quote_catalog_cart(store_id=1, items=CART, destination=DEST)

    def test_firma_carrito_y_valida_sin_volver_a_pedir_precio(self):
        result = self.issue()
        restored = service.validate_catalog_cart(token=result['cotizacion'], store_id=1, items=list(reversed(CART)), destination=DEST)
        self.assertEqual(restored['total'], '4000')
        self.assertEqual(restored['items'], CART)
        self.assertIn('vence_en', restored)
        self.assertEqual(self.mocks[3].call_count, 1)

    def test_rechaza_cambio_de_cantidad_aunque_peso_coincida(self):
        token = self.issue()['cotizacion']
        changed = [{**CART[0], 'cantidad':3}, {**CART[1], 'cantidad':2}]
        with self.assertRaises(BlueExpressQuoteError):
            service.validate_catalog_cart(token=token, store_id=1, items=changed, destination=DEST)

    def test_rechaza_medidas_actualizadas(self):
        token = self.issue()['cotizacion']
        self.lookup.side_effect = lambda **kw: {**catalog(**kw), 'measures': {**catalog(**kw)['measures'], 'weight_kg': Decimal('1')}}
        with self.assertRaises(BlueExpressQuoteError):
            service.validate_catalog_cart(token=token, store_id=1, items=CART, destination=DEST)

    def test_rechaza_cambio_tienda(self):
        token = self.issue()['cotizacion']
        with self.assertRaises(BlueExpressQuoteError):
            service.validate_catalog_cart(token=token, store_id=2, items=CART, destination=DEST)

    def test_rechaza_vencimiento(self):
        with patch('time.time', return_value=1000):
            token = self.issue()['cotizacion']
        with patch('time.time', return_value=1000 + QUOTE_MAX_AGE + 1), self.assertRaises(BlueExpressQuoteError):
            service.validate_catalog_cart(token=token, store_id=1, items=CART, destination=DEST)
