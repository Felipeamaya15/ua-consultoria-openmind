"""Envío del correo de despacho cuando el propietario marca el pedido como enviado (SCRUM-431)."""
import smtplib
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.core.mail import EmailMultiAlternatives
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.infrastructure import notificaciones_pedido
from apps.core.infrastructure.email_service import ResultadoEnvio
from apps.core.infrastructure.notificaciones_pedido import notificar_cambio_de_estado
from apps.core.models import ConfiguracionCorreo, Pedido, Tienda

CON_CODIGO = {'metodo': 'Chilexpress', 'codigo_seguimiento': 'CHILEX-12345'}


class CorreoDeDespachoBase(TestCase):
    def setUp(self):
        cache.clear()
        mail.outbox = []
        usuarios = get_user_model().objects
        self.propietario = usuarios.create_user(username='despacho-envio-owner')
        self.comprador = usuarios.create_user(username='despacho-envio-comprador')
        self.tienda = Tienda.objects.create(nombre='Tienda Demo', id_usuario_propietario=self.propietario)
        self.api = APIClient()
        self.api.force_authenticate(self.propietario)

    def pedido(self, estado='en_origen', entrega=None, **extra):
        datos = dict(
            tienda=self.tienda, monto_total=Decimal('15990'), estado=estado, nombre_contacto='Ana',
            correo_contacto='ana@example.com', telefono_contacto='+56911112222',
            entrega=dict(CON_CODIGO) if entrega is None else entrega,
        )
        datos.update(extra)
        return Pedido.objects.create(**datos)

    def cambiar(self, pedido, estado='enviado'):
        return self.api.patch(f'/api/tienda/pedidos/{pedido.id_pedido}/estado/', {'estado': estado}, format='json')

    def refrescar(self, pedido):
        return Pedido.objects.get(pk=pedido.pk)

    def marca(self, pedido):
        return (self.refrescar(pedido).entrega.get('notificaciones') or {}).get('order_shipped')


class EnvioAlDespacharTests(CorreoDeDespachoBase):
    def test_al_marcar_el_pedido_como_enviado_se_envia_el_correo_al_comprador(self):
        pedido = self.pedido()
        respuesta = self.cambiar(pedido)
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(len(mail.outbox), 1)
        correo = mail.outbox[0]
        self.assertEqual(correo.to, ['ana@example.com'])
        self.assertEqual(correo.subject, f'Tu pedido ya fue despachado · {pedido.identificador}')
        self.assertIn(f'Tu pedido {pedido.identificador} ya fue despachado y va en camino.', correo.body)
        self.assertIn('Transportista: Chilexpress', correo.body)
        self.assertIn('Código de seguimiento: CHILEX-12345', correo.body)
        self.assertTrue(correo.from_email.startswith('Tienda Demo <'))
        self.assertEqual([tipo for _, tipo in correo.alternatives], ['text/html'])

    def test_la_respuesta_informa_del_correo_y_conserva_los_campos_de_siempre(self):
        pedido = self.pedido()
        datos = self.cambiar(pedido).json()['data']
        self.assertEqual(datos['correo'], {'enviado': True, 'codigo': 'enviado'})
        self.assertEqual((datos['id_pedido'], datos['identificador'], datos['estado']), (pedido.id_pedido, pedido.identificador, 'enviado'))
        self.assertIn('estado_etiqueta', datos)

    def test_queda_una_marca_en_el_pedido_y_el_resto_de_la_entrega_no_cambia(self):
        pedido = self.pedido()
        self.cambiar(pedido)
        entrega = self.refrescar(pedido).entrega
        self.assertEqual({k: v for k, v in entrega.items() if k != 'notificaciones'}, CON_CODIGO)
        marca = entrega['notificaciones']['order_shipped']
        self.assertEqual((marca['enviado'], marca['codigo'], marca['intentos']), (True, 'enviado', 1))
        self.assertTrue(marca['fecha'])

    def test_el_alias_despachado_tambien_envia_el_correo(self):
        respuesta = self.cambiar(self.pedido(), 'despachado')
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)

    def test_el_correo_sale_despues_de_guardar_el_estado(self):
        pedido = self.pedido()
        vistos = []

        def espia(*args, **kwargs):
            vistos.append(self.refrescar(pedido).estado)
            return ResultadoEnvio(True, 'enviado')

        with patch.object(notificaciones_pedido, 'enviar_correo', side_effect=espia):
            self.cambiar(pedido)
        self.assertEqual(vistos, ['enviado'])

    def test_se_usa_la_plantilla_propia_de_la_tienda(self):
        ConfiguracionCorreo.objects.create(tienda=self.tienda, plantillas={'order_shipped': {
            'enabled': True, 'subject': 'Va en camino {{orderNumber}}', 'preheader': 'Resumen', 'body': 'Hola {{customerName}}: {{trackingCode}}'}})
        pedido = self.pedido()
        self.cambiar(pedido)
        self.assertEqual(mail.outbox[0].subject, f'Va en camino {pedido.identificador}')
        self.assertEqual(mail.outbox[0].body, 'Hola Ana: CHILEX-12345')

    def test_el_correo_no_lleva_datos_privados(self):
        pedido = self.pedido(entrega={**CON_CODIGO, 'direccion': {'street': 'Calle Secreta 123'}})
        self.cambiar(pedido)
        texto = mail.outbox[0].body + mail.outbox[0].alternatives[0][0]
        for privado in ('+56911112222', 'Calle Secreta', '15.990'):
            self.assertNotIn(privado, texto, privado)


