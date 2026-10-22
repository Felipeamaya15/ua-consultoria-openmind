"""Plantilla del correo de pedido despachado (SCRUM-427): tipo order_shipped."""
import re
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.core.domain.plantillas_correo import PlantillaCorreoInvalida, TIPOS, VARIABLES_PERMITIDAS, construir_correo
from apps.core.domain.plantillas_correo.base import _MARCADOR
from apps.core.models import ConfiguracionCorreo, Pedido, Tienda

URL = '/api/tienda/correos/'
CON_CODIGO = {'metodo': 'Chilexpress', 'codigo_seguimiento': 'CHILEX-12345'}


class PlantillaDespachoBase(TestCase):
    def setUp(self):
        self.propietario = get_user_model().objects.create_user(username='despacho-owner')
        self.tienda = Tienda.objects.create(nombre='Tienda Demo', id_usuario_propietario=self.propietario)

    def pedido(self, estado='enviado', entrega=None, **extra):
        datos = dict(
            tienda=self.tienda, monto_total=Decimal('15990'), estado=estado, nombre_contacto='Ana',
            correo_contacto='ana@example.com', entrega=CON_CODIGO if entrega is None else entrega,
        )
        datos.update(extra)
        return Pedido.objects.create(**datos)


@override_settings(STOREFRONT_PUBLIC_URL='https://tienda.test/plantilla/1')
class RenderizadoDelDespachoTests(PlantillaDespachoBase):
    def test_el_tipo_esta_registrado_junto_a_los_otros_tres(self):
        self.assertEqual(set(TIPOS), {'order_received', 'payment_success', 'payment_rejected', 'order_shipped'})

    def test_renderiza_el_despacho_con_transportista_y_codigo(self):
        pedido = self.pedido()
        correo = construir_correo('order_shipped', pedido)
        self.assertEqual(correo.asunto, f'Tu pedido ya fue despachado · {pedido.identificador}')
        self.assertEqual(correo.preheader, 'Tu compra va en camino.')
        self.assertEqual(correo.cuerpo, (
            'Hola Ana,\n\n'
            f'Tu pedido {pedido.identificador} ya fue despachado y va en camino.\n\n'
            'Transportista: Chilexpress\n'
            'Código de seguimiento: CHILEX-12345\n\n'
            f'Revisa el estado de tu pedido aquí (te pediremos el correo con el que compraste): https://tienda.test/plantilla/1/seguimiento?orden={pedido.identificador}\n\n'
            'Gracias por comprar en Tienda Demo.'
        ))
        self.assertNotIn('{{', correo.cuerpo)

    def test_sin_codigo_de_seguimiento_no_queda_una_linea_vacia(self):
        correo = construir_correo('order_shipped', self.pedido(entrega={'metodo': 'Starken'}))
        self.assertIn('Transportista: Starken', correo.cuerpo)
        self.assertNotIn('Código de seguimiento', correo.cuerpo)
        self.assertNotIn('\n\n\n', correo.cuerpo)
        self.assertEqual([l for l in correo.cuerpo.split('\n') if l.rstrip().endswith(':')], [])

    def test_sin_transportista_ni_codigo_el_correo_sigue_completo(self):
        correo = construir_correo('order_shipped', self.pedido(entrega={}))
        self.assertIn('ya fue despachado y va en camino.', correo.cuerpo)
        self.assertNotIn('Transportista', correo.cuerpo)
        self.assertNotIn('Código de seguimiento', correo.cuerpo)
        self.assertNotIn('\n\n\n', correo.cuerpo)
        self.assertTrue(correo.cuerpo.startswith('Hola Ana,'))
        self.assertTrue(correo.cuerpo.endswith('Gracias por comprar en Tienda Demo.'))

    def test_un_codigo_sin_transportista_igual_se_informa(self):
        correo = construir_correo('order_shipped', self.pedido(entrega={'codigo_seguimiento': 'ABC-1'}))
        self.assertNotIn('Transportista', correo.cuerpo)
        self.assertIn('Código de seguimiento: ABC-1', correo.cuerpo)

    def test_sin_nombre_usa_un_saludo_generico(self):
        correo = construir_correo('order_shipped', self.pedido(nombre_contacto=''))
        self.assertTrue(correo.cuerpo.startswith('Hola cliente,'))

    def test_se_puede_generar_en_los_estados_posteriores_al_envio(self):
        for estado in ('enviado', 'en_reparto', 'entregado'):
            self.assertIsNotNone(construir_correo('order_shipped', self.pedido(estado=estado)), estado)

    def test_rechaza_los_pedidos_que_aun_no_se_despachan(self):
        for estado in ('pendiente', 'pagado', 'preparando', 'en_origen', 'cancelado'):
            with self.assertRaises(PlantillaCorreoInvalida, msg=estado):
                construir_correo('order_shipped', self.pedido(estado=estado))

    def test_un_pedido_con_retiro_en_tienda_no_se_despacha(self):
        with self.assertRaises(PlantillaCorreoInvalida):
            construir_correo('order_shipped', self.pedido(entrega={'metodo': 'Retiro'}))

    def test_el_correo_no_incluye_datos_privados_del_pedido(self):
        pedido = self.pedido(telefono_contacto='+56911112222', entrega={**CON_CODIGO, 'direccion': {'street': 'Calle Secreta 123'}})
        correo = construir_correo('order_shipped', pedido)
        texto = f'{correo.asunto}\n{correo.preheader}\n{correo.cuerpo}'
        for privado in ('+56911112222', 'Calle Secreta', 'ana@example.com', '15.990'):
            self.assertNotIn(privado, texto, privado)


