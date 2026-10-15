"""Seguimiento seguro para compradores invitados (SCRUM-365)."""
import time
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import resolve
from rest_framework.test import APIClient

from apps.core.models import Pedido, Tienda
from apps.core.presentation import order_tracking
from apps.core.presentation.tracking_guard import describir_espera

LOGGER = 'apps.core.presentation.tracking_guard'


class SeguimientoSeguroTests(TestCase):
    url = '/api/pedidos/seguimiento/'

    def setUp(self):
        cache.clear()
        propietario = get_user_model().objects.create_user(username='seguro-owner')
        self.tienda = Tienda.objects.create(nombre='Tienda segura', id_usuario_propietario=propietario)
        self.pedido = self.crear_pedido('ORD-20261008-YOXM', 'buyer@example.com')
        self.api = APIClient()
        self.valido = {'identificador': self.pedido.identificador, 'email': self.pedido.correo_contacto}

    def crear_pedido(self, identificador, correo, **extra):
        return Pedido.objects.create(
            tienda=self.tienda, identificador=identificador, nombre_contacto='Comprador', correo_contacto=correo,
            telefono_contacto='private-phone', monto_total='15000.00', medio_pago='Transferencia',
            entrega={'metodo': 'Retiro', 'direccion': {'street': 'private-address'}}, **extra,
        )

    def consultar(self, **cambios):
        return self.api.post(self.url, {**self.valido, **cambios}, format='json')

    def fallar(self, veces, identificador=None, correo='wrong@example.com'):
        """Hace `veces` consultas con un correo equivocado y devuelve los estados HTTP."""
        cambios = {'email': correo}
        if identificador:
            cambios['identificador'] = identificador
        return [self.consultar(**cambios).status_code for _ in range(veces)]

    # ------------------------------------------------------------------ la ruta
    def test_la_ruta_la_atiende_la_vista_segura_y_no_acepta_datos_en_la_direccion(self):
        self.assertIs(resolve(self.url).func.view_class, order_tracking.OrderTrackingAPIView)
        for datos in ({'numero_orden': self.pedido.id_pedido, 'email': 'buyer@example.com'},
                      {'numero_orden': self.pedido.identificador},
                      {'identificador': self.pedido.identificador, 'email': 'buyer@example.com'}):
            respuesta = self.api.get(self.url, datos)
            self.assertEqual(respuesta.status_code, 405, datos)
            self.assertNotIn('Comprador', respuesta.content.decode())

    def test_el_numero_secuencial_del_pedido_no_sirve_para_consultar(self):
        for identificador in (str(self.pedido.id_pedido), '1', '0000000000000001', str(self.pedido.pk).zfill(17)):
            respuesta = self.consultar(identificador=identificador)
            self.assertEqual(respuesta.status_code, 400, identificador)
            self.assertNotIn('Comprador', respuesta.content.decode())

    def test_una_orden_sin_correo_guardado_no_se_entrega_con_cualquier_correo(self):
        # La base exige algun dato del comprador; aqui esta solo en `contacto`, con `correo_contacto` vacio.
        sin_correo = self.crear_pedido('ORD-20261008-SINC', '', contacto={'email': 'buyer@example.com'})
        for correo in ('cualquiera@example.com', 'buyer@example.com'):
            respuesta = self.consultar(identificador=sin_correo.identificador, email=correo)
            self.assertEqual(respuesta.status_code, 404, correo)
            self.assertNotIn('Comprador', respuesta.content.decode())

    # ------------------------------------------------------------------ bloqueo por orden
    def test_tras_cinco_fallos_la_orden_se_bloquea_incluso_con_las_credenciales_correctas(self):
        self.assertEqual(self.fallar(5), [404] * 5)
        for cambios in ({'email': 'wrong@example.com'}, {}):
            respuesta = self.consultar(**cambios)
            self.assertEqual(respuesta.status_code, 429, cambios)
            cuerpo = respuesta.json()
            self.assertFalse(cuerpo['exito'])
            self.assertEqual(cuerpo['error']['codigo'], 'DEMASIADAS_SOLICITUDES')
            self.assertEqual(cuerpo['mensaje'], 'Demasiados intentos fallidos. Vuelve a intentarlo en 15 minutos.')
            espera = cuerpo['error']['detalles']['reintentar_en_segundos']
            self.assertTrue(1 <= espera <= 900, espera)
            self.assertEqual(respuesta['Retry-After'], str(espera))
            self.assertEqual(respuesta['Cache-Control'], 'no-store')
            texto = respuesta.content.decode()
            for privado in ('Comprador', 'private-phone', 'private-address', 'buyer@example.com', '15000'):
                self.assertNotIn(privado, texto, privado)

    def test_existe_o_no_la_orden_el_bloqueo_es_el_mismo(self):
        secuencias = {}
        for nombre, identificador in (('existente', self.pedido.identificador), ('inexistente', 'ORD-20261008-ZZZZ')):
            estados = self.fallar(6, identificador=identificador, correo=f'{nombre}@example.com')
            respuesta = self.consultar(identificador=identificador, email=f'{nombre}@example.com')
            secuencias[nombre] = (estados, respuesta.status_code, respuesta.json()['mensaje'])
        self.assertEqual(secuencias['existente'], secuencias['inexistente'])
        self.assertEqual(secuencias['existente'][0], [404] * 5 + [429])

    def test_mayusculas_y_minusculas_cuentan_como_la_misma_orden_y_el_mismo_correo(self):
        for numero, correo in enumerate(['wrong@example.com', 'WRONG@example.com', 'Wrong@Example.com', 'wrong@EXAMPLE.com', 'wRoNg@example.com']):
            identificador = self.pedido.identificador.lower() if numero % 2 else self.pedido.identificador
            self.assertEqual(self.consultar(identificador=identificador, email=correo).status_code, 404)
        self.assertEqual(self.consultar().status_code, 429)

    def test_un_intento_correcto_borra_los_contadores(self):
        self.assertEqual(self.fallar(4), [404] * 4)
        self.assertEqual(self.consultar().status_code, 200)
        self.assertEqual(self.fallar(5), [404] * 5)
        self.assertEqual(self.consultar().status_code, 429)

    def test_los_formatos_invalidos_no_cuentan(self):
        for _ in range(6):
            self.assertEqual(self.consultar(identificador='ORD-2026').status_code, 400)
            self.assertEqual(self.consultar(email='no-es-un-correo').status_code, 400)
        self.assertEqual(self.consultar().status_code, 200)

    def test_bloquear_una_orden_no_afecta_a_las_demas(self):
        otra = self.crear_pedido('ORD-20261008-OTRA', 'otro@example.com')
        self.fallar(5)
        self.assertEqual(self.consultar().status_code, 429)
        respuesta = self.consultar(identificador=otra.identificador, email='otro@example.com')
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.json()['data']['identificador'], otra.identificador)

    # ------------------------------------------------------------------ bloqueo por correo
    def test_recorrer_numeros_de_orden_con_un_mismo_correo_tambien_se_bloquea(self):
        for numero in range(10):
            self.assertEqual(self.consultar(identificador=f'ORD-20261008-B{numero:03d}', email='scanner@example.com').status_code, 404)
        self.assertEqual(self.consultar(identificador='ORD-20261008-B999', email='scanner@example.com').status_code, 429)
        # Otro correo no se ve afectado.
        self.assertEqual(self.consultar().status_code, 200)

    def test_quien_conoce_el_correo_de_otro_solo_puede_bloquearle_la_consulta_por_un_rato(self):
        # Compromiso del bloqueo por correo: frena a quien recorre números de orden con un correo ajeno,
        # y a cambio ese correo queda sin consultar hasta que termina la ventana.
        for numero in range(10):
            self.consultar(identificador=f'ORD-20261008-B{numero:03d}')
        self.assertEqual(self.consultar().status_code, 429)
        with patch('time.time', return_value=time.time() + 16 * 60):
            self.assertEqual(self.consultar().status_code, 200)

    # ------------------------------------------------------------------ duración y configuración
    def test_el_bloqueo_dura_la_ventana_completa_y_luego_se_levanta(self):
        self.fallar(5)
        ahora = time.time()
        with patch('time.time', return_value=ahora + 14 * 60):
            respuesta = self.consultar()
            self.assertEqual(respuesta.status_code, 429)
            self.assertTrue(55 <= respuesta.json()['error']['detalles']['reintentar_en_segundos'] <= 65)
            self.assertEqual(respuesta.json()['mensaje'], 'Demasiados intentos fallidos. Vuelve a intentarlo en 1 minuto.')
        with patch('time.time', return_value=ahora + 16 * 60):
            self.assertEqual(self.consultar().status_code, 200)

    @override_settings(TRACKING_MAX_FAILED_PER_ORDER=2, TRACKING_LOCK_WINDOW_SECONDS=60)
    def test_los_limites_se_pueden_cambiar_desde_la_configuracion(self):
        self.assertEqual(self.fallar(2), [404, 404])
        respuesta = self.consultar()
        self.assertEqual(respuesta.status_code, 429)
        self.assertEqual(respuesta.json()['mensaje'], 'Demasiados intentos fallidos. Vuelve a intentarlo en 1 minuto.')

    # ------------------------------------------------------------------ privacidad
    def test_el_bloqueo_se_registra_sin_correo_ni_numero_de_orden(self):
        with self.assertLogs(LOGGER, level='WARNING') as registro:
            self.fallar(5)
        texto = '\n'.join(registro.output)
        self.assertIn('ambito=orden', texto)
        for privado in ('wrong@example.com', 'wrong', self.pedido.identificador, 'YOXM'):
            self.assertNotIn(privado, texto, privado)

    def test_la_cache_guarda_solo_resumenes_de_los_datos(self):
        self.fallar(3)
        claves = [str(clave) for clave in getattr(cache, '_cache', {})]
        self.assertTrue(any('tracking:fallos:orden:' in clave for clave in claves))
        self.assertTrue(any('tracking:fallos:correo:' in clave for clave in claves))
        for clave in claves:
            for privado in ('wrong', '@', 'example', 'ORD-', 'YOXM'):
                self.assertNotIn(privado, clave, clave)

    # ------------------------------------------------------------------ límite por IP
    def test_el_limite_por_ip_avisa_en_espanol_y_con_los_segundos(self):
        for numero in range(20):
            self.assertEqual(self.consultar(identificador=f'ORD-20261008-A{numero:03d}', email=f'otro{numero}@example.com').status_code, 404)
        respuesta = self.consultar()
        self.assertEqual(respuesta.status_code, 429)
        cuerpo = respuesta.json()
        self.assertEqual(cuerpo['error']['codigo'], 'DEMASIADAS_SOLICITUDES')
        self.assertTrue(cuerpo['mensaje'].startswith('Demasiadas consultas seguidas. Vuelve a intentarlo en '), cuerpo['mensaje'])
        self.assertNotIn('throttled', cuerpo['mensaje'].lower())
        espera = cuerpo['error']['detalles']['reintentar_en_segundos']
        self.assertTrue(1 <= espera <= 60, espera)
        self.assertEqual(respuesta['Retry-After'], str(espera))

    # ------------------------------------------------------------------ textos de espera
    def test_la_espera_se_expresa_en_segundos_o_minutos_redondeando_hacia_arriba(self):
        casos = {1: '1 segundo', 2: '2 segundos', 45: '45 segundos', 59: '59 segundos', 60: '1 minuto',
                 61: '2 minutos', 120: '2 minutos', 121: '3 minutos', 900: '15 minutos', 0: '1 segundo', 0.2: '1 segundo'}
        for segundos, texto in casos.items():
            self.assertEqual(describir_espera(segundos), texto, segundos)