class CuandoNoSeEnviaTests(CorreoDeDespachoBase):
    def test_los_otros_cambios_de_estado_no_envian_correo(self):
        for origen, destino in (('pendiente', 'pagado'), ('pagado', 'preparando'), ('preparando', 'en_origen'), ('enviado', 'en_reparto'),
                                ('en_reparto', 'entregado'), ('pagado', 'cancelado'), ('entregado', 'pendiente')):
            respuesta = self.cambiar(self.pedido(estado=origen), destino)
            self.assertEqual(respuesta.status_code, 200, (origen, destino))
            self.assertIsNone(respuesta.json()['data']['correo'], (origen, destino))
        self.assertEqual(mail.outbox, [])

    def test_repetir_el_mismo_estado_no_vuelve_a_enviar(self):
        pedido = self.pedido()
        self.cambiar(pedido)
        respuesta = self.cambiar(pedido)
        self.assertEqual(respuesta.status_code, 200)
        self.assertIsNone(respuesta.json()['data']['correo'])
        self.assertEqual(len(mail.outbox), 1)

    def test_si_el_pedido_vuelve_a_enviado_no_se_duplica_el_aviso(self):
        pedido = self.pedido()
        self.cambiar(pedido)
        self.cambiar(pedido, 'en_reparto')
        respuesta = self.cambiar(pedido, 'enviado')
        self.assertEqual(respuesta.json()['data']['correo'], {'enviado': False, 'codigo': 'ya_enviado'})
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(self.marca(pedido)['intentos'], 1)

    def test_un_correo_desactivado_por_el_propietario_no_se_envia_ni_deja_marca(self):
        ConfiguracionCorreo.objects.create(tienda=self.tienda, plantillas={'order_shipped': {
            'enabled': False, 'subject': 'Asunto', 'preheader': '', 'body': 'Cuerpo'}})
        pedido = self.pedido()
        respuesta = self.cambiar(pedido)
        self.assertEqual(respuesta.json()['data']['correo'], {'enviado': False, 'codigo': 'plantilla_desactivada'})
        self.assertEqual(mail.outbox, [])
        self.assertNotIn('notificaciones', self.refrescar(pedido).entrega)
        # Al volver a activarlo, el siguiente despacho sí lo envía.
        ConfiguracionCorreo.objects.filter(tienda=self.tienda).update(plantillas={})
        self.cambiar(pedido, 'en_reparto')
        self.cambiar(pedido, 'enviado')
        self.assertEqual(len(mail.outbox), 1)

    def test_un_pedido_con_retiro_en_tienda_no_genera_correo_de_despacho(self):
        pedido = self.pedido(entrega={'metodo': 'Retiro'})
        respuesta = self.cambiar(pedido)
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.json()['data']['correo'], {'enviado': False, 'codigo': 'no_corresponde'})
        self.assertEqual(mail.outbox, [])
        self.assertNotIn('notificaciones', self.refrescar(pedido).entrega)

    def test_sin_correo_valido_del_comprador_el_estado_se_guarda_y_se_informa(self):
        pedido = self.pedido(correo_contacto='', contacto={'nombre': 'Ana'})
        respuesta = self.cambiar(pedido)
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.json()['data']['correo'], {'enviado': False, 'codigo': 'destinatario_invalido'})
        self.assertEqual(self.refrescar(pedido).estado, 'enviado')
        self.assertEqual(mail.outbox, [])

    def test_un_envio_en_curso_no_se_repite_pero_uno_antiguo_si(self):
        pedido = self.pedido()
        marca = {'enviado': False, 'codigo': 'enviando', 'fecha': timezone.now().isoformat(), 'intentos': 0}
        Pedido.objects.filter(pk=pedido.pk).update(entrega={**CON_CODIGO, 'notificaciones': {'order_shipped': marca}})
        respuesta = self.cambiar(pedido)
        self.assertEqual(respuesta.json()['data']['correo'], {'enviado': False, 'codigo': 'envio_en_curso'})
        self.assertEqual(mail.outbox, [])
        marca['fecha'] = (timezone.now() - timedelta(minutes=10)).isoformat()
        Pedido.objects.filter(pk=pedido.pk).update(estado='en_origen', entrega={**CON_CODIGO, 'notificaciones': {'order_shipped': marca}})
        self.cambiar(pedido)
        self.assertEqual(len(mail.outbox), 1)

    def test_dos_solicitudes_a_la_vez_envian_un_solo_correo(self):
        pedido = self.pedido()
        pedido.estado = 'enviado'
        pedido.save(update_fields=['estado'])
        primera = Pedido.objects.get(pk=pedido.pk)
        segunda = Pedido.objects.get(pk=pedido.pk)  # las dos creyeron que el estado anterior era en_origen
        self.assertEqual(notificar_cambio_de_estado(primera, 'en_origen'), ResultadoEnvio(True, 'enviado'))
        self.assertEqual(notificar_cambio_de_estado(segunda, 'en_origen'), ResultadoEnvio(False, 'ya_enviado'))
        self.assertEqual(len(mail.outbox), 1)

    def test_la_funcion_ignora_cambios_que_no_generan_aviso(self):
        pedido = self.pedido(estado='pagado')
        self.assertIsNone(notificar_cambio_de_estado(pedido, 'pagado'))
        self.assertIsNone(notificar_cambio_de_estado(pedido, 'pendiente'))
        self.assertEqual(mail.outbox, [])


