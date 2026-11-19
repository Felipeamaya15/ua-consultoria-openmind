"""Regresiones SCRUM-522. Datos sintéticos; ningún proveedor real recibe mensajes."""
import base64
import json
import os
import smtplib
import uuid
from email import message_from_bytes
from io import BytesIO
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

import requests
from cryptography.fernet import Fernet
from PIL import Image
from django.contrib.auth import get_user_model
from django.core import mail, signing
from django.core.management import call_command
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import Tienda, ConsentimientoComercial, ConexionGmailTienda, EventoConsentimiento
from apps.core.infrastructure.gmail_token_crypto import cifrar_token, descifrar_token
from apps.core.infrastructure.store_mail import send_store_mail
from apps.landing.campaign_delivery import unsubscribe_link, SALT
from apps.landing.models import CampanaPromocional, DestinatarioCampana, EnvioCorreoTienda
from apps.visual_config.models import ConfiguracionVisual
from apps.visual_config.palettes import SYSTEM_PALETTES


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    DEFAULT_FROM_EMAIL='Plataforma <no-reply@example.test>', STORE_MAIL_EXTERNAL_ENABLED=False)
class CampaignDeliveryTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='scrum522-owner', email='owner@example.test')
        self.store = Tienda.objects.create(nombre='Emprendimiento QA', id_usuario_propietario=self.owner)
        self.allowed = self.consent('allowed@example.test')
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.base = '/api/tienda/campanas/'
        self.payload = {'clave': str(uuid.uuid4()), 'nombre': 'Campaña sintética', 'asunto': 'Novedades QA',
            'cuerpo': 'Contenido <script>alert(1)</script>', 'destinatarios': [self.allowed.pk], 'producto_id': ''}

    def consent(self, email, **extra):
        return ConsentimientoComercial.objects.create(tienda=self.store, email=email, estado='autorizado',
            verificado=True, fecha_autorizacion=timezone.now(), fecha_verificacion=timezone.now(),
            version_texto='qa-v1', referencia_evidencia='qa-email', **extra)

    def draft(self, **extra):
        response = self.client.post(self.base, {**self.payload, **extra}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data['data']

    def action(self, row, action, data=None):
        return self.client.post(self.base + row['id'] + '/' + action + '/',
            data if data is not None else {}, format='json')

    def confirm(self, row):
        response = self.action(row, 'enviar', {'confirmar': True, 'revision': row['revision']})
        self.assertEqual(response.status_code, 202, response.data)
        return response.data['data']

    def test_draft_edit_and_preview_never_send(self):
        row = self.draft()
        changed = self.client.put(self.base + row['id'] + '/', {**self.payload,
            'revision': row['revision'], 'cuerpo': 'Nuevo texto'}, format='json')
        self.assertEqual(changed.status_code, 200)
        preview = self.client.get(self.base + row['id'] + '/vista-previa/')
        self.assertIn('Nuevo texto', preview.data['data']['html'])
        self.assertIn(self.store.nombre, preview.data['data']['html'])
        self.assertEqual(len(mail.outbox), 0)

    def test_schema_errors_return_safe_spanish_response(self):
        from django.db import ProgrammingError
        with patch('apps.landing.campaigns.CampanaPromocional.objects.filter', side_effect=ProgrammingError('private SQL trace')):
            response = self.client.get(self.base)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private SQL trace', str(response.data))
        self.assertEqual(response.data['error']['codigo'], 'COMUNICACIONES_NO_DISPONIBLES')

    def test_explicit_confirmation_revision_and_no_arbitrary_recipients(self):
        row = self.draft()
        for data in ({}, {'confirmar': False, 'revision': 1}, {'confirmar': True, 'revision': 1, 'destinatarios': ['other@example.test']}):
            self.assertEqual(self.action(row, 'enviar', data).status_code, 400)
        self.assertEqual(self.action(row, 'enviar', {'confirmar': True, 'revision': 999}).status_code, 409)
        self.assertEqual(len(mail.outbox), 0)

    def test_send_is_individual_idempotent_and_accepted_not_delivered(self):
        row = self.draft(destinatarios=[self.allowed.pk, self.allowed.pk])
        self.confirm(row)
        self.assertEqual(self.action(row, 'enviar', {'confirmar': True, 'revision': row['revision']}).status_code, 200)
        result = self.action(row, 'procesar')
        self.assertEqual(result.data['data']['estado'], 'aceptada', result.data)
        self.assertEqual(result.data['data']['resultados'], {'aceptada': 1})
        self.action(row, 'procesar')
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.allowed.email])
        self.assertEqual(mail.outbox[0].cc, [])
        self.assertIn('Cancelar suscripción', mail.outbox[0].body)
        self.assertIn('List-Unsubscribe', mail.outbox[0].extra_headers)
        self.assertEqual(EnvioCorreoTienda.objects.get().estado, 'aceptada')

    def test_non_verified_pending_and_withdrawn_are_excluded(self):
        pending = ConsentimientoComercial.objects.create(tienda=self.store, email='pending@example.test', estado='pendiente')
        unverified = self.consent('unverified@example.test'); unverified.verificado=False; unverified.save()
        revoked = self.consent('revoked@example.test'); revoked.estado='retirado'; revoked.save()
        row = self.draft(destinatarios=[self.allowed.pk, pending.pk, unverified.pk, revoked.pk])
        self.confirm(row); self.action(row, 'procesar')
        data = self.client.get(self.base + row['id'] + '/').data['data']
        self.assertEqual(data['resultados'], {'aceptada': 1, 'excluido': 3})
        self.assertEqual(len(mail.outbox), 1)

    def test_withdrawal_and_revision_change_after_confirmation_win(self):
        for change in ('withdraw', 'revision'):
            with self.subTest(change=change):
                self.payload['clave'] = str(uuid.uuid4())
                row = self.draft(); self.confirm(row)
                if change == 'withdraw':
                    self.allowed.estado='retirado'
                else:
                    self.allowed.revision += 1
                self.allowed.save()
                self.action(row, 'procesar')
                self.assertEqual(len(mail.outbox), 0)
                self.allowed.estado='autorizado'; self.allowed.verificado=True; self.allowed.save()

    @override_settings(STORE_MAIL_HOURLY_LIMIT=1)
    def test_hourly_limit_preserves_queue_without_consuming_attempt(self):
        other = self.consent('second@example.test')
        row = self.draft(destinatarios=[self.allowed.pk, other.pk]); self.confirm(row)
        self.action(row, 'procesar')
        self.assertEqual(self.action(row, 'procesar').status_code, 429)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(DestinatarioCampana.objects.get(estado='pendiente').intentos, 0)

    @override_settings(STORE_MAIL_DAILY_LIMIT=1)
    def test_daily_limit_is_shared_with_connection_tests(self):
        response = self.client.post('/api/tienda/correo/google/prueba/', {'clave': str(uuid.uuid4())}, format='json')
        self.assertEqual(response.status_code, 200)
        row = self.draft(); self.confirm(row)
        self.assertEqual(self.action(row, 'procesar').status_code, 429)
        self.assertEqual(len(mail.outbox), 1)

    @override_settings(STORE_MAIL_PROVIDER_DAILY_LIMIT=1)
    def test_provider_daily_limit_preserves_pending(self):
        row = self.draft(); self.confirm(row)
        send_store_mail(self.store, uuid.uuid4(), self.owner.email, 'Prueba', 'Texto', category='prueba')
        self.assertEqual(self.action(row, 'procesar').status_code, 429)

    def test_definitive_failure_keeps_content_and_controlled_retry(self):
        row = self.draft(); self.confirm(row)
        with patch('apps.core.infrastructure.store_mail.EmailMultiAlternatives.send', side_effect=smtplib.SMTPRecipientsRefused({})):
            result = self.action(row, 'procesar')
        self.assertEqual(result.data['data']['estado'], 'fallida')
        self.assertEqual(result.data['data']['cuerpo'], self.payload['cuerpo'])
        self.assertEqual(self.action(row, 'reintentar', {'confirmar': True, 'revision': 1}).status_code, 202)
        result = self.action(row, 'procesar')
        self.assertEqual(result.data['data']['estado'], 'aceptada')
        self.assertEqual(result.data['data']['destinatarios'][0]['intentos'], 2)
        history = self.client.get(self.base + row['id'] + '/historial/').data['data']
        self.assertEqual(history['total'], 2)
        self.assertEqual({r['estado'] for r in history['resultados']}, {'aceptada', 'fallida'})

    def test_three_attempts_maximum(self):
        row = self.draft(); self.confirm(row)
        with patch('apps.core.infrastructure.store_mail.EmailMultiAlternatives.send', side_effect=smtplib.SMTPRecipientsRefused({})):
            for index in range(3):
                self.action(row, 'procesar')
                if index < 2:
                    self.assertEqual(self.action(row, 'reintentar', {'confirmar': True, 'revision': 1}).status_code, 202)
        self.assertEqual(self.action(row, 'reintentar', {'confirmar': True, 'revision': 1}).status_code, 400)
        self.assertEqual(EnvioCorreoTienda.objects.count(), 3)

    def test_timeout_is_uncertain_and_never_retried(self):
        row = self.draft(); self.confirm(row)
        with patch('apps.core.infrastructure.store_mail.EmailMultiAlternatives.send', side_effect=TimeoutError):
            result = self.action(row, 'procesar')
        self.assertEqual(result.data['data']['destinatarios'][0]['estado'], 'indeterminada')
        self.assertEqual(self.action(row, 'reintentar', {'confirmar': True, 'revision': 1}).status_code, 400)
        self.action(row, 'procesar')
        self.assertEqual(EnvioCorreoTienda.objects.count(), 1)

    def test_cancellation_keeps_history_and_prevents_pending_send(self):
        row = self.draft(); self.confirm(row)
        self.assertEqual(self.action(row, 'cancelar').data['data']['estado'], 'cancelada')
        self.action(row, 'procesar')
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(DestinatarioCampana.objects.count(), 1)

    def test_confirmed_campaign_cannot_be_edited(self):
        row = self.draft(); self.confirm(row)
        response = self.client.put(self.base + row['id'] + '/', {**self.payload, 'revision': 1, 'cuerpo': 'Otro'}, format='json')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(CampanaPromocional.objects.get().cuerpo, self.payload['cuerpo'])

    def test_preview_sanitizes_content_and_uses_palette_and_inline_logo(self):
        buffer = BytesIO(); Image.new('RGB', (2, 2), 'blue').save(buffer, format='PNG')
        logo = 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode()
        palette = SYSTEM_PALETTES[1]
        ConfiguracionVisual.objects.create(tienda=self.store, plantilla_seleccionada='minimal', logo_negocio=logo,
            personalizacion={'editor': {'minimal': {'paleta_id': palette['id']}}})
        row = self.draft(diseno={'boton_texto': '<Comprar>', 'boton_url': '/plantilla/2/catalogo'})
        html = self.client.get(self.base + row['id'] + '/vista-previa/').data['data']['html']
        self.assertIn('&lt;script&gt;', html); self.assertNotIn('<script>', html)
        self.assertIn('&lt;Comprar&gt;', html); self.assertIn(palette['colores']['primary'], html)
        self.assertIn(logo, html)
        self.confirm(row); self.action(row, 'procesar')
        email = mail.outbox[0]
        self.assertIn('src="cid:image-', email.alternatives[0][0])
        self.assertEqual(len(email.attachments), 1)

    def test_invalid_images_links_and_header_injection_are_rejected(self):
        for extra in ({'asunto': 'Hola\r\nBcc: evil@example.test'},
                {'diseno': {'imagen': 'javascript:alert(1)'}},
                {'diseno': {'boton_url': 'https://outside.example/catalogo'}},
                {'diseno': {'boton_url': '/plantilla/1/catalogo?next=https://outside.example'}},
                {'diseno': {'boton_url': '/plantilla/1/no-existe'}},
                {'diseno': {'_marca': {'nombre': 'Suplantada'}}}):
            with self.subTest(extra=extra):
                self.assertEqual(self.client.post(self.base, {**self.payload, **extra}, format='json').status_code, 400)

    def test_preview_respects_custom_primary_color(self):
        ConfiguracionVisual.objects.create(tienda=self.store, plantilla_seleccionada='catalog',
            personalizacion={'editor': {'catalog': {'visualConfig': {'global': {'colors': {'primary': '#135724'}}}}}})
        row = self.draft()
        html = self.client.get(self.base + row['id'] + '/vista-previa/').data['data']['html']
        self.assertIn('#135724', html)
        self.assertIn('/plantilla/4/catalogo', html)

    def test_owner_test_uses_only_owner_email_and_reuses_key(self):
        row = self.draft(); key = str(uuid.uuid4())
        for _ in range(2):
            self.assertEqual(self.action(row, 'prueba', {'clave': key}).status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.owner.email])
        self.assertEqual(self.action(row, 'prueba', {'clave': key, 'destinatario': self.allowed.email}).status_code, 400)

    def test_idempotency_key_cannot_identify_another_payload(self):
        key = uuid.uuid4()
        send_store_mail(self.store, key, self.owner.email, 'Prueba', 'Texto', category='prueba')
        with self.assertRaises(ValueError):
            send_store_mail(self.store, key, self.allowed.email, 'Prueba', 'Texto', category='prueba')
        self.assertEqual(len(mail.outbox), 1)

    def link(self, row):
        campaign = CampanaPromocional.objects.get(pk=row['id'])
        recipient = campaign.destinatarios.get()
        return unsubscribe_link(campaign, recipient)

    def test_unsubscribe_get_requires_confirmation_post_withdraws_and_audits_once(self):
        row = self.draft(); link = self.link(row)
        public = APIClient(); path = urlsplit(link).path + '?' + urlsplit(link).query
        self.assertEqual(public.get(path).status_code, 200)
        self.allowed.refresh_from_db(); self.assertEqual(self.allowed.estado, 'autorizado')
        token = parse_qs(urlsplit(link).query)['token'][0]
        for _ in range(2):
            self.assertEqual(public.post(urlsplit(link).path, {'token': token}).status_code, 200)
        self.allowed.refresh_from_db(); self.assertEqual(self.allowed.estado, 'retirado')
        self.assertFalse(self.allowed.verificado)
        self.assertEqual(EventoConsentimiento.objects.filter(tipo='retirado').count(), 1)
        self.assertEqual(self.client.get(self.base + 'destinatarios/').data['data']['total'], 0)

    def test_tampered_foreign_and_old_revision_unsubscribe_links_fail(self):
        row = self.draft(); token = parse_qs(urlsplit(self.link(row)).query)['token'][0]
        public = APIClient(); path = self.base + 'baja/'
        self.assertEqual(public.post(path, {'token': token + 'bad'}).status_code, 400)
        value = signing.loads(token, salt=SALT); value['tienda'] = self.store.pk + 99
        self.assertEqual(public.post(path, {'token': signing.dumps(value, salt=SALT)}).status_code, 400)
        self.allowed.revision += 1; self.allowed.save()
        self.assertEqual(public.post(path, {'token': token}).status_code, 400)
        self.allowed.refresh_from_db(); self.assertEqual(self.allowed.estado, 'autorizado')

    def test_permissions_and_tenant_identifiers_cannot_select_another_store(self):
        row = self.draft()
        other = get_user_model().objects.create_user(username='scrum522-buyer')
        self.client.force_authenticate(other)
        for endpoint in ('vista-previa', 'historial'):
            self.assertEqual(self.client.get(self.base + row['id'] + '/' + endpoint + '/').status_code, 403)
        for endpoint in ('enviar', 'prueba', 'procesar', 'reintentar', 'cancelar'):
            self.assertEqual(self.action(row, endpoint).status_code, 403)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(self.base, HTTP_X_TIENDA_ID='999999').status_code, 400)

    def test_worker_processes_only_confirmed_campaigns(self):
        row = self.draft(); output = BytesIO()
        from io import StringIO
        call_command('procesar_campanas', tienda=self.store.pk, limite=1, stdout=StringIO())
        self.assertEqual(len(mail.outbox), 0)
        self.confirm(row)
        call_command('procesar_campanas', tienda=self.store.pk, limite=1, stdout=StringIO())
        self.assertEqual(len(mail.outbox), 1)