class PlantillaPersonalizadaDelDespachoTests(PlantillaDespachoBase):
    def guardar(self, **cambios):
        plantilla = {'enabled': True, 'subject': 'Va en camino {{orderNumber}}', 'preheader': 'Resumen',
                     'body': 'Tu paquete {{orderNumber}} va con {{carrier}}.\nSeguimiento: {{trackingCode}}'}
        plantilla.update(cambios)
        ConfiguracionCorreo.objects.update_or_create(tienda=self.tienda, defaults={'plantillas': {'order_shipped': plantilla}})

    def test_la_plantilla_de_la_tienda_reemplaza_a_la_de_por_defecto(self):
        self.guardar()
        pedido = self.pedido()
        correo = construir_correo('order_shipped', pedido)
        self.assertEqual(correo.asunto, f'Va en camino {pedido.identificador}')
        self.assertEqual(correo.cuerpo, f'Tu paquete {pedido.identificador} va con Chilexpress.\nSeguimiento: CHILEX-12345')

    def test_a_la_plantilla_de_la_tienda_tambien_se_le_quitan_las_lineas_sin_datos(self):
        self.guardar()
        correo = construir_correo('order_shipped', self.pedido(entrega={'metodo': 'Starken'}))
        self.assertNotIn('Seguimiento', correo.cuerpo)
        self.assertTrue(correo.cuerpo.endswith('va con Starken.'))

    def test_una_linea_con_dos_datos_se_conserva_si_al_menos_uno_existe(self):
        self.guardar(body='Envío: {{carrier}} {{trackingCode}}\nFin')
        correo = construir_correo('order_shipped', self.pedido(entrega={'metodo': 'Starken'}))
        self.assertEqual(correo.cuerpo.split('\n'), ['Envío: Starken ', 'Fin'])

    def test_un_correo_desactivado_no_se_genera(self):
        self.guardar(enabled=False)
        self.assertIsNone(construir_correo('order_shipped', self.pedido()))

    def test_las_reglas_de_estado_valen_tambien_con_plantilla_propia(self):
        self.guardar()
        with self.assertRaises(PlantillaCorreoInvalida):
            construir_correo('order_shipped', self.pedido(estado='pagado'))


