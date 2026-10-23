"""Servicio de envío de correos (SCRUM-423)."""
import smtplib
from unittest.mock import patch

from django.conf import settings
from django.core import mail
from django.core.mail import EmailMultiAlternatives
from django.test import SimpleTestCase, override_settings

from apps.core.infrastructure.email_service import ResultadoEnvio, correo_enmascarado, enviar_correo

LOGGER = 'apps.core.infrastructure.email_service'
DESTINO = 'maria.perez@example.com'


@override_settings(DEFAULT_FROM_EMAIL='Tienda Demo <no-reply@tienda.test>')
class EnvioDeCorreoTests(SimpleTestCase):
    def setUp(self):
        mail.outbox = []

    def html(self, mensaje):
        return next(contenido for contenido, tipo in mensaje.alternatives if tipo == 'text/html')

    # ------------------------------------------------------------------ envío correcto
    def test_envia_un_correo_con_version_de_texto_y_html(self):
        resultado = enviar_correo(DESTINO, 'Tu pedido fue despachado', 'Hola María,\n\nTu pedido va en camino.')
        self.assertEqual(resultado, ResultadoEnvio(True, 'enviado'))
        self.assertEqual(len(mail.outbox), 1)
        mensaje = mail.outbox[0]
        self.assertEqual((mensaje.subject, mensaje.to), ('Tu pedido fue despachado', [DESTINO]))
        self.assertEqual(mensaje.body, 'Hola María,\n\nTu pedido va en camino.')
        self.assertEqual([tipo for _, tipo in mensaje.alternatives], ['text/html'])
        self.assertIn('<p style="margin:0 0 16px;">Hola María,</p>', self.html(mensaje))
        self.assertIn('lang="es"', self.html(mensaje))

    def test_la_direccion_de_salida_es_la_configurada_y_el_nombre_es_el_de_la_tienda(self):
        enviar_correo(DESTINO, 'Asunto', 'Cuerpo', nombre_remitente='Mi Tienda')
        enviar_correo(DESTINO, 'Asunto', 'Cuerpo')
        self.assertEqual(mail.outbox[0].from_email, 'Mi Tienda <no-reply@tienda.test>')
        self.assertEqual(mail.outbox[1].from_email, 'Tienda Demo <no-reply@tienda.test>')

    def test_el_nombre_de_la_tienda_no_puede_alterar_el_remitente(self):
        enviar_correo(DESTINO, 'Asunto', 'Cuerpo', nombre_remitente='Evil <hacker@evil.test>\r\nBcc: otro@evil.test')
        mensaje = mail.outbox[0]
        self.assertEqual(mensaje.from_email.rsplit('<', 1)[1], 'no-reply@tienda.test>')
        self.assertNotIn('\n', mensaje.from_email)
        self.assertNotIn('evil.test>', mensaje.from_email.split('<')[0])
        self.assertEqual(mensaje.bcc, [])
        self.assertLessEqual(len(mensaje.from_email.rsplit('<', 1)[0]), 64)

    def test_marca_el_correo_como_automatico(self):
        enviar_correo(DESTINO, 'Asunto', 'Cuerpo')
        self.assertEqual(mail.outbox[0].extra_headers['Auto-Submitted'], 'auto-generated')

    def test_usa_el_tiempo_de_espera_configurado_para_no_dejar_colgada_la_operacion(self):
        with patch('apps.core.infrastructure.email_service.get_connection') as conexion:
            conexion.return_value = mail.get_connection()
            enviar_correo(DESTINO, 'Asunto', 'Cuerpo')
        conexion.assert_called_once_with(timeout=settings.EMAIL_TIMEOUT)

    # ------------------------------------------------------------------ contenido HTML
    def test_el_html_escapa_el_contenido_y_no_ejecuta_codigo(self):
        enviar_correo(DESTINO, 'Asunto', 'Hola <script>alert(1)</script>\n\n<img src=x onerror=alert(2)> & "comillas"')
        html = self.html(mail.outbox[0])
        self.assertNotIn('<script>', html)
        self.assertNotIn('<img', html)
        self.assertIn('&lt;script&gt;alert(1)&lt;/script&gt;', html)
        self.assertIn('&amp; &quot;comillas&quot;', html)
        self.assertIn('<script>', mail.outbox[0].body, 'la versión de texto se conserva tal cual')

    def test_los_saltos_de_linea_y_los_parrafos_se_respetan(self):
        enviar_correo(DESTINO, 'Asunto', 'Línea 1\nLínea 2\n\nOtro párrafo')
        html = self.html(mail.outbox[0])
        self.assertIn('Línea 1<br>Línea 2</p>', html)
        self.assertEqual(html.count('<p style="margin:0 0 16px;">'), 2)

    def test_las_direcciones_web_se_convierten_en_enlaces_sin_la_puntuacion_final(self):
        enviar_correo(DESTINO, 'Asunto', 'Sigue tu pedido: https://tienda.cl/plantilla/1/seguimiento?orden=ORD-20261008-ABCD.\n\nGracias (https://tienda.cl).')
        html = self.html(mail.outbox[0])
        self.assertIn('<a href="https://tienda.cl/plantilla/1/seguimiento?orden=ORD-20261008-ABCD" style="color:#2563eb;">'
                      'https://tienda.cl/plantilla/1/seguimiento?orden=ORD-20261008-ABCD</a>.', html)
        self.assertIn('(<a href="https://tienda.cl" style="color:#2563eb;">https://tienda.cl</a>)', html)

    def test_solo_se_enlazan_direcciones_http_y_https(self):
        enviar_correo(DESTINO, 'Asunto', 'javascript:alert(1) y ftp://x.test y data:text/html,hola y https://ok.test')
        html = self.html(mail.outbox[0])
        self.assertEqual(html.count('<a href='), 1)
        self.assertIn('<a href="https://ok.test"', html)

    def test_una_direccion_con_comillas_no_puede_romper_el_atributo_href(self):
        enviar_correo(DESTINO, 'Asunto', 'https://x.test/"onmouseover="alert(1)')
        html = self.html(mail.outbox[0])
        self.assertNotIn('onmouseover="alert', html)
        self.assertNotIn('" onmouseover', html)

    def test_el_resumen_del_correo_va_oculto_al_inicio_y_escapado(self):
        enviar_correo(DESTINO, 'Asunto', 'Cuerpo', preheader='Tu compra <b>va</b> en camino.')
        html = self.html(mail.outbox[0])
        self.assertIn('display:none', html)
        self.assertIn('Tu compra &lt;b&gt;va&lt;/b&gt; en camino.', html)
        self.assertLess(html.index('display:none'), html.index('Cuerpo'))
        enviar_correo(DESTINO, 'Asunto', 'Cuerpo', preheader='   ')
        self.assertNotIn('display:none', self.html(mail.outbox[1]))

    # ------------------------------------------------------------------ seguridad de las cabeceras
    def test_el_asunto_queda_en_una_sola_linea_y_no_permite_inyectar_cabeceras(self):
        resultado = enviar_correo(DESTINO, 'Hola\r\nBcc: espia@evil.test\nSubject: otro', 'Cuerpo')
        self.assertTrue(resultado.enviado)
        mensaje = mail.outbox[0]
        self.assertEqual(mensaje.subject, 'Hola Bcc: espia@evil.test Subject: otro')
        self.assertEqual(mensaje.bcc, [])
        self.assertNotIn('\n', mensaje.subject)
        self.assertNotIn('\r', mensaje.subject)

    def test_el_asunto_largo_se_acota(self):
        enviar_correo(DESTINO, 'a' * 500, 'Cuerpo')
        self.assertEqual(len(mail.outbox[0].subject), 200)

    def test_destinatarios_invalidos_o_peligrosos_se_rechazan_sin_enviar(self):
        malos = ['', '   ', None, 123, ['a@b.cl'], 'sin-arroba', 'a@b', 'a@b.', '@b.cl', 'a b@c.cl', 'a@b.cl, otro@c.cl', 'a@b.cl;otro@c.cl',
                 'a@b.cl\nBcc: x@y.cl', '<a@b.cl>', 'Maria <a@b.cl>', '"a"@b.cl', 'a@@b.cl', 'a@b.c', 'a@b..clx', 'a..b@c.cl', '.a@b.cl', 'a.@b.cl', 'a@-b.cl', 'a@b-.cl', 'a@.b.cl', 'a@b.cl.', 'a' * 250 + '@b.cl']
        for malo in malos:
            resultado = enviar_correo(malo, 'Asunto', 'Cuerpo')
            self.assertEqual((resultado.enviado, resultado.codigo), (False, 'destinatario_invalido'), repr(malo))
        self.assertEqual(mail.outbox, [])

    def test_destinatarios_validos_se_aceptan_y_se_limpian_los_espacios(self):
        for correo in ('ana@example.com', 'ana.lopez+tienda@sub.dominio.co.cl', 'a_b-c@d-e.cl', '  ana@example.com  ', 'ana@example.com\r\n'):
            self.assertTrue(enviar_correo(correo, 'Asunto', 'Cuerpo').enviado, correo)
        self.assertEqual([m.to for m in mail.outbox[3:]], [['ana@example.com'], ['ana@example.com']])

    def test_sin_asunto_o_sin_cuerpo_no_se_envia(self):
        for asunto, cuerpo in (('', 'Cuerpo'), ('   ', 'Cuerpo'), (None, 'Cuerpo'), ('Asunto', ''), ('Asunto', '  \n '), ('Asunto', None), ('Asunto', 5)):
            resultado = enviar_correo(DESTINO, asunto, cuerpo)
            self.assertEqual((resultado.enviado, resultado.codigo), (False, 'contenido_invalido'), repr((asunto, cuerpo)))
        self.assertEqual(mail.outbox, [])

    # ------------------------------------------------------------------ fallas del servicio de correo
    def test_una_falla_del_servidor_no_lanza_y_se_informa_en_el_resultado(self):
        fallas = [smtplib.SMTPAuthenticationError(535, b'credenciales incorrectas'), smtplib.SMTPServerDisconnected('cortado'),
                  ConnectionRefusedError('rechazado'), TimeoutError('agotado'), OSError('red caída'), RuntimeError('inesperado')]
        for falla in fallas:
            with patch.object(EmailMultiAlternatives, 'send', side_effect=falla):
                resultado = enviar_correo(DESTINO, 'Asunto', 'Cuerpo')
            self.assertEqual((resultado.enviado, resultado.codigo, resultado.detalle), (False, 'error_de_envio', type(falla).__name__))

    def test_si_el_servicio_no_acepta_el_mensaje_se_informa(self):
        with patch.object(EmailMultiAlternatives, 'send', return_value=0):
            resultado = enviar_correo(DESTINO, 'Asunto', 'Cuerpo')
        self.assertEqual((resultado.enviado, resultado.codigo), (False, 'error_de_envio'))

    def test_el_registro_de_una_falla_no_contiene_el_correo_completo(self):
        with patch.object(EmailMultiAlternatives, 'send', side_effect=smtplib.SMTPRecipientsRefused({DESTINO: (550, b'no existe')})):
            with self.assertLogs(LOGGER, level='WARNING') as registro:
                enviar_correo(DESTINO, 'Asunto', 'Cuerpo', referencia='order_shipped ORD-1')
        texto = '\n'.join(registro.output)
        self.assertIn('m***@example.com', texto)
        self.assertIn('order_shipped ORD-1', texto)
        self.assertNotIn(DESTINO, texto)
        self.assertNotIn('maria.perez', texto)

    def test_el_registro_de_un_envio_correcto_tampoco_contiene_el_correo_completo(self):
        with self.assertLogs(LOGGER, level='INFO') as registro:
            enviar_correo(DESTINO, 'Asunto', 'Cuerpo')
        texto = '\n'.join(registro.output)
        self.assertIn('m***@example.com', texto)
        self.assertNotIn('maria.perez', texto)

    def test_un_destinatario_invalido_se_registra_sin_el_valor_recibido(self):
        with self.assertLogs(LOGGER, level='WARNING') as registro:
            enviar_correo('dato-privado\nBcc: x@y.cl', 'Asunto', 'Cuerpo')
        self.assertNotIn('dato-privado', '\n'.join(registro.output))

    def test_correo_enmascarado(self):
        casos = {'maria@gmail.com': 'm***@gmail.com', 'a@b.cl': 'a***@b.cl', '  ana@x.cl ': 'a***@x.cl', 'sin-arroba': '***', '': '***', None: '***', 5: '***'}
        for entrada, esperado in casos.items():
            self.assertEqual(correo_enmascarado(entrada), esperado, repr(entrada))


class ConfiguracionDeCorreoTests(SimpleTestCase):
    def test_la_configuracion_por_defecto_es_segura_para_desarrollo(self):
        # En las pruebas Django usa el buzón en memoria; lo que se comprueba es que existan todas las opciones.
        for nombre in ('EMAIL_BACKEND', 'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_HOST_USER', 'EMAIL_HOST_PASSWORD',
                       'EMAIL_USE_TLS', 'EMAIL_USE_SSL', 'EMAIL_TIMEOUT', 'DEFAULT_FROM_EMAIL'):
            self.assertTrue(hasattr(settings, nombre), nombre)
        self.assertGreater(settings.EMAIL_TIMEOUT, 0)
        self.assertFalse(settings.EMAIL_USE_TLS and settings.EMAIL_USE_SSL, 'Django no admite TLS y SSL a la vez')
        self.assertIn('@', settings.DEFAULT_FROM_EMAIL)
