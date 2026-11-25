from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.core import signing
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from apps.catalog.presentation.serializers import ProductCreateSerializer
from apps.core.delivery import CREDENTIALS_KEY, delivery_defaults, merge_carrier_credentials
from apps.core.models import ConfiguracionEntrega, ConfiguracionPago, Pedido, Tienda
from apps.core.payments import TRANSFER_PUBLIC_FIELDS
from apps.core.presentation.guia_envio import _caja_del_pedido, _peso_del_pedido
from apps.core.shipping import QUOTE_SALT

RESPUESTA_API = {'data': {'courierServiceOptions': [{'serviceValue': 4500, 'serviceTypeCode': 3}]}}
PRODUCTOS = {
    'liviano': {'_id': 'liviano', 'nombre': 'Liviano', 'activo': True, 'peso_kg': 0.35,
                'variantes': [{'sku': 'L1', 'precio': 10000, 'precio_oferta': 8000, 'stock': 100}]},
    'chico': {'_id': 'chico', 'nombre': 'Chico', 'activo': True, 'peso_kg': 0.2, 'alto_cm': 5, 'ancho_cm': 20,
              'largo_cm': 25, 'variantes': [{'sku': 'C1', 'precio': 1000, 'stock': 100}]},
    'grande': {'_id': 'grande', 'nombre': 'Grande', 'activo': True, 'peso_kg': 1, 'alto_cm': 40, 'ancho_cm': 30,
               'largo_cm': 60, 'variantes': [{'sku': 'G1', 'precio': 9000, 'stock': 100}]},
    'champu': {'_id': 'champu', 'nombre': 'Champú', 'activo': True, 'peso_kg': 0.3, 'alto_cm': 15, 'ancho_cm': 6,
               'largo_cm': 6, 'variantes': [
                   {'sku': 'S250', 'precio': 1000, 'stock': 9},
                   {'sku': 'S2L', 'precio': 5000, 'stock': 9, 'peso_kg': 2.1, 'alto_cm': 30, 'ancho_cm': 12,
                    'largo_cm': 12}]},
    'sin-peso': {'_id': 'sin-peso', 'nombre': 'Sin peso', 'activo': True,
                 'variantes': [{'sku': 'S1', 'precio': 5000, 'stock': 100}]},
}


def producto(item_id, *_):
    return PRODUCTOS.get(item_id)


class PesoEnvioBase(TestCase):
    url = '/api/entregas/cotizacion/'
    checkout_url = '/api/checkout/pedidos/'
    paquete = {'peso_default_kg': 0.5, 'margen_porcentaje': 10}

    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='peso-owner', is_staff=True)
        self.store = Tienda.objects.create(nombre='Peso', id_usuario_propietario=self.owner)
        self.api = APIClient()
        datos = delivery_defaults()
        datos['chilexpress'].update(enabled=True, tarifas=[
            {'region': 'Metropolitana de Santiago', 'comuna': 'Providencia', 'monto': 9990, 'plazo_dias': 2}])
        datos['paquete'].update(self.paquete)
        # La configuración activa de Chilexpress requiere credenciales incluso
        # para editar otros campos. Solo valores sintéticos, cliente HTTP simulado.
        datos[CREDENTIALS_KEY] = merge_carrier_credentials({}, 'chilexpress', {
            'cotizador': 'qa-cotizador-invalido', 'coberturas': 'qa-coberturas-invalido',
            'origen': 'STGO', 'tcc': 'QA-TCC-FAKE',
        })
        self.config = ConfiguracionEntrega.objects.create(tienda=self.store, datos=datos)
        ConfiguracionPago.objects.create(tienda=self.store, datos={'transfer': {'enabled': True,
            'fields': {field: 'qa' for field in TRANSFER_PUBLIC_FIELDS}}})
        self.cliente = MagicMock()
        self.cliente.cotizar.return_value = RESPUESTA_API
        for target in ('apps.shipping.infrastructure.live.get_client',):
            patcher = patch(target, return_value=self.cliente)
            patcher.start()
            self.addCleanup(patcher.stop)
        patcher = patch('apps.catalog.infrastructure.repositories.ProductRepository')
        self.repo_cotizacion = patcher.start().return_value
        self.addCleanup(patcher.stop)
        patcher = patch('apps.core.presentation.checkout.ProductRepository')
        self.repo_checkout = patcher.start().return_value
        self.addCleanup(patcher.stop)
        for repo in (self.repo_cotizacion, self.repo_checkout):
            repo.get_by_id.side_effect = lambda tienda, item_id: producto(item_id)
            repo.get_by_slug.return_value = None
            repo.decrease_stock.return_value = True
        self.request = {'operador': 'Chilexpress', 'region': 'Metropolitana', 'comuna': 'Providencia',
                        'items': [{'producto_id': 'liviano', 'sku': 'L1', 'cantidad': 2},
                                  {'producto_id': 'sin-peso', 'sku': 'S1', 'cantidad': 3}]}

    def quote(self, **changes):
        return self.api.post(self.url, {**self.request, **changes}, format='json')

    def tarifa(self, **changes):
        reply = self.quote(**changes)
        self.assertEqual(reply.status_code, 200, reply.data)
        return reply.data['data']['tarifas'][0]

    def order(self, token, items=None):
        return {
            'clave_checkout': str(uuid4()), 'items': items or self.request['items'],
            'contacto': {'nombre': 'Buyer', 'email': 'buyer@example.com'},
            'medio_pago': 'Transferencia', 'metodo_entrega': 'Chilexpress', 'cotizacion': token,
            'direccion': {'street': 'Calle', 'number': '123', 'apt': '1', 'city': 'Providencia',
                          'region': 'Metropolitana'},
        }


