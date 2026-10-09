"""Rutas de variantes vigentes: catálogo Mongo con enlace opcional al producto SQL.

SCRUM-245 retiró /api/compras/ y las variantes SQL del HTTP (68daa5e).
Estas pruebas conservan los casos de permisos/stock usando los contratos actuales.
"""
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.catalog.infrastructure.repositories import ProductRepository
from apps.core.models import ConfiguracionEntrega, ConfiguracionPago, ItemPedido, Pedido, Producto, Tienda
from apps.core.payments import TRANSFER_PUBLIC_FIELDS


class TiendaSQLHTTPTests(TestCase):
    def setUp(self):
        self.propietario = get_user_model().objects.create_user(username='propietario-sql')
        self.comprador = get_user_model().objects.create_user(username='comprador-sql')
        self.tienda = Tienda.objects.create(nombre='Instalación', id_usuario_propietario=self.propietario)
        self.producto_sql = Producto.objects.create(id_tienda=self.tienda, nombre='Producto', precio=10, stock=5)
        self.repo = ProductRepository()
        self.repo.collection = self.repo.db.get_collection('test_tenant_http_' + uuid4().hex)
        self.addCleanup(self.repo.collection.drop)
        self.producto = self.repo.create(str(self.tienda.pk), {
            'nombre': 'Local', 'activo': True, 'id_producto': self.producto_sql.pk,
            'variantes': [{'sku': 'LOCAL', 'precio': 10, 'stock': 5, 'atributos_variante': []}],
        })
        for target in ('apps.catalog.application.services.ProductRepository', 'apps.core.presentation.checkout.ProductRepository'):
            patcher = patch(target, return_value=self.repo)
            patcher.start()
            self.addCleanup(patcher.stop)
        ConfiguracionEntrega.objects.create(tienda=self.tienda, datos={'pickup': {'enabled': True}})
        ConfiguracionPago.objects.create(tienda=self.tienda, datos={'transfer': {'enabled': True,
            'fields': {field: 'qa' for field in TRANSFER_PUBLIC_FIELDS}}})
        self.lista_url = f'/api/productos/{self.producto}/variantes/'
        self.detalle_url = self.lista_url + 'LOCAL/'
        self.api = APIClient()

    def foreign_product(self):
        return self.repo.create('999', {'nombre': 'Ajeno', 'activo': True,
            'variantes': [{'sku': 'AJENA', 'precio': 20, 'stock': 8, 'atributos_variante': []}]})

    def compra(self, items):
        return self.api.post('/api/checkout/pedidos/', {
            'clave_checkout': str(uuid4()), 'items': items,
            'contacto': {'nombre': 'Comprador', 'email': 'buyer@example.test'},
            'medio_pago': 'Transferencia', 'metodo_entrega': 'Retiro',
        }, format='json')

    def stock(self):
        return self.repo.get_by_id(str(self.tienda.pk), self.producto)['variantes'][0]['stock']

    def assert_sin_compra(self):
        self.assertEqual(self.stock(), 5)
        self.assertFalse(Pedido.objects.exists())
        self.assertFalse(ItemPedido.objects.exists())

    def test_lecturas_publicas_admiten_anonimo_y_comprador_autenticado(self):
        for usuario in (None, self.comprador):
            self.api.force_authenticate(user=usuario)
            for url in (self.lista_url, self.detalle_url):
                with self.subTest(usuario=usuario, url=url):
                    self.assertEqual(self.api.get(url).status_code, 200)

    def test_propietario_puede_crear_y_actualizar_variante(self):
        self.api.force_authenticate(self.propietario)
        response = self.api.post(self.lista_url, {'sku': 'NUEVA', 'precio': 15, 'stock': 2}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.api.patch(self.detalle_url, {'stock': 4}, format='json').status_code, 200)
        self.assertEqual(self.stock(), 4)

    def test_escritura_reconoce_la_sesion_django_del_propietario(self):
        self.api.force_login(self.propietario)
        self.assertEqual(self.api.patch(self.detalle_url, {'stock': 4}, format='json').status_code, 200)
        self.assertEqual(self.stock(), 4)

    def test_api_crea_variantes_no_negativas_y_rechaza_negativa(self):
        self.api.force_authenticate(self.propietario)
        for stock in (0, 2):
            response = self.api.post(self.lista_url, {'sku': f'API-{stock}', 'precio': 10, 'stock': stock}, format='json')
            self.assertEqual(response.status_code, 201, response.data)
        before = self.repo.get_by_id(str(self.tienda.pk), self.producto)['variantes']
        for stock in (-1, True, 1.5, '2'):
            response = self.api.post(self.lista_url, {'sku': 'INVALIDA', 'precio': 10, 'stock': stock}, format='json')
            self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(self.repo.get_by_id(str(self.tienda.pk), self.producto)['variantes'], before)

    def test_api_actualiza_stock_y_rechaza_negativo_sin_modificar_otros_datos(self):
        self.api.force_authenticate(self.propietario)
        for stock in (0, 3):
            response = self.api.patch(self.detalle_url, {'stock': stock}, format='json')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(self.stock(), stock)
        response = self.api.patch(self.detalle_url, {'stock': -1, 'precio': 99}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        variant = self.repo.get_by_id(str(self.tienda.pk), self.producto)['variantes'][0]
        self.assertEqual(variant['stock'], 3)
        self.assertEqual(variant['precio'], 10)

    def test_escrituras_rechazan_anonimo_no_propietario_y_propietario_inactivo(self):
        self.propietario.is_active = False
        self.propietario.save(update_fields=['is_active'])
        for usuario in (None, self.comprador, self.propietario):
            self.api.force_authenticate(user=usuario)
            self.assertIn(self.api.post(self.lista_url, {'sku': 'INTRUSA', 'precio': 10, 'stock': 1}, format='json').status_code, (401, 403))
            self.assertIn(self.api.patch(self.detalle_url, {'stock': 1}, format='json').status_code, (401, 403))
        self.assertEqual(self.stock(), 5)

    def test_identificador_cliente_no_selecciona_tienda_en_lectura_o_escritura(self):
        self.api.force_authenticate(self.propietario)
        self.assertEqual(self.api.get(self.lista_url, {'tienda_id': '999'}).status_code, 400)
        self.assertEqual(self.api.patch(self.detalle_url, {'tienda_id': '999', 'stock': 1}, format='json').status_code, 403)
        self.assertEqual(self.stock(), 5)

    def test_instalacion_ambigua_bloquea_variantes_y_compra(self):
        Tienda.objects.create(nombre='Otra', id_usuario_propietario=self.comprador)
        self.assertEqual(self.api.get(self.lista_url).status_code, 503)
        self.assertEqual(self.compra([{'producto_id': self.producto, 'sku': 'LOCAL', 'cantidad': 1}]).status_code, 503)
        self.assert_sin_compra()

    def test_filtro_http_no_expone_producto_o_variante_ajenos(self):
        foreign = self.foreign_product()
        for url in (f'/api/productos/{foreign}/variantes/', f'/api/productos/{foreign}/variantes/AJENA/', self.lista_url + 'AJENA/'):
            self.assertEqual(self.api.get(url).status_code, 404)

    def test_filtro_http_impide_crear_o_actualizar_en_producto_ajeno(self):
        foreign = self.foreign_product()
        self.api.force_authenticate(self.propietario)
        url = f'/api/productos/{foreign}/variantes/'
        self.assertEqual(self.api.post(url, {'sku': 'INTRUSA', 'precio': 10, 'stock': 1}, format='json').status_code, 400)
        self.assertEqual(self.api.patch(url + 'AJENA/', {'stock': 1}, format='json').status_code, 404)
        self.assertEqual(self.repo.get_by_id('999', foreign)['variantes'][0]['stock'], 8)

    def test_compra_publica_de_variante_local_funciona(self):
        response = self.compra([{'producto_id': self.producto, 'sku': 'LOCAL', 'cantidad': 2}])
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.stock(), 3)
        self.producto_sql.refresh_from_db()
        self.assertEqual(self.producto_sql.stock, 3)
        self.assertEqual(ItemPedido.objects.get().id_producto.id_tienda, self.tienda)

    def test_compra_rechaza_variante_ajena_en_validacion_sin_modificaciones(self):
        foreign = self.foreign_product()
        response = self.compra([{'producto_id': self.producto, 'sku': 'LOCAL', 'cantidad': 1},
                               {'producto_id': foreign, 'sku': 'AJENA', 'cantidad': 1}])
        self.assertEqual(response.status_code, 400, response.data)
        self.assert_sin_compra()
        self.assertEqual(self.repo.get_by_id('999', foreign)['variantes'][0]['stock'], 8)

    def test_compra_directa_no_descuenta_sku_de_otro_producto(self):
        self.api.force_authenticate(self.propietario)
        foreign = self.foreign_product()
        response = self.api.post(self.lista_url + 'AJENA/comprar/', {'cantidad': 1}, format='json')
        self.assertEqual(response.status_code, 404, response.data)
        self.assert_sin_compra()
        self.assertEqual(self.repo.get_by_id('999', foreign)['variantes'][0]['stock'], 8)
