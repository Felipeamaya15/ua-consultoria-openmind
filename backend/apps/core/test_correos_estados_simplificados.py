"""Pruebas del sistema de correos y estados simplificados del pedido."""
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.domain.plantillas_correo import TIPOS, construir_correo
from apps.core.infrastructure import notificaciones_pedido
from apps.core.models import ConfiguracionCorreo, Pedido, Tienda


class CorreosEstadosSimplificadosTests(TestCase):
    def setUp(self):
        mail.outbox = []
        usuarios = get_user_model().objects
        self.propietario = usuarios.create_user(username='owner-simplificados')
        self.tienda = Tienda.objects.create(nombre='Tienda Simplificada', id_usuario_propietario=self.propietario)
        self.api = APIClient()
        self.api.force_authenticate(self.propietario)
        self.pedido = Pedido.objects.create(
            tienda=self.tienda,
            monto_total=Decimal('32000'),
            estado='pendiente',
            nombre_contacto='Carlos Soto',
            correo_contacto='carlos.soto@gmail.com',
            entrega={'metodo': 'Starken', 'codigo_seguimiento': 'STK-998877'},
            medio_pago='Transferencia',
        )

    def test_estados_choices_contiene_exactamente_los_5_estados(self):
        estados_keys = [clave for clave, _ in Pedido.ESTADO_CHOICES]
        self.assertEqual(estados_keys, ['pendiente', 'pagado', 'en_camino', 'entregado', 'cancelado'])

    def test_transicion_a_pagado_dispara_correo_pago_y_preparacion(self):
        res = self.api.patch(f'/api/tienda/pedidos/{self.pedido.id_pedido}/estado/', {'estado': 'pagado'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        correo = mail.outbox[0]
        self.assertEqual(correo.to, ['carlos.soto@gmail.com'])
        self.assertIn('confirmado', correo.subject.lower())
        self.assertIn('preparar', correo.body.lower())

    def test_transicion_a_en_camino_dispara_correo_en_camino(self):
        self.pedido.estado = 'pagado'
        self.pedido.save(update_fields=['estado'])
        mail.outbox = []

        res = self.api.patch(f'/api/tienda/pedidos/{self.pedido.id_pedido}/estado/', {'estado': 'en_camino'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        correo = mail.outbox[0]
        self.assertEqual(correo.to, ['carlos.soto@gmail.com'])
        self.assertIn('despachado', correo.subject.lower())
        self.assertIn('en camino', correo.body)

    def test_transicion_a_entregado_dispara_correo_entregado(self):
        self.pedido.estado = 'en_camino'
        self.pedido.save(update_fields=['estado'])
        mail.outbox = []

        res = self.api.patch(f'/api/tienda/pedidos/{self.pedido.id_pedido}/estado/', {'estado': 'entregado'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        correo = mail.outbox[0]
        self.assertEqual(correo.to, ['carlos.soto@gmail.com'])
        self.assertIn('fue entregado', correo.subject)

    def test_transicion_a_cancelado_dispara_correo_cancelado(self):
        res = self.api.patch(f'/api/tienda/pedidos/{self.pedido.id_pedido}/estado/', {'estado': 'cancelado'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        correo = mail.outbox[0]
        self.assertEqual(correo.to, ['carlos.soto@gmail.com'])
        self.assertIn('fue cancelado', correo.subject)

    def test_desactivar_plantilla_omite_envio_automatico_pero_permite_manual(self):
        ConfiguracionCorreo.objects.create(
            tienda=self.tienda,
            plantillas={'order_delivered': {'enabled': False, 'subject': 'Entregado {{orderNumber}}', 'preheader': '', 'body': 'Cuerpo'}}
        )
        self.pedido.estado = 'en_camino'
        self.pedido.save(update_fields=['estado'])
        mail.outbox = []

        # Cambio automático -> no envía por estar desactivado
        res_auto = self.api.patch(f'/api/tienda/pedidos/{self.pedido.id_pedido}/estado/', {'estado': 'entregado'}, format='json')
        self.assertEqual(res_auto.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

        # Envío manual de emergencia -> forzar=True envía igual
        res_manual = notificaciones_pedido.enviar_correo_manual(self.pedido, 'order_delivered')
        self.assertTrue(res_manual.enviado)
        self.assertEqual(len(mail.outbox), 1)

    def test_api_correos_retorna_y_guarda_todas_las_plantillas(self):
        res_get = self.api.get('/api/tienda/correos/')
        self.assertEqual(res_get.status_code, 200)
        plantillas = res_get.json()['data']['plantillas']
        for tipo_esperado in ['order_received', 'payment_success', 'order_shipped', 'order_delivered', 'order_cancelled']:
            self.assertIn(tipo_esperado, plantillas)

        # Actualizar asunto de entregado
        plantillas['order_delivered']['subject'] = 'Paquete entregado {{orderNumber}}'
        res_put = self.api.put('/api/tienda/correos/', {'plantillas': plantillas}, format='json')
        self.assertEqual(res_put.status_code, 200)

        correo_render = construir_correo('order_delivered', self.pedido, forzar=True)
        self.assertIn('Paquete entregado', correo_render.asunto)

    def test_portal_seguimiento_linea_tiempo_tiene_4_pasos(self):
        cliente_anon = APIClient()
        res = cliente_anon.post('/api/pedidos/seguimiento/', {
            'identificador': self.pedido.identificador,
            'email': self.pedido.correo_contacto,
        }, format='json')
        self.assertEqual(res.status_code, 200)
        linea = res.json()['data']['linea_tiempo']
        self.assertEqual(len(linea), 4)
        etiquetas = [p['etiqueta'] for p in linea]
        self.assertEqual(etiquetas, ['Pendiente', 'Pagado/En preparación', 'En camino', 'Entregado'])