class CotizacionConPesoTests(PesoEnvioBase):
    def test_cotiza_el_peso_real_del_carrito(self):
        self.tarifa()
        enviado = self.cliente.cotizar.call_args.kwargs
        self.assertEqual(Decimal(str(enviado['peso_kg'])), Decimal('2.2'))
        self.assertEqual(enviado['valor_declarado'], Decimal('31000'))
        self.assertEqual((enviado['alto_cm'], enviado['ancho_cm'], enviado['largo_cm']),
                         (Decimal('15'), Decimal('20'), Decimal('30')))

    def test_margen_sobre_la_tarifa_de_la_api_y_oculto_al_comprador(self):
        tarifa = self.tarifa()
        self.assertEqual(tarifa['monto'], '4950')
        self.assertEqual(tarifa['origen'], 'api_transportista')
        self.assertNotIn('margen', tarifa)
        self.assertNotIn('monto_base', tarifa)
        firmado = signing.loads(tarifa['cotizacion'], salt=QUOTE_SALT)
        self.assertEqual((firmado['monto_base'], firmado['margen'], firmado['peso_kg']), (4500, 450, '2.200'))
        self.assertTrue(firmado['peso_estimado'])

    def test_sin_peso_de_tienda_se_usa_el_global(self):
        self.config.datos['paquete']['peso_default_kg'] = None
        self.config.save()
        self.tarifa()
        self.assertEqual(Decimal(str(self.cliente.cotizar.call_args.kwargs['peso_kg'])), Decimal('3.7'))

    def test_con_la_api_los_productos_del_carrito_son_obligatorios(self):
        reply = self.quote(items=[])
        self.assertEqual(reply.status_code, 400)
        self.assertEqual(reply.data['error']['codigo'], 'CARRITO_REQUERIDO')
        reply = self.api.post(self.url, {k: v for k, v in self.request.items() if k != 'items'}, format='json')
        self.assertEqual(reply.data['error']['codigo'], 'CARRITO_REQUERIDO')
        self.cliente.cotizar.assert_not_called()

    def test_producto_inexistente_o_sku_ajeno_se_rechaza(self):
        for item in ({'producto_id': 'nada', 'sku': 'X', 'cantidad': 1},
                     {'producto_id': 'liviano', 'sku': 'S1', 'cantidad': 1}):
            reply = self.quote(items=[item])
            self.assertEqual(reply.status_code, 400, reply.data)
            self.assertEqual(reply.data['error']['codigo'], 'CARRITO_INVALIDO')

    def test_el_cliente_no_puede_enviar_su_propio_peso(self):
        self.assertEqual(self.quote(peso_kg=0.1).status_code, 400)
        self.assertEqual(self.quote(items=[{**self.request['items'][0], 'peso_kg': 0.1}]).status_code, 400)

    def test_sobre_el_limite_de_unidades_el_envio_se_coordina(self):
        reply = self.quote(items=[{'producto_id': 'sin-peso', 'sku': 'S1', 'cantidad': 11}])
        self.assertEqual(reply.status_code, 400)
        self.assertEqual(reply.data['error']['codigo'], 'ENVIO_A_COORDINAR')
        self.cliente.cotizar.assert_not_called()

    def test_sobre_el_limite_de_peso_el_envio_se_coordina(self):
        self.config.datos['paquete'].update(limite_peso_kg=2.0, limite_unidades=None)
        self.config.save()
        self.assertEqual(self.quote().data['error']['codigo'], 'ENVIO_A_COORDINAR')

    def test_limites_en_none_los_desactivan(self):
        self.config.datos['paquete'].update(limite_peso_kg=None, limite_unidades=None)
        self.config.save()
        self.assertEqual(self.quote(items=[{'producto_id': 'sin-peso', 'sku': 'S1', 'cantidad': 50}]).status_code, 200)

    def test_tarifa_manual_no_recibe_margen_ni_exige_carrito(self):
        with patch('apps.shipping.infrastructure.live.get_client', return_value=None):
            reply = self.api.post(self.url, {k: v for k, v in self.request.items() if k != 'items'}, format='json')
        self.assertEqual(reply.status_code, 200, reply.data)
        tarifa = reply.data['data']['tarifas'][0]
        self.assertEqual((tarifa['monto'], tarifa['origen']), ('9990', 'configuracion_tienda'))
        self.assertNotIn('peso_kg', tarifa)