@override_settings(EMAIL_BACKEND='django.core.mail.backends.smtp.EmailBackend', EMAIL_HOST='smtp.external.test',
    EMAIL_PORT=587, STORE_MAIL_TRANSPORT='auto', STORE_MAIL_EXTERNAL_ENABLED=False, GOOGLE_OAUTH_CLIENT_ID='synthetic-client',
    GOOGLE_OAUTH_CLIENT_SECRET='synthetic-secret', GOOGLE_OAUTH_REDIRECT_URI='http://testserver/api/tienda/correo/google/callback/')
class GmailConnectionTests(TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY': Fernet.generate_key().decode()})
        self.env.start(); self.addCleanup(self.env.stop)
        self.owner = get_user_model().objects.create_user(username='gmail-qa', email='owner@example.test')
        self.store = Tienda.objects.create(nombre='Tienda Gmail QA', id_usuario_propietario=self.owner,
            correo_negocio='authorized@example.test')
        self.client = APIClient(); self.client.force_authenticate(self.owner)
        self.base = '/api/tienda/correo/google/'

    def connection(self):
        return ConexionGmailTienda.objects.create(tienda=self.store, correo_autorizado='authorized@example.test',
            refresh_token_cifrado=cifrar_token('synthetic-refresh'),
            autorizacion_correo='authorized@example.test', autorizacion_fecha=timezone.now(),
            autorizacion_version='uso-correo-negocio-v1', autorizacion_usuario=self.owner)

    def test_status_exposes_no_secret_and_external_sending_is_disabled(self):
        self.connection()
        response = self.client.get(self.base + 'estado/')
        self.assertTrue(response.data['data']['conectado'])
        self.assertFalse(response.data['data']['envio_habilitado'])
        self.assertNotIn('synthetic-refresh', str(response.data)); self.assertNotIn('refresh_token', str(response.data))
        self.assertEqual(response['Cache-Control'], 'no-store')
        with patch('apps.core.infrastructure.store_mail.requests.post') as network:
            self.assertEqual(self.client.post(self.base + 'prueba/', {'clave': str(uuid.uuid4())}, format='json').status_code, 409)
            network.assert_not_called()

    def test_callback_encrypts_identity_and_consumes_state_once(self):
        started = self.client.post(self.base + 'iniciar/', {'autorizar': True,
            'correo_negocio': self.store.correo_negocio, 'version_texto': 'uso-correo-negocio-v1'}, format='json')
        state = parse_qs(urlsplit(started.data['data']['url_autorizacion']).query)['state'][0]
        with patch('apps.core.presentation.gmail_oauth_views.intercambiar_codigo', return_value={
                'correo': 'authorized@example.test', 'refresh_token': 'synthetic-refresh'}) as exchange:
            for _ in range(2):
                self.assertEqual(APIClient().get(self.base + 'callback/', {'state': state, 'code': 'qa-code'}).status_code, 302)
            self.assertEqual(exchange.call_count, 1)
        connection = ConexionGmailTienda.objects.get()
        self.assertNotEqual(connection.refresh_token_cifrado, 'synthetic-refresh')
        self.assertEqual(descifrar_token(connection.refresh_token_cifrado), 'synthetic-refresh')
        self.assertEqual(connection.correo_autorizado, 'authorized@example.test')

    def test_invalid_or_expired_state_cannot_connect(self):
        from datetime import timedelta
        from apps.core.presentation.gmail_oauth_views import _hash_estado
        state = 'a' * 50
        ConexionGmailTienda.objects.create(tienda=self.store, estado_oauth_hash=_hash_estado(state),
            estado_oauth_expira=timezone.now()-timedelta(seconds=1))
        with patch('apps.core.presentation.gmail_oauth_views.intercambiar_codigo') as exchange:
            APIClient().get(self.base + 'callback/', {'state': state, 'code': 'qa'})
            APIClient().get(self.base + 'callback/', {'state': 'invalid', 'code': 'qa'})
            exchange.assert_not_called()

    def test_disconnect_removes_tokens_even_when_revocation_fails(self):
        connection = self.connection()
        with patch('apps.core.presentation.gmail_oauth_views.requests.post', side_effect=requests.ConnectionError):
            response = self.client.post(self.base + 'desconectar/', {}, format='json')
        self.assertEqual(response.status_code, 200)
        connection.refresh_from_db()
        self.assertEqual(connection.refresh_token_cifrado, '')
        self.assertEqual(connection.correo_autorizado, '')

    def test_only_owner_can_manage_connection(self):
        other = get_user_model().objects.create_user(username='gmail-other')
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(self.base + 'estado/').status_code, 403)
        for endpoint in ('iniciar', 'desconectar', 'prueba'):
            self.assertEqual(self.client.post(self.base + endpoint + '/', {}, format='json').status_code, 403)


