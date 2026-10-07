from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.core.models import ConfiguracionPago, Tienda

CONFIG_URL = '/api/pagos/configuracion/'
ACTIVOS_URL = '/api/pagos/activos/'
LINKIFY = {'linkify': {'enabled': True, 'fields': {'idCuenta': 'CUENTA-QA', 'clavePrivada': 'clave-privada-qa'}}}


class LinkifyConfiguracionTests(TestCase):
    def setUp(self):
        propietario = get_user_model().objects.create_user(username='linkify-config-owner')
        self.tienda = Tienda.objects.create(nombre='Tienda config', id_usuario_propietario=propietario)
        self.api = APIClient()
        self.api.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=propietario).key)

    def test_guarda_linkify_con_id_de_cuenta_y_clave_privada(self):
        respuesta = self.api.put(CONFIG_URL, LINKIFY, format='json')
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        datos = ConfiguracionPago.objects.get(tienda=self.tienda).datos
        self.assertEqual(datos['linkify']['fields']['idCuenta'], 'CUENTA-QA')

    def test_no_se_puede_habilitar_linkify_sin_clave_privada(self):
        incompleto = {'linkify': {'enabled': True, 'fields': {'idCuenta': 'CUENTA-QA'}}}
        respuesta = self.api.put(CONFIG_URL, incompleto, format='json')
        self.assertEqual(respuesta.status_code, 400)
        self.assertIn('clavePrivada', str(respuesta.json()))

    def test_el_checkout_lista_linkify_cuando_esta_habilitado(self):
        ConfiguracionPago.objects.create(tienda=self.tienda, datos=LINKIFY)
        respuesta = APIClient().get(ACTIVOS_URL)
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertTrue(respuesta.json()['data']['linkify']['enabled'])

    def test_el_checkout_no_expone_las_credenciales_de_linkify(self):
        ConfiguracionPago.objects.create(tienda=self.tienda, datos=LINKIFY)
        contenido = APIClient().get(ACTIVOS_URL).content.decode()
        self.assertNotIn('clave-privada-qa', contenido)
        self.assertNotIn('CUENTA-QA', contenido)

    def test_el_checkout_no_lista_linkify_desactivado_o_sin_credenciales(self):
        desactivado = {'linkify': {'enabled': False, 'fields': {'idCuenta': 'X', 'clavePrivada': 'Y'}}}
        sin_clave = {'linkify': {'enabled': True, 'fields': {'idCuenta': 'X'}}}
        for datos in (desactivado, sin_clave):
            ConfiguracionPago.objects.update_or_create(tienda=self.tienda, defaults={'datos': datos})
            self.assertNotIn('linkify', APIClient().get(ACTIVOS_URL).json()['data'])