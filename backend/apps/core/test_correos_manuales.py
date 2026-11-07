"""Pruebas para el envío manual de correos de emergencia y compatibilidad de dominios."""
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.domain.plantillas_correo import construir_correo
from apps.core.infrastructure import notificaciones_pedido
from apps.core.infrastructure.email_service import _destinatario_valido, enviar_correo
from apps.core.models import ConfiguracionCorreo, Pedido, Tienda


class CorreosManualesTests(TestCase):
    def setUp(self):
        mail.outbox = []
        usuarios = get_user_model().objects
        self.propietario = usuarios.create_user(username='propietario-manual')
        self.tienda = Tienda.objects.create(nombre='Tienda Manual', id_usuario_propietario=self.propietario)
        self.api = APIClient()
        self.api.force_authenticate(self.propietario)
        self.pedido = Pedido.objects.create(
            tienda=self.tienda,
            monto_total=Decimal('25000'),
            estado='pendiente',
            nombre_contacto='Carlos Gomez',
            correo_contacto='carlos.gomez@gmail.com',
            entrega={'metodo': 'Starken'},
            medio_pago='Transferencia',
        )

    def test_destinatario_normalizado_con_gmail_outlook_hotmail(self):
        # Prueba compatibilidad con mayúsculas y espacios en varios proveedores
        self.assertEqual(_destinatario_valido('  Juan.Perez@GMAIL.COM  '), 'Juan.Perez@gmail.com')
        self.assertEqual(_destinatario_valido('maria@outlook.com'), 'maria@outlook.com')
        self.assertEqual(_destinatario_valido('pedro@HOTMAIL.COM'), 'pedro@hotmail.com')
        self.assertEqual(_destinatario_valido('alguien+alias@live.cl'), 'alguien+alias@live.cl')

    def test_construir_correo_forzar_ignora_plantilla_desactivada(self):
        # Desactivamos la plantilla de recepción
        ConfiguracionCorreo.objects.create(
            tienda=self.tienda,
            plantillas={'order_received': {'enabled': False, 'subject': 'Recepcion', 'preheader': '', 'body': 'Cuerpo'}}
        )
        # Sin forzar devuelve None
        self.assertIsNone(construir_correo('order_received', self.pedido, forzar=False))
        # Con forzar genera el correo normalmente
        correo = construir_correo('order_received', self.pedido, forzar=True)
        self.assertIsNotNone(correo)
        self.assertEqual(correo.asunto, 'Recepcion')

    def test_enviar_correo_manual_bypasa_ya_enviado_y_actualiza_marca(self):
        # Primera vez manual
        res1 = notificaciones_pedido.enviar_correo_manual(self.pedido, 'order_received')
        self.assertTrue(res1.enviado)
        self.assertEqual(len(mail.outbox), 1)

        # Segunda vez manual (debe permitir reenvío de emergencia a diferencia del automático)
        res2 = notificaciones_pedido.enviar_correo_manual(self.pedido, 'order_received')
        self.assertTrue(res2.enviado)
        self.assertEqual(len(mail.outbox), 2)

        pedido_actual = Pedido.objects.get(pk=self.pedido.pk)
        notif = pedido_actual.entrega.get('notificaciones', {}).get('order_received')
        self.assertTrue(notif.get('manual'))
        self.assertTrue(notif.get('enviado'))
        self.assertEqual(notif.get('intentos'), 2)

    def test_endpoint_enviar_correo_manual_pedido(self):
        url = f'/api/tienda/pedidos/{self.pedido.pk}/enviar-correo/'
        response = self.api.post(url, {'tipo': 'order_received'}, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.data['exito'])
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['carlos.gomez@gmail.com'])

    def test_endpoint_enviar_correo_manual_pedido_con_destinatario_override(self):
        url = f'/api/tienda/pedidos/{self.pedido.pk}/enviar-correo/'
        response = self.api.post(url, {'tipo': 'payment_success', 'destinatario': 'emergencia@outlook.com'}, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['emergencia@outlook.com'])

    def test_endpoint_probar_correo_desde_panel_correos(self):
        url = '/api/tienda/correos/enviar-manual/'
        response = self.api.post(url, {
            'tipo': 'order_shipped',
            'id_pedido': self.pedido.pk,
            'destinatario': 'cliente@hotmail.com'
        }, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['cliente@hotmail.com'])

    def test_endpoint_rechaza_tipo_invalido(self):
        url = f'/api/tienda/pedidos/{self.pedido.pk}/enviar-correo/'
        response = self.api.post(url, {'tipo': 'tipo_inexistente'}, format='json')
        self.assertEqual(response.status_code, 400)