class FallasDelCorreoTests(CorreoDeDespachoBase):
    def test_si_falla_el_servidor_de_correo_el_estado_igual_se_guarda(self):
        pedido = self.pedido()
        with patch.object(EmailMultiAlternatives, 'send', side_effect=smtplib.SMTPAuthenticationError(535, b'mal')):
            respuesta = self.cambiar(pedido)
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertEqual(respuesta.json()['data']['correo'], {'enviado': False, 'codigo': 'error_de_envio'})
        self.assertEqual(self.refrescar(pedido).estado, 'enviado')
        marca = self.marca(pedido)
        self.assertEqual((marca['enviado'], marca['codigo'], marca['intentos']), (False, 'error_de_envio', 1))

    def test_un_aviso_que_fallo_se_reintenta_la_proxima_vez_que_entra_en_enviado(self):
        pedido = self.pedido()
        with patch.object(EmailMultiAlternatives, 'send', side_effect=OSError('red caída')):
            self.cambiar(pedido)
        self.assertEqual(mail.outbox, [])
        self.cambiar(pedido, 'en_reparto')
        respuesta = self.cambiar(pedido, 'enviado')
        self.assertEqual(respuesta.json()['data']['correo'], {'enviado': True, 'codigo': 'enviado'})
        self.assertEqual(len(mail.outbox), 1)
        marca = self.marca(pedido)
        self.assertEqual((marca['enviado'], marca['intentos']), (True, 2))

    def test_un_error_inesperado_al_preparar_el_correo_no_rompe_el_cambio_de_estado(self):
        pedido = self.pedido()
        with patch.object(notificaciones_pedido, 'construir_correo', side_effect=RuntimeError('fallo interno')):
            with self.assertLogs('apps.core.infrastructure.notificaciones_pedido', level='ERROR'):
                respuesta = self.cambiar(pedido)
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta.json()['data']['correo'], {'enviado': False, 'codigo': 'error_inesperado'})
        self.assertEqual(self.refrescar(pedido).estado, 'enviado')
        self.assertEqual(self.marca(pedido)['codigo'], 'error_inesperado')

    def test_un_error_al_reservar_el_aviso_tampoco_rompe_el_cambio_de_estado(self):
        pedido = self.pedido()
        with patch.object(notificaciones_pedido, '_reservar', side_effect=RuntimeError('base caída')):
            with self.assertLogs('apps.core.infrastructure.notificaciones_pedido', level='ERROR'):
                respuesta = self.cambiar(pedido)
        self.assertEqual(respuesta.status_code, 200)
        self.assertIsNone(respuesta.json()['data']['correo'])
        self.assertEqual(self.refrescar(pedido).estado, 'enviado')

    def test_el_registro_de_una_falla_no_contiene_el_correo_del_comprador(self):
        pedido = self.pedido()
        with patch.object(EmailMultiAlternatives, 'send', side_effect=smtplib.SMTPRecipientsRefused({'ana@example.com': (550, b'no existe')})):
            with self.assertLogs('apps.core.infrastructure.email_service', level='WARNING') as registro:
                self.cambiar(pedido)
        texto = '\n'.join(registro.output)
        self.assertNotIn('ana@example.com', texto)
        self.assertIn(f'order_shipped {pedido.identificador}', texto)


