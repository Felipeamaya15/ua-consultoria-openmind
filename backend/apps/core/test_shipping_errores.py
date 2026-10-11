"""Manejo de errores de cotizacion de envio (SCRUM-349): codigos estables para el frontend."""
from time import time
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.core import signing
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.delivery import delivery_defaults
from apps.core.models import ConfiguracionEntrega, ConfiguracionPago, Pedido, Tienda
from apps.core.payments import TRANSFER_PUBLIC_FIELDS
from apps.core.shipping import QUOTE_MAX_AGE, QUOTE_SALT, ErrorCotizacion, configured_quote


class CotizacionErroresTests(TestCase):
    url = '/api/entregas/cotizacion/'
    checkout_url = '/api/checkout/pedidos/'

    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='errores-owner', is_staff=True)
        self.store = Tienda.objects.create(nombre='Errores', id_usuario_propietario=self.owner)
        self.api = APIClient()
        self.data = delivery_defaults()
        self.data['chilexpress'].update(enabled=True, tarifas=[
            {'region': 'Metropolitana de Santiago', 'comuna': 'Providencia', 'monto': 4500, 'plazo_dias': 2}])
        self.config = ConfiguracionEntrega.objects.create(tienda=self.store, datos=self.data)
        ConfiguracionPago.objects.create(tienda=self.store, datos={'transfer': {'enabled': True,
            'fields': {field: 'qa' for field in TRANSFER_PUBLIC_FIELDS}}})
        self.request = {'operador': 'Chilexpress', 'region': 'Metropolitana', 'comuna': 'Providencia'}
        self.order = {
            'clave_checkout': str(uuid4()), 'items': [{'producto_id': 'product', 'sku': 'QA', 'cantidad': 1}],
            'contacto': {'nombre': 'Buyer', 'email': 'buyer@example.com'},
            'medio_pago': 'Transferencia', 'metodo_entrega': 'Chilexpress',
            'direccion': {'street': 'Calle', 'number': '123', 'apt': '1', 'city': 'Providencia', 'region': 'Metropolitana'},
        }
        parche = patch('apps.core.presentation.checkout.ProductRepository')
        repositorio = parche.start().return_value
        self.addCleanup(parche.stop)
        repositorio.get_by_id.return_value = {'_id': 'product', 'nombre': 'Producto', 'activo': True,
                                              'variantes': [{'sku': 'QA', 'precio': 60000, 'stock': 10}]}
        repositorio.decrease_stock.return_value = True

    def quote(self, **cambios):
        return self.api.post(self.url, {**self.request, **cambios}, format='json')

    def submit(self, **cambios):
        return self.api.post(self.checkout_url, {**self.order, **cambios}, format='json')

    def token(self):
        respuesta = self.quote()
        self.assertEqual(respuesta.status_code, 200, respuesta.data)
        return respuesta.data['data']['tarifas'][0]['cotizacion']

    def assert_codigo(self, respuesta, codigo, estado=400):
        self.assertEqual(respuesta.status_code, estado, respuesta.content)
        cuerpo = respuesta.json()
        self.assertFalse(cuerpo['exito'])
        self.assertEqual(cuerpo['error']['codigo'], codigo)
        return cuerpo

    # ------------------------------------------------------------ cotizar
    def test_comuna_sin_tarifa_tiene_su_propio_codigo(self):
        cuerpo = self.assert_codigo(self.quote(comuna='Santiago'), 'TARIFA_NO_DISPONIBLE')
        self.assertIn('No hay una tarifa disponible', cuerpo['mensaje'])
        # Se conserva el formato de siempre: el frontend sigue leyendo los detalles por campo.
        self.assertIn('cotizacion', cuerpo['error']['detalles'])

    def test_transportista_deshabilitado(self):
        self.config.datos['chilexpress']['enabled'] = False
        self.config.save()
        self.assert_codigo(self.quote(), 'TRANSPORTISTA_NO_HABILITADO')

    def test_comuna_que_no_es_de_la_region(self):
        self.assert_codigo(self.quote(comuna='inventada'), 'DESTINO_INVALIDO')
        self.assert_codigo(self.quote(region='Valparaíso'), 'DESTINO_INVALIDO')

    def test_tarifa_corrupta_se_informa_como_sin_tarifa(self):
        self.config.datos['chilexpress']['tarifas'][0]['monto'] = None
        self.config.save()
        self.assert_codigo(self.quote(), 'TARIFA_NO_DISPONIBLE')

    def test_operador_invalido_en_la_logica(self):
        with self.assertRaises(ErrorCotizacion) as contexto:
            configured_quote(self.store, 'Retiro', 'Metropolitana', 'Providencia')
        self.assertEqual(contexto.exception.codigo_error, 'OPERADOR_INVALIDO')

    def test_errores_de_formato_no_cambian(self):
        respuesta = self.quote(operador='Otro')
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn('operador', respuesta.json())  # formato de siempre de DRF, sin codigo propio

    def test_error_inesperado_responde_json_sin_filtrar_detalles(self):
        with patch('apps.core.presentation.shipping.issue_quote', side_effect=RuntimeError('clave interna secreta')):
            with self.assertLogs('apps.core.presentation.shipping', level='ERROR'):
                respuesta = self.quote()
        self.assert_codigo(respuesta, 'ERROR_COTIZACION', estado=500)
        self.assertNotIn('secreta', respuesta.content.decode())

    def test_el_rechazo_de_una_cotizacion_queda_en_el_log(self):
        with self.assertLogs('apps.core.presentation.shipping', level='INFO') as registro:
            self.quote(comuna='Santiago')
        self.assertIn('TARIFA_NO_DISPONIBLE', ' '.join(registro.output))

    # ---------------------------------------------- confirmar el pedido
    def test_cotizacion_vigente_permite_confirmar(self):
        respuesta = self.submit(cotizacion=self.token())
        self.assertEqual(respuesta.status_code, 201, respuesta.content)

    def test_cotizacion_vencida_por_fecha_interna(self):
        firmado = signing.loads(self.token(), salt=QUOTE_SALT)
        firmado['vence_en'] = int(time()) - 1
        respuesta = self.submit(cotizacion=signing.dumps(firmado, salt=QUOTE_SALT))
        self.assert_codigo(respuesta, 'COTIZACION_VENCIDA')
        self.assertFalse(Pedido.objects.exists())

    def test_cotizacion_vencida_por_antiguedad_de_la_firma(self):
        token = self.token()
        with patch('django.core.signing.time.time', return_value=time() + QUOTE_MAX_AGE + 60):
            respuesta = self.submit(cotizacion=token)
        self.assert_codigo(respuesta, 'COTIZACION_VENCIDA')

    def test_cotizacion_alterada_o_inexistente(self):
        self.assert_codigo(self.submit(cotizacion='basura'), 'COTIZACION_INVALIDA')
        self.assert_codigo(self.submit(), 'COTIZACION_INVALIDA')

    def test_la_tarifa_cambio_despues_de_cotizar(self):
        token = self.token()
        self.config.datos['chilexpress']['tarifas'][0]['monto'] = 9000
        self.config.save()
        self.assert_codigo(self.submit(cotizacion=token), 'COTIZACION_CAMBIO')
        self.assertFalse(Pedido.objects.exists())