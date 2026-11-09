"""SCRUM-509: integración TUU Pago Online (adaptador independiente de Transbank)."""
from decimal import Decimal
from unittest.mock import Mock, patch

import requests
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient

from apps.catalog.infrastructure.adapters.tuu_adapter import (
    TuuPagoOnlineAdapter, TuuServicioNoDisponibleException, TuuTransaccionException, firma_valida, firmar,
)
from apps.core.models import ConfiguracionPago, Pedido, Tienda
from apps.core.payments import payment_methods_for_store

CLAVE = 'clave-secreta-de-prueba'
CALLBACK = '/api/pagos/tuu/callback/?tienda='


class FirmaTuuTests(SimpleTestCase):
    def test_firma_ignora_campos_no_x_y_el_orden_de_entrada(self):
        a = {'x_amount': '1000', 'x_account_id': '1', 'otro': 'zzz'}
        b = {'x_account_id': '1', 'x_amount': '1000'}
        self.assertEqual(firmar(a, CLAVE), firmar(b, CLAVE))
        self.assertEqual(len(firmar(a, CLAVE)), 64)

    def test_firma_valida_detecta_alteraciones(self):
        datos = {'x_account_id': '1', 'x_amount': '1000'}
        datos['x_signature'] = firmar(datos, CLAVE)
        self.assertTrue(firma_valida(datos, CLAVE))
        self.assertFalse(firma_valida({**datos, 'x_amount': '1'}, CLAVE))
        self.assertFalse(firma_valida({'x_amount': '1000'}, CLAVE))


class AdaptadorTuuTests(SimpleTestCase):
    def crear(self):
        return TuuPagoOnlineAdapter('62224230', CLAVE).crear_intento(
            referencia='ORD-1', monto=19990, email='a@b.cl', nombre='Ana', apellido='Paz', telefono='+56911111111',
            descripcion='Pedido', tienda='Tienda', url_callback='https://x.cl/cb', url_complete='https://x.cl/ok',
            url_cancel='https://x.cl/no')

    @patch('apps.catalog.infrastructure.adapters.tuu_adapter.requests.post')
    def test_envia_firma_y_devuelve_la_url(self, post):
        post.return_value = Mock(status_code=200, json=lambda: {'url': 'https://pago.tuu.cl/abc'})
        self.assertEqual(self.crear(), 'https://pago.tuu.cl/abc')
        self.assertIn('x_signature', post.call_args.kwargs['data'])
        self.assertEqual(post.call_args.kwargs['headers']['X-REDIRECT'], 'false')
        self.assertEqual(post.call_args.kwargs['timeout'], 15)

    @patch('apps.catalog.infrastructure.adapters.tuu_adapter.requests.post')
    def test_sin_conexion_o_5xx_es_no_disponible(self, post):
        post.side_effect = requests.Timeout('detalle sensible')
        with self.assertRaises(TuuServicioNoDisponibleException) as error:
            self.crear()
        self.assertNotIn('detalle sensible', str(error.exception))
        post.side_effect = None
        post.return_value = Mock(status_code=503)
        with self.assertRaises(TuuServicioNoDisponibleException):
            self.crear()

    @patch('apps.catalog.infrastructure.adapters.tuu_adapter.requests.post')
    def test_respuesta_sin_url_falla(self, post):
        post.return_value = Mock(status_code=200, json=lambda: {})
        with self.assertRaises(TuuTransaccionException):
            self.crear()