class PermisosYPrivacidadTests(CorreoDeDespachoBase):
    def test_solo_el_propietario_puede_disparar_el_correo(self):
        pedido = self.pedido()
        anonimo = APIClient().patch(f'/api/tienda/pedidos/{pedido.id_pedido}/estado/', {'estado': 'enviado'}, format='json')
        self.assertEqual(anonimo.status_code, 401)
        self.api.force_authenticate(self.comprador)
        self.assertEqual(self.cambiar(pedido).status_code, 403)
        self.assertEqual(mail.outbox, [])
        self.assertEqual(self.refrescar(pedido).estado, 'en_origen')

    def test_un_pedido_de_otra_tienda_no_envia_nada(self):
        ajeno = self.pedido(tienda=None)
        self.assertEqual(self.cambiar(ajeno).status_code, 404)
        self.assertEqual(mail.outbox, [])

    def test_la_marca_interna_no_se_muestra_al_comprador_en_el_seguimiento(self):
        pedido = self.pedido()
        self.cambiar(pedido)
        respuesta = APIClient().post('/api/pedidos/seguimiento/', {'identificador': pedido.identificador, 'email': 'ana@example.com'}, format='json')
        self.assertEqual(respuesta.status_code, 200, respuesta.content)
        self.assertNotIn('notificaciones', respuesta.content.decode())
        self.assertNotIn('intentos', respuesta.content.decode())