class PlantillaDespachoEnElPanelTests(PlantillaDespachoBase):
    def setUp(self):
        super().setUp()
        self.api = APIClient()
        self.api.force_authenticate(self.propietario)

    def test_el_panel_recibe_el_tipo_con_su_texto_por_defecto(self):
        datos = self.api.get(URL).json()['data']
        for seccion in ('plantillas', 'por_defecto'):
            plantilla = datos[seccion]['order_shipped']
            self.assertEqual(plantilla['subject'], 'Tu pedido ya fue despachado · {{orderNumber}}')
            self.assertEqual(plantilla['preheader'], 'Tu compra va en camino.')
            self.assertIn('Transportista: {{carrier}}', plantilla['body'])
            self.assertTrue(plantilla['enabled'])

    def test_el_propietario_puede_editar_y_guardar_el_correo_de_despacho(self):
        cuerpo = {'enabled': True, 'subject': 'Despachado {{orderNumber}}', 'preheader': 'Va en camino', 'body': 'Hola {{customerName}}: {{trackingCode}}'}
        respuesta = self.api.put(URL, {'plantillas': {'order_shipped': cuerpo}}, format='json')
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(respuesta.json()['data']['plantillas']['order_shipped']['subject'], 'Despachado {{orderNumber}}')
        pedido = self.pedido()
        self.assertEqual(construir_correo('order_shipped', pedido).asunto, f'Despachado {pedido.identificador}')
        self.assertEqual(self.api.get(URL).json()['data']['por_defecto']['order_shipped']['subject'],
                         'Tu pedido ya fue despachado · {{orderNumber}}')

    def test_las_variables_desconocidas_se_rechazan_tambien_en_el_despacho(self):
        cuerpo = {'enabled': True, 'subject': 'Asunto', 'preheader': '', 'body': 'Hola {{password}}'}
        self.assertEqual(self.api.put(URL, {'plantillas': {'order_shipped': cuerpo}}, format='json').status_code, 400)

    def test_guardar_el_despacho_no_toca_las_otras_plantillas(self):
        cuerpo = {'enabled': False, 'subject': 'Asunto', 'preheader': '', 'body': 'Cuerpo'}
        self.api.put(URL, {'plantillas': {'order_shipped': cuerpo}}, format='json')
        datos = self.api.get(URL).json()['data']['plantillas']
        self.assertFalse(datos['order_shipped']['enabled'])
        self.assertTrue(datos['order_received']['enabled'])
        self.assertEqual(datos['order_received']['subject'], 'Recibimos tu pedido {{orderNumber}}')

    def test_solo_el_propietario_ve_y_edita_el_despacho(self):
        otro = get_user_model().objects.create_user(username='despacho-otro')
        api = APIClient()
        api.force_authenticate(otro)
        self.assertEqual(api.get(URL).status_code, 403)
        self.assertEqual(api.put(URL, {'plantillas': {}}, format='json').status_code, 403)


class ConsistenciaDeLasPlantillasTests(TestCase):
    def test_todas_las_plantillas_por_defecto_usan_solo_variables_permitidas(self):
        for tipo, (_, plantilla) in TIPOS.items():
            usadas = set(_MARCADOR.findall(f'{plantilla.asunto}\n{plantilla.preheader}\n{plantilla.cuerpo}'))
            self.assertLessEqual(usadas, set(VARIABLES_PERMITIDAS), tipo)

    def test_los_textos_por_defecto_caben_en_los_limites_que_valida_el_panel(self):
        for tipo, (_, plantilla) in TIPOS.items():
            self.assertLessEqual(len(plantilla.asunto), 200, tipo)
            self.assertLessEqual(len(plantilla.preheader), 200, tipo)
            self.assertLessEqual(len(plantilla.cuerpo), 5000, tipo)
            self.assertEqual(re.findall(r'\n{3,}', plantilla.cuerpo), [], tipo)