class CallbackTuuTests(TestCase):
    def setUp(self):
        owner = get_user_model().objects.create_user(username='tuu-owner')
        self.tienda = Tienda.objects.create(nombre='Tienda TUU', id_usuario_propietario=owner)
        ConfiguracionPago.objects.create(tienda=self.tienda, datos={'tuu': {
            'enabled': True, 'fields': {'accountId': '62224230', 'secretKey': CLAVE}}})
        self.pedido = Pedido.objects.create(tienda=self.tienda, monto_total=Decimal('19990'), medio_pago='TUU',
                                            correo_contacto='a@b.cl', identificador='ORD-TUU-1')
        self.api = APIClient()

    def enviar(self, **cambios):
        datos = {'x_account_id': '62224230', 'x_reference': 'ORD-TUU-1', 'x_amount': '19990',
                 'x_currency': 'CLP', 'x_result': 'completed', **cambios}
        datos.setdefault('x_signature', firmar(datos, CLAVE))
        return self.api.post(CALLBACK + str(self.tienda.pk), datos)

    def test_el_checkout_lista_tuu_si_esta_configurado(self):
        self.assertEqual(payment_methods_for_store(self.tienda)['tuu'], {'enabled': True})

    def test_pago_completado_marca_pagado_y_es_idempotente(self):
        self.assertEqual(self.enviar().status_code, 200)
        self.pedido.refresh_from_db()
        self.assertEqual(self.pedido.estado, 'pagado')
        self.assertEqual(self.enviar().status_code, 200)

    def test_pago_fallido_no_confirma_la_compra(self):
        self.assertEqual(self.enviar(x_result='failed').status_code, 200)
        self.pedido.refresh_from_db()
        self.assertEqual(self.pedido.estado, 'pendiente')

    def test_firma_invalida_se_rechaza(self):
        self.assertEqual(self.enviar(x_signature='0' * 64).status_code, 400)
        self.pedido.refresh_from_db()
        self.assertEqual(self.pedido.estado, 'pendiente')

    def test_monto_distinto_se_rechaza(self):
        datos = {'x_account_id': '62224230', 'x_reference': 'ORD-TUU-1', 'x_amount': '1', 'x_result': 'completed'}
        datos['x_signature'] = firmar(datos, CLAVE)
        self.assertEqual(self.api.post(CALLBACK + str(self.tienda.pk), datos).status_code, 400)
        self.pedido.refresh_from_db()
        self.assertEqual(self.pedido.estado, 'pendiente')

    def test_tienda_inexistente_se_rechaza(self):
        self.assertEqual(self.api.post(CALLBACK + '99999', {'x_result': 'completed'}).status_code, 400)


