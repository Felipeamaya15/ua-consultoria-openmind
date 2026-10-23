"""Plantillas de correo del pedido (SCRUM-424, 425 y 426)."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.core.domain.plantillas_correo import PlantillaCorreoInvalida, VARIABLES_PERMITIDAS, construir_correo
from apps.core.models import Pedido, Tienda


class PlantillasCorreoBase(TestCase):
    def setUp(self):
        propietario = get_user_model().objects.create_user(username='plantillas-owner')
        self.tienda = Tienda.objects.create(nombre='Tienda Demo', id_usuario_propietario=propietario)

    def pedido(self, estado='pendiente', **extra):
        datos = dict(
            tienda=self.tienda, monto_total=Decimal('15990'), estado=estado,
            nombre_contacto='Ana', correo_contacto='ana@example.com', entrega={'metodo': 'Starken'},
        )
        datos.update(extra)
        return Pedido.objects.create(**datos)


class PlantillaRecepcionTests(PlantillasCorreoBase):
    def test_renderiza_los_datos_del_pedido(self):
        pedido = self.pedido()
        correo = construir_correo('order_received', pedido)
        self.assertEqual(correo.asunto, f'Recibimos tu pedido {pedido.identificador}')
        for esperado in ('Hola Ana', '$15.990', 'Starken', 'Tienda Demo'):
            self.assertIn(esperado, correo.cuerpo)
        self.assertNotIn('{{', correo.cuerpo)

    def test_sin_nombre_usa_un_saludo_generico(self):
        correo = construir_correo('order_received', self.pedido(nombre_contacto=''))
        self.assertIn('Hola cliente', correo.cuerpo)

    def test_rechaza_pedido_cancelado(self):
        with self.assertRaises(PlantillaCorreoInvalida):
            construir_correo('order_received', self.pedido(estado='cancelado'))

    def test_tipo_desconocido(self):
        with self.assertRaises(PlantillaCorreoInvalida):
            construir_correo('inexistente', self.pedido())


class PlantillaPagoExitosoTests(PlantillasCorreoBase):
    def test_renderiza_los_datos_del_pedido(self):
        pedido = self.pedido(estado='pagado')
        correo = construir_correo('payment_success', pedido)
        self.assertEqual(correo.asunto, f'Tu pago fue confirmado · {pedido.identificador}')
        for esperado in ('Hola Ana', '$15.990', 'Tienda Demo'):
            self.assertIn(esperado, correo.cuerpo)

    def test_rechaza_pedido_no_pagado(self):
        for estado in ('pendiente', 'cancelado'):
            with self.assertRaises(PlantillaCorreoInvalida):
                construir_correo('payment_success', self.pedido(estado=estado))

class PlantillaPagoRechazadoTests(PlantillasCorreoBase):
    def test_renderiza_los_datos_del_pedido(self):
        pedido = self.pedido(estado='pendiente')
        correo = construir_correo('payment_rejected', pedido)
        self.assertEqual(correo.asunto, f'No pudimos confirmar tu pago · {pedido.identificador}')
        for esperado in ('Hola Ana', 'No se realizó ningún cobro', 'Tienda Demo'):
            self.assertIn(esperado, correo.cuerpo)

    def test_rechaza_pedido_que_no_esta_pendiente(self):
        for estado in ('pagado', 'cancelado', 'entregado'):
            with self.assertRaises(PlantillaCorreoInvalida):
                construir_correo('payment_rejected', self.pedido(estado=estado))

class PlantillasPersonalizadasTests(PlantillasCorreoBase):
    URL = '/api/tienda/correos/'

    def setUp(self):
        super().setUp()
        from rest_framework.test import APIClient
        self.owner = self.tienda.id_usuario_propietario
        self.api = APIClient()
        self.api.force_authenticate(self.owner)

    def guardar(self, tipo='order_received', **cambios):
        plantilla = {'enabled': True, 'subject': 'Gracias {{customerName}}', 'preheader': 'Hola', 'body': 'Pedido {{orderNumber}}'}
        plantilla.update(cambios)
        return self.api.put(self.URL, {'plantillas': {tipo: plantilla}}, format='json')

    def test_get_devuelve_las_plantillas_por_defecto(self):
        datos = self.api.get(self.URL).json()['data']['plantillas']
        self.assertEqual(set(datos), {'order_received', 'payment_rejected', 'payment_success', 'order_shipped'})
        self.assertEqual(datos['order_received']['subject'], 'Recibimos tu pedido {{orderNumber}}')

    def test_la_plantilla_guardada_reemplaza_a_la_de_por_defecto(self):
        self.assertEqual(self.guardar().status_code, 200)
        pedido = self.pedido()
        correo = construir_correo('order_received', pedido)
        self.assertEqual(correo.asunto, 'Gracias Ana')
        self.assertEqual(correo.cuerpo, f'Pedido {pedido.identificador}')
        # Los demás tipos siguen con su plantilla por defecto.
        self.assertIn('Tu pago fue confirmado', construir_correo('payment_success', self.pedido(estado='pagado')).asunto)

    def test_un_tipo_desactivado_no_genera_correo(self):
        self.guardar(enabled=False)
        self.assertIsNone(construir_correo('order_received', self.pedido()))

    def test_rechaza_variables_y_tipos_desconocidos(self):
        self.assertEqual(self.guardar(body='Hola {{password}}').status_code, 400)
        self.assertEqual(self.guardar(tipo='otro').status_code, 400)
        self.assertEqual(self.guardar(subject='').status_code, 400)

    def test_solo_el_propietario_puede_ver_y_editar(self):
        from rest_framework.test import APIClient
        otro = get_user_model().objects.create_user(username='otro-usuario')
        api = APIClient()
        self.assertEqual(api.get(self.URL).status_code, 401)
        api.force_authenticate(otro)
        self.assertEqual(api.get(self.URL).status_code, 403)
        self.assertEqual(api.put(self.URL, {'plantillas': {}}, format='json').status_code, 403)


    def test_acepta_y_renderiza_todas_las_variables_del_panel(self):
        cuerpo = ' '.join('{{%s}}' % v for v in VARIABLES_PERMITIDAS)
        self.assertEqual(self.guardar(body=cuerpo).status_code, 200)
        correo = construir_correo('order_received', self.pedido())
        self.assertNotIn('{{', correo.cuerpo)
        for esperado in ('ana@example.com', 'Starken', 'Tienda Demo', 'Ana'):
            self.assertIn(esperado, correo.cuerpo)


    def test_expone_las_plantillas_por_defecto_para_restaurar(self):
        self.guardar(subject='Otro asunto')
        datos = self.api.get(self.URL).json()['data']
        self.assertEqual(datos['plantillas']['order_received']['subject'], 'Otro asunto')
        self.assertEqual(datos['por_defecto']['order_received']['subject'], 'Recibimos tu pedido {{orderNumber}}')
        self.assertTrue(datos['por_defecto']['order_received']['enabled'])