class CotizacionConMedidasTests(PesoEnvioBase):
    def caja(self, *items):
        self.tarifa(items=list(items))
        enviado = self.cliente.cotizar.call_args.kwargs
        return tuple(int(enviado[k]) for k in ('alto_cm', 'ancho_cm', 'largo_cm'))

    def test_un_producto_con_medidas_cotiza_con_sus_medidas(self):
        self.assertEqual(self.caja({'producto_id': 'chico', 'sku': 'C1', 'cantidad': 1}), (5, 20, 25))

    def test_varias_unidades_se_apilan(self):
        self.assertEqual(self.caja({'producto_id': 'chico', 'sku': 'C1', 'cantidad': 3}), (15, 20, 25))

    def test_productos_distintos_suman_volumen_sin_perder_ninguna_dimension(self):
        alto, ancho, largo = self.caja({'producto_id': 'chico', 'sku': 'C1', 'cantidad': 1},
                                       {'producto_id': 'grande', 'sku': 'G1', 'cantidad': 1})
        self.assertEqual((ancho, largo), (40, 60))
        self.assertGreaterEqual(alto * ancho * largo, 2500 + 72000)
        self.assertGreaterEqual(alto, 30)

    def test_la_variante_con_peso_y_medidas_propias_reemplaza_a_las_del_producto(self):
        self.assertEqual(self.caja({'producto_id': 'champu', 'sku': 'S250', 'cantidad': 1}), (6, 6, 15))
        self.assertEqual(Decimal(str(self.cliente.cotizar.call_args.kwargs['peso_kg'])), Decimal('0.3'))
        self.assertEqual(self.caja({'producto_id': 'champu', 'sku': 'S2L', 'cantidad': 1}), (12, 12, 30))
        self.assertEqual(Decimal(str(self.cliente.cotizar.call_args.kwargs['peso_kg'])), Decimal('2.1'))

    def test_productos_sin_medidas_comparten_una_sola_caja_de_la_tienda(self):
        self.assertEqual(self.caja({'producto_id': 'sin-peso', 'sku': 'S1', 'cantidad': 9}), (15, 20, 30))

    def test_la_caja_y_el_volumen_quedan_firmados(self):
        tarifa = self.tarifa(items=[{'producto_id': 'chico', 'sku': 'C1', 'cantidad': 3}])
        firmado = signing.loads(tarifa['cotizacion'], salt=QUOTE_SALT)
        self.assertEqual((firmado['alto_cm'], firmado['ancho_cm'], firmado['largo_cm'], firmado['volumen_cm3']),
                         (15, 20, 25, 7500))

    def test_mismo_peso_pero_otro_volumen_se_rechaza_al_pagar(self):
        token = self.tarifa(items=[{'producto_id': 'chico', 'sku': 'C1', 'cantidad': 5}])['cotizacion']
        otro = [{'producto_id': 'sin-peso', 'sku': 'S1', 'cantidad': 2}]
        reply = self.api.post(self.checkout_url, self.order(token, otro), format='json')
        self.assertEqual(reply.status_code, 400, reply.data)
        self.assertEqual(reply.data['error']['codigo'], 'COTIZACION_INVALIDA')


class PesoFirmadoAlPagarTests(PesoEnvioBase):
    def test_mismo_carrito_se_paga_con_el_precio_firmado(self):
        token = self.tarifa()['cotizacion']
        reply = self.api.post(self.checkout_url, self.order(token), format='json')
        self.assertEqual(reply.status_code, 201, reply.data)
        pedido = Pedido.objects.get()
        self.assertEqual(pedido.costo_envio, Decimal('4950'))
        self.assertEqual(pedido.entrega['cotizacion']['peso_kg'], '2.200')

    def test_carrito_mas_pesado_que_el_cotizado_se_rechaza(self):
        token = self.tarifa(items=[{'producto_id': 'liviano', 'sku': 'L1', 'cantidad': 1}])['cotizacion']
        reply = self.api.post(self.checkout_url, self.order(token), format='json')
        self.assertEqual(reply.status_code, 400, reply.data)
        self.assertEqual(reply.data['error']['codigo'], 'COTIZACION_INVALIDA')
        self.assertFalse(Pedido.objects.exists())

    def test_carrito_distinto_con_el_mismo_peso_es_valido(self):
        token = self.tarifa(items=[{'producto_id': 'liviano', 'sku': 'L1', 'cantidad': 2}])['cotizacion']
        reply = self.api.post(self.checkout_url, self.order(
            token, [{'producto_id': 'liviano', 'sku': 'L1', 'cantidad': 1},
                    {'producto_id': 'liviano', 'sku': 'L1', 'cantidad': 1}]), format='json')
        self.assertEqual(reply.status_code, 201, reply.data)


class ConfiguracionPaqueteTests(PesoEnvioBase):
    url = '/api/entregas/configuracion/'

    def setUp(self):
        super().setUp()
        self.api.force_authenticate(self.owner)

    def test_se_guarda_y_se_lee_en_el_panel(self):
        reply = self.api.patch(self.url, {'paquete': {'peso_default_kg': 0.8, 'margen_porcentaje': 5,
                                                      'limite_unidades': 20}}, format='json')
        self.assertEqual(reply.status_code, 200, reply.data)
        paquete = self.api.get(self.url).data['data']['paquete']
        self.assertEqual((paquete['peso_default_kg'], paquete['margen_porcentaje'],
                          paquete['limite_unidades'], paquete['limite_peso_kg']), (0.8, 5, 20, 15))

    def test_valores_invalidos_se_rechazan(self):
        for cambio in ({'peso_default_kg': 0}, {'peso_default_kg': -1}, {'margen_porcentaje': 101},
                       {'margen_porcentaje': -1}, {'margen_fijo': 5}, {'limite_unidades': 0},
                       {'alto_cm': 0}, {'otro': 1}):
            with self.subTest(cambio=cambio):
                self.assertEqual(self.api.patch(self.url, {'paquete': cambio}, format='json').status_code, 400)

    def test_el_comprador_no_ve_el_margen(self):
        self.api.force_authenticate(None)
        datos = self.api.get('/api/entregas/alternativas/').data['data']
        self.assertNotIn('paquete', datos)


class PesoEnProductoTests(SimpleTestCase):
    base = {'nombre': 'Taza', 'categoria': 'Hogar', 'variantes': [{'sku': 'T1', 'precio': 1000, 'stock': 3}]}

    def validar(self, **extra):
        serializer = ProductCreateSerializer(data={**self.base, **extra}, context={'tienda_id': '1'})
        return serializer.is_valid(), serializer

    def test_el_peso_es_opcional_y_admite_null(self):
        for extra in ({}, {'peso_kg': None}):
            ok, serializer = self.validar(**extra)
            self.assertTrue(ok, serializer.errors)
        ok, serializer = self.validar(peso_kg=0.35)
        self.assertTrue(ok, serializer.errors)
        self.assertEqual(serializer.validated_data['peso_kg'], 0.35)

    def test_las_medidas_van_completas_o_ninguna(self):
        ok, serializer = self.validar(alto_cm=5, ancho_cm=20, largo_cm=25)
        self.assertTrue(ok, serializer.errors)
        self.assertEqual(serializer.validated_data['largo_cm'], 25)
        self.assertTrue(self.validar(alto_cm=None, ancho_cm=None, largo_cm=None)[0])
        self.assertFalse(self.validar(alto_cm=5, ancho_cm=20)[0])
        self.assertFalse(self.validar(alto_cm=5, ancho_cm=20, largo_cm=0)[0])
        self.assertFalse(self.validar(alto_cm=5, ancho_cm=20, largo_cm=201)[0])

    def test_la_variante_admite_peso_y_medidas_propias(self):
        variante = {'sku': 'T1', 'precio': 1000, 'stock': 3}
        for extra, esperado in (({}, True), ({'peso_kg': 2.1}, True), ({'peso_kg': None}, True),
                                ({'peso_kg': 2.1, 'alto_cm': 30, 'ancho_cm': 12, 'largo_cm': 12}, True),
                                ({'alto_cm': 30, 'ancho_cm': 12}, False), ({'peso_kg': 0}, False)):
            with self.subTest(extra=extra):
                ok, _ = self.validar(variantes=[{**variante, **extra}])
                self.assertEqual(ok, esperado)

    def test_peso_invalido_se_rechaza(self):
        for valor in (0, -1, 'pesado', 1001):
            with self.subTest(valor=valor):
                self.assertFalse(self.validar(peso_kg=valor)[0])


class PesoDeLaGuiaTests(TestCase):
    def setUp(self):
        owner = get_user_model().objects.create_user(username='guia-peso', email='dueno@example.com')
        self.tienda = Tienda.objects.create(nombre='Guía', id_usuario_propietario=owner)
        self.params = {'peso_default_kg': Decimal('0.5'), 'limite_peso_kg': None, 'limite_unidades': None,
                       'alto_cm': 15, 'ancho_cm': 20, 'largo_cm': 30, 'margen_porcentaje': 0}

    def test_la_guia_usa_el_peso_con_que_se_cobro_el_envio(self):
        pedido = SimpleNamespace(itempedido_set=SimpleNamespace(all=lambda: []))
        peso = _peso_del_pedido(pedido, self.tienda, {'cotizacion': {'peso_kg': '2.200'}}, self.params)
        self.assertEqual(peso, Decimal('2.200'))

    def test_sin_cotizacion_se_pesan_los_items_del_pedido(self):
        items = [SimpleNamespace(producto_mongo_id='liviano', sku='L1', cantidad=2)]
        pedido = SimpleNamespace(itempedido_set=SimpleNamespace(all=lambda: items))
        with patch('apps.catalog.infrastructure.repositories.ProductRepository') as repo:
            repo.return_value.get_by_id.side_effect = lambda tienda, item_id: producto(item_id)
            self.assertEqual(_peso_del_pedido(pedido, self.tienda, {}, self.params), Decimal('0.700'))

    def test_producto_borrado_cae_al_peso_por_defecto(self):
        items = [SimpleNamespace(producto_mongo_id='borrado', sku='X', cantidad=1)]
        pedido = SimpleNamespace(itempedido_set=SimpleNamespace(all=lambda: items))
        with patch('apps.catalog.infrastructure.repositories.ProductRepository') as repo:
            repo.return_value.get_by_id.return_value = None
            repo.return_value.get_by_slug.return_value = None
            self.assertEqual(_peso_del_pedido(pedido, self.tienda, {}, self.params), Decimal('0.5'))


class CajaDeLaGuiaTests(PesoDeLaGuiaTests):
    def test_la_guia_usa_la_caja_con_que_se_cotizo(self):
        pedido = SimpleNamespace(itempedido_set=SimpleNamespace(all=lambda: []))
        entrega = {'cotizacion': {'alto_cm': 15, 'ancho_cm': 20, 'largo_cm': 25}}
        self.assertEqual(_caja_del_pedido(pedido, self.tienda, entrega, self.params),
                         (Decimal('15'), Decimal('20'), Decimal('25')))

    def test_sin_cotizacion_se_arma_con_los_productos_del_pedido(self):
        items = [SimpleNamespace(producto_mongo_id='chico', sku='C1', cantidad=3)]
        pedido = SimpleNamespace(itempedido_set=SimpleNamespace(all=lambda: items))
        with patch('apps.catalog.infrastructure.repositories.ProductRepository') as repo:
            repo.return_value.get_by_id.side_effect = lambda tienda, item_id: producto(item_id)
            self.assertEqual(_caja_del_pedido(pedido, self.tienda, {}, self.params),
                             (Decimal('15'), Decimal('20'), Decimal('25')))

    def test_sin_datos_cae_a_la_caja_de_la_tienda(self):
        pedido = SimpleNamespace(itempedido_set=SimpleNamespace(all=lambda: []))
        self.assertEqual(_caja_del_pedido(pedido, self.tienda, {}, self.params),
                         (Decimal('15'), Decimal('20'), Decimal('30')))