@override_settings(STORE_MAIL_EXTERNAL_ENABLED=True)
class GmailHTTPSimulationTests(GmailConnectionTests):
    """Requests y MIME reales contra servidor HTTP aislado; nunca se llama a Google."""
    def test_status_exposes_no_secret_and_external_sending_is_disabled(self):
        with override_settings(STORE_MAIL_EXTERNAL_ENABLED=False):
            super().test_status_exposes_no_secret_and_external_sending_is_disabled()

    def simulate(self, refresh_status=200, send_status=200):
        captured = []
        class Handler(BaseHTTPRequestHandler):
            def do_POST(handler):
                body = handler.rfile.read(int(handler.headers['Content-Length']))
                captured.append((handler.path, body))
                status = refresh_status if handler.path == '/token' else send_status
                data = {'access_token': 'synthetic-access'} if handler.path == '/token' else {'id': 'synthetic-provider-id'}
                handler.send_response(status); handler.send_header('Content-Type', 'application/json'); handler.end_headers()
                handler.wfile.write(json.dumps(data).encode())
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = Thread(target=server.serve_forever, daemon=True); thread.start()
        self.addCleanup(server.server_close); self.addCleanup(server.shutdown)
        real_post = requests.post
        def routed(url, **options):
            endpoint = '/token' if url.endswith('/token') else '/send'
            return real_post(f'http://127.0.0.1:{server.server_port}' + endpoint, **options)
        proxy = patch('apps.core.infrastructure.store_mail.requests.post', side_effect=routed)
        proxy.start(); self.addCleanup(proxy.stop)
        return captured

    def test_refresh_and_send_use_authorized_from_and_one_recipient(self):
        self.connection(); captured = self.simulate()
        result = send_store_mail(self.store, uuid.uuid4(), 'recipient@example.test', 'Asunto', 'Texto seguro', category='consulta')
        self.assertEqual(result.estado, 'aceptada')
        self.assertEqual([entry[0] for entry in captured], ['/token', '/send'])
        mime = message_from_bytes(base64.urlsafe_b64decode(json.loads(captured[1][1])['raw']))
        self.assertIn('authorized@example.test', mime['From'])
        self.assertEqual(mime['To'], 'recipient@example.test'); self.assertIsNone(mime['Cc'])
        self.assertIsNone(mime['Bcc'])

    def test_revoked_refresh_never_submits_message(self):
        self.connection(); captured = self.simulate(refresh_status=400)
        result = send_store_mail(self.store, uuid.uuid4(), 'recipient@example.test', 'Asunto', 'Texto', category='consulta')
        self.assertEqual((result.estado, result.codigo), ('fallida', 'reconectar'))
        self.assertEqual(len(captured), 1)
        self.assertEqual(self.client.get(self.base + 'estado/').data['data']['estado'], 'reconectar')

    def test_gmail_429_is_definitive_and_5xx_is_uncertain(self):
        self.connection(); captured = self.simulate(send_status=429)
        result = send_store_mail(self.store, uuid.uuid4(), 'recipient@example.test', 'Asunto', 'Texto', category='consulta')
        self.assertEqual((result.estado, result.codigo), ('fallida', 'limite_proveedor'))

    def test_gmail_5xx_never_blindly_retries(self):
        self.connection(); captured = self.simulate(send_status=503); key = uuid.uuid4()
        for _ in range(2):
            result = send_store_mail(self.store, key, 'recipient@example.test', 'Asunto', 'Texto', category='consulta')
            self.assertEqual(result.estado, 'indeterminada')
        self.assertEqual(len(captured), 2)


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class CampaignConcurrencyTests(TransactionTestCase):
    @override_settings(STORE_MAIL_PROVIDER_DAILY_LIMIT=1)
    def test_provider_quota_is_serialized_across_two_stores(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        from django.db import close_old_connections
        from rest_framework.exceptions import Throttled
        stores = [Tienda.objects.create(nombre=f'Cuota QA {index}',
            id_usuario_propietario=get_user_model().objects.create_user(username=f'quota-owner-{index}')) for index in range(2)]
        barrier = Barrier(2)
        def send(store):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                try:
                    return send_store_mail(store, uuid.uuid4(), 'synthetic@example.test', 'Cuota', 'Prueba', category='prueba').estado
                except Throttled:
                    return 'limitada'
            finally:
                close_old_connections()
        with patch('apps.core.infrastructure.store_mail.EmailMultiAlternatives.send', return_value=1) as sender:
            with ThreadPoolExecutor(max_workers=2) as pool:
                self.assertEqual(sorted(pool.map(send, stores)), ['aceptada', 'limitada'])
            self.assertEqual(sender.call_count, 1)

    def test_two_process_requests_submit_one_message(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        from django.db import close_old_connections
        owner = get_user_model().objects.create_user(username='campaign-race')
        store = Tienda.objects.create(nombre='Concurrencia QA', id_usuario_propietario=owner)
        consent = ConsentimientoComercial.objects.create(tienda=store, email='concurrency@example.test',
            estado='autorizado', verificado=True, fecha_autorizacion=timezone.now(), fecha_verificacion=timezone.now(),
            version_texto='qa', referencia_evidencia='qa')
        row = CampanaPromocional.objects.create(tienda=store, autor=owner, clave=uuid.uuid4(),
            nombre='Concurrencia', asunto='Prueba', cuerpo='Texto', estado='pendiente')
        DestinatarioCampana.objects.create(campana=row, consentimiento=consent, email=consent.email,
            revision_consentimiento=consent.revision, estado='pendiente')
        barrier = Barrier(2)
        def process(_):
            close_old_connections()
            try:
                client = APIClient(); client.force_authenticate(owner); barrier.wait(timeout=10)
                return client.post(f'/api/tienda/campanas/{row.pk}/procesar/', {}, format='json').status_code
            finally:
                close_old_connections()
        with patch('apps.core.infrastructure.store_mail.EmailMultiAlternatives.send', return_value=1) as sender:
            with ThreadPoolExecutor(max_workers=2) as pool:
                self.assertEqual(list(pool.map(process, [0, 1])), [200, 200])
            self.assertEqual(sender.call_count, 1)
        self.assertEqual(EnvioCorreoTienda.objects.count(), 1)
        self.assertEqual(DestinatarioCampana.objects.get().estado, 'aceptada')


class CampaignMigrationTests(TransactionTestCase):
    def test_existing_draft_and_audience_survive_new_migrations(self):
        from django.db import connection
        from django.db.migrations.executor import MigrationExecutor
        owner = get_user_model().objects.create_user(username='legacy-campaign-qa')
        store = Tienda.objects.create(nombre='Histórica QA', id_usuario_propietario=owner)
        consent = ConsentimientoComercial.objects.create(tienda=store, email='legacy@example.test', estado='pendiente')
        executor = MigrationExecutor(connection)
        leaves = executor.loader.graph.leaf_nodes()
        try:
            executor.migrate([('landing', '0010_recurso_video')])
            old_apps = executor.loader.project_state([('landing', '0010_recurso_video')]).apps
            old = old_apps.get_model('landing', 'CampanaPromocional').objects.create(tienda_id=store.pk,
                autor_id=owner.pk, clave=uuid.uuid4(), nombre='Borrador histórico', asunto='Asunto conservado',
                cuerpo='Contenido conservado', producto={'nombre': 'Producto histórico'})
            old_apps.get_model('landing', 'DestinatarioCampana').objects.create(campana_id=old.pk,
                consentimiento_id=consent.pk, revision_consentimiento=0, email=consent.email)
            MigrationExecutor(connection).migrate(leaves)
            current = CampanaPromocional.objects.get(pk=old.pk)
            self.assertEqual(current.cuerpo, 'Contenido conservado')
            self.assertEqual(current.producto['nombre'], 'Producto histórico')
            self.assertEqual(current.diseno, {})
            self.assertEqual(current.estado, 'borrador')
            self.assertEqual(current.destinatarios.get().email, consent.email)
        finally:
            MigrationExecutor(connection).migrate(leaves)


@override_settings(EMAIL_BACKEND='django.core.mail.backends.smtp.EmailBackend', EMAIL_HOST='mailpit',
    EMAIL_PORT=1025, EMAIL_HOST_USER='', EMAIL_HOST_PASSWORD='', EMAIL_USE_TLS=False, EMAIL_USE_SSL=False,
    DEFAULT_FROM_EMAIL='QA OpenMind <qa@openmind.test>', STORE_MAIL_EXTERNAL_ENABLED=False)
class MailpitCaptureTests(TestCase):
    def test_real_smtp_campaign_and_reply_are_captured_without_duplicates(self):
        """SMTP + API Django + PostgreSQL + API HTTP Mailpit. No se borra el buzón."""
        from apps.landing.models import SolicitudActividad
        marker = 'SCRUM522-' + uuid.uuid4().hex
        owner = get_user_model().objects.create_user(username='mailpit-qa', email='owner@example.test')
        store = Tienda.objects.create(nombre='Captura QA', id_usuario_propietario=owner)
        consent = ConsentimientoComercial.objects.create(tienda=store, email='synthetic@example.test',
            estado='autorizado', verificado=True, fecha_autorizacion=timezone.now(), fecha_verificacion=timezone.now(),
            version_texto='qa', referencia_evidencia='qa')
        client = APIClient(); client.force_authenticate(owner)
        response = client.post('/api/tienda/campanas/', {'clave': str(uuid.uuid4()), 'nombre': marker,
            'asunto': marker + '-campana', 'cuerpo': 'Contenido seguro <script>no ejecutar</script>',
            'destinatarios': [consent.pk]}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        row = response.data['data']; url = '/api/tienda/campanas/' + row['id'] + '/'
        self.assertEqual(client.post(url + 'enviar/', {'confirmar': True, 'revision': 1}, format='json').status_code, 202)
        for _ in range(2):
            self.assertEqual(client.post(url + 'procesar/', {}, format='json').status_code, 200)
        request = SolicitudActividad.objects.create(tienda=store, seccion_id=uuid.uuid4(), titulo_actividad='Taller QA',
            tipo_actividad='taller', tipo='consulta', nombre='Cliente sintético', email='synthetic@example.test',
            estado='nueva', solicitud_id=uuid.uuid4(), huella=uuid.uuid4().hex,
            consentimiento_version='qa-operacional', consentimiento_fecha=timezone.now())
        url = f'/api/landing/solicitudes-actividades/{request.pk}/respuestas/'
        reply = client.post(url, {'clave': str(uuid.uuid4()), 'asunto': marker + '-respuesta',
            'cuerpo': 'Respuesta operacional de prueba'}, format='json').data['data']
        for _ in range(2):
            self.assertEqual(client.post(url + reply['id'] + '/enviar/', {}, format='json').data['data']['estado'], 'aceptada')
        captured = requests.get('http://mailpit:8025/api/v1/search', params={'query': 'subject:' + marker}, timeout=5).json()
        self.assertEqual(captured['messages_count'], 2, {k: captured.get(k) for k in ['count', 'messages_count', 'total']})
        for message in captured['messages']:
            detail = requests.get('http://mailpit:8025/api/v1/message/' + message['ID'], timeout=5).json()
            self.assertEqual(len(detail['To']), 1)
            self.assertNotIn('<script>', detail['HTML'])
        request.refresh_from_db(); self.assertEqual(request.estado, 'respondida')
