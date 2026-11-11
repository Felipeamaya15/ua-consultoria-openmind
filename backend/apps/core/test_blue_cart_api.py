from unittest.mock import patch
from types import SimpleNamespace
from django.test import SimpleTestCase, override_settings
from django.core.cache import cache
from rest_framework.test import APIRequestFactory
from apps.core.presentation.blue_public_shipping import BluePublicShippingQuoteAPIView

MODULE='apps.core.presentation.blue_public_shipping'

@override_settings(BLUE_EXPRESS_CHECKOUT_TOTAL_CONFIRMED=True)
class BlueCartAPITests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.payload={'items':[{'producto_id':'A','sku':'SKU-A','cantidad':2}, {'producto_id':'B','sku':'SKU-B','cantidad':1}],
                      'destino':{'region_code':13,'commune_code':13123,'district_code':'PRO'}}
        self.factory=APIRequestFactory()

    def request(self, payload):
        with patch(MODULE+'.resolver_tienda', return_value=SimpleNamespace(pk=1)), patch(MODULE+'.delivery_for_store', return_value={'blue_express':{'enabled':True}}):
            return BluePublicShippingQuoteAPIView.as_view()(self.factory.post('/',payload,format='json'))

    def test_cotiza_carrito_completo_como_invitado(self):
        with patch(MODULE+'.quote_catalog_cart',return_value={'total':'4000','cotizacion':'signed'}) as quote:
            response=self.request(self.payload)
        self.assertEqual(response.status_code,200)
        self.assertEqual(response['Cache-Control'],'no-store')
        quote.assert_called_once_with(store_id=1,items=self.payload['items'],destination=self.payload['destino'])

    def test_rechaza_precio_anidado_sin_consultar(self):
        self.payload['items'][0]['peso']=0.1
        with patch(MODULE+'.quote_catalog_cart') as quote:
            self.assertEqual(self.request(self.payload).status_code,400)
            quote.assert_not_called()

    @override_settings(BLUE_EXPRESS_CHECKOUT_TOTAL_CONFIRMED=False)
    def test_bloqueo_comercial_sigue_vigente(self):
        with patch(MODULE+'.quote_catalog_cart') as quote:
            self.assertEqual(self.request(self.payload).status_code,503)
            quote.assert_not_called()