class CifradoCredencialesPagoTests(TestCase):
    def setUp(self):
        owner = get_user_model().objects.create_user(username='cifrado-owner')
        self.tienda = Tienda.objects.create(nombre='Tienda cifrada', id_usuario_propietario=owner)
        self.config = ConfiguracionPago.objects.create(tienda=self.tienda, datos={
            'tuu': {'enabled': True, 'fields': {'accountId': '62224230', 'secretKey': CLAVE}},
            'linkify': {'enabled': True, 'fields': {'idCuenta': 'cuenta', 'clavePrivada': 'privada-linkify'}},
        })

    def guardado_en_bd(self):
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute('SELECT datos FROM configuracion_pago WHERE tienda_id = %s', [self.tienda.pk])
            crudo = cursor.fetchone()[0]
        return crudo if isinstance(crudo, str) else __import__('json').dumps(crudo)

    def test_en_la_base_de_datos_no_aparecen_las_llaves_en_claro(self):
        crudo = self.guardado_en_bd()
        self.assertNotIn(CLAVE, crudo)
        self.assertNotIn('privada-linkify', crudo)
        self.assertIn('enc::', crudo)
        self.assertIn('62224230', crudo)

    def test_se_leen_en_claro_para_poder_cobrar(self):
        from apps.core.presentation.checkout import CheckoutOrderAPIView
        from apps.core.presentation.tuu_callback import credenciales_tuu
        self.assertEqual(credenciales_tuu(self.tienda), ('62224230', CLAVE, 'integracion'))
        self.assertEqual(CheckoutOrderAPIView._credenciales_linkify(self.tienda), ('cuenta', 'privada-linkify'))

    def test_guardar_de_nuevo_no_cifra_dos_veces(self):
        self.config.refresh_from_db()
        self.config.save()
        self.config.refresh_from_db()
        self.assertEqual(self.config.datos_descifrados['tuu']['fields']['secretKey'], CLAVE)

    def test_el_checkout_sigue_listando_tuu_con_la_llave_cifrada(self):
        self.assertEqual(payment_methods_for_store(self.tienda)['tuu'], {'enabled': True})

    def test_el_callback_valida_la_firma_con_la_llave_descifrada(self):
        Pedido.objects.create(tienda=self.tienda, monto_total=Decimal('1000'), medio_pago='TUU',
                              correo_contacto='a@b.cl', identificador='ORD-CIF-1')
        datos = {'x_account_id': '62224230', 'x_reference': 'ORD-CIF-1', 'x_amount': '1000',
                 'x_currency': 'CLP', 'x_result': 'completed'}
        datos['x_signature'] = firmar(datos, CLAVE)
        respuesta = APIClient().post(f'{CALLBACK}{self.tienda.pk}', datos, format='multipart')
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(Pedido.objects.get(identificador='ORD-CIF-1').estado, 'pagado')

    def test_la_migracion_cifra_las_llaves_que_estaban_en_claro(self):
        from importlib import import_module
        from django.apps import apps as registro
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute('UPDATE configuracion_pago SET datos = %s WHERE tienda_id = %s', [
                __import__('json').dumps({'tuu': {'enabled': True, 'fields': {'accountId': '1', 'secretKey': CLAVE}}}),
                self.tienda.pk])
        migracion = import_module('apps.core.migrations.0034_cifrar_credenciales_configuracion_pago')
        migracion.cifrar_credenciales_existentes(registro, None)
        migracion.cifrar_credenciales_existentes(registro, None)
        self.assertNotIn(CLAVE, self.guardado_en_bd())
        self.config.refresh_from_db()
        self.assertEqual(self.config.datos_descifrados['tuu']['fields']['secretKey'], CLAVE)

    def test_el_panel_recibe_las_llaves_enmascaradas_y_al_guardar_se_conservan(self):
        from rest_framework.authtoken.models import Token
        token = Token.objects.create(user=self.tienda.id_usuario_propietario)
        api = APIClient()
        api.credentials(HTTP_AUTHORIZATION='Token ' + token.key)
        url = '/api/pagos/configuracion/'
        recibido = api.get(url).json()['data']
        self.assertEqual(recibido['tuu']['fields']['secretKey'], '*' * (len(CLAVE) - 4) + CLAVE[-4:])
        self.assertEqual(api.put(url, recibido, format='json').status_code, 200)
        self.config.refresh_from_db()
        self.assertEqual(self.config.datos_descifrados['tuu']['fields']['secretKey'], CLAVE)


class AmbienteTuuTests(TestCase):
    """El selector Modo de prueba / Producción del panel debe llegar hasta el cobro."""

    def setUp(self):
        from rest_framework.authtoken.models import Token
        owner = get_user_model().objects.create_user(username='tuu-ambiente')
        self.tienda = Tienda.objects.create(nombre='Tienda ambiente', id_usuario_propietario=owner)
        self.api = APIClient()
        self.api.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=owner).key)

    def guardar(self, environment):
        fields = {'accountId': '62224230', 'secretKey': CLAVE}
        if environment is not None:
            fields['environment'] = environment
        return self.api.put('/api/pagos/configuracion/', {'tuu': {'enabled': True, 'fields': fields}}, format='json')

    def test_acepta_integracion_y_produccion(self):
        from apps.core.presentation.tuu_callback import credenciales_tuu
        for ambiente in ('integracion', 'produccion'):
            self.assertEqual(self.guardar(ambiente).status_code, 200)
            self.assertEqual(credenciales_tuu(self.tienda)[2], ambiente)

    def test_rechaza_un_ambiente_invalido(self):
        self.assertEqual(self.guardar('otro').status_code, 400)

    def test_sin_ambiente_se_usa_integracion(self):
        from apps.core.presentation.tuu_callback import credenciales_tuu
        self.assertEqual(self.guardar(None).status_code, 200)
        self.assertEqual(credenciales_tuu(self.tienda)[2], 'integracion')

    def test_produccion_usa_la_url_de_produccion_del_adaptador(self):
        from apps.catalog.infrastructure.adapters.tuu_adapter import URL_INTEGRACION, URL_PRODUCCION
        self.assertEqual(TuuPagoOnlineAdapter('1', CLAVE, 'produccion').url, URL_PRODUCCION)
        self.assertEqual(TuuPagoOnlineAdapter('1', CLAVE, 'integracion').url, URL_INTEGRACION)
