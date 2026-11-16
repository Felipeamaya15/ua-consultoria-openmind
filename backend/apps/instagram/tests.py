"""Real HTTP stand-in + PostgreSQL; no Meta credentials or requests leave this test server."""
import json
import tempfile
import uuid
from datetime import timedelta
from io import BytesIO, StringIO
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from urllib.parse import parse_qs, urlsplit
from cryptography.fernet import Fernet
from PIL import Image
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from django.core.files.uploadedfile import SimpleUploadedFile
from apps.core.models import Tienda
from .models import ConexionInstagram, EstadoInstagramOAuth, PublicacionInstagram
from . import provider, publishing


class MetaStandIn:
    def __init__(self):
        self.calls, self.mode, self.published = [], 'normal', False
        outer = self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_): pass
            def handle_request(self):
                path = urlsplit(self.path).path
                query = parse_qs(urlsplit(self.path).query)
                data = parse_qs(self.rfile.read(int(self.headers.get('Content-Length', 0))).decode())
                outer.calls.append((self.command, path, data, query, self.headers.get('Authorization')))
                body, status = {}, 200
                if path.endswith('/oauth/access_token'):
                    body = {'access_token': 'qa-long-token', 'expires_in': 5184000}
                elif path.endswith('/debug_token'):
                    body = {'data': {'app_id': '100000000000001', 'type': 'SYSTEM_USER', 'is_valid': True,
                        'user_id': '100000000000004', 'scopes': list(provider.SCOPES),
                        'expires_at': int((timezone.now()+timedelta(days=60)).timestamp()), 'data_access_expires_at': 0}}
                    if outer.mode == 'scope': body['data']['scopes'] = list(provider.SCOPES[:1])
                    if outer.mode == 'excessive': body['data']['scopes'] += ['instagram_manage_messages', 'ads_read']
                    if outer.mode == 'wrong_app': body['data']['app_id'] = '999'
                    if outer.mode == 'wrong_type': body['data']['type'] = 'USER'
                    if outer.mode == 'no_expiry': body['data']['expires_at'] = 0
                elif path.endswith('/me'):
                    body = {'id': '100000000000004', 'client_business_id': '100000000000003'}
                elif path.endswith('/assigned_instagram_accounts'):
                    body = {'data': [{'id': '17840000000000001', 'username': 'openmind_qa'}]}
                    if outer.mode == 'multiple': body['data'] += [{'id': '17840000000000002', 'username': 'other_qa'}]
                elif path.endswith('/17840000000000001'):
                    body = {'id': '17840000000000001', 'username': 'openmind_qa'}
                elif path.endswith('/media_publish'):
                    outer.published = True
                    body = {'id': '19000000000000001'}
                    if outer.mode == 'publish500': status, body = 500, {'error': {'code': 2}}
                elif path.endswith('/media'):
                    body = {'id': '18000000000000001'}
                    if outer.mode == 'create500': status, body = 500, {'error': {'code': 2}}
                    if outer.mode == 'token': status, body = 400, {'error': {'code': 190}}
                    if outer.mode == 'disconnect': self.connection.close(); return
                elif path.endswith('/18000000000000001'):
                    body = {'status_code': 'PUBLISHED' if outer.published else 'IN_PROGRESS' if outer.mode == 'pending' else 'FINISHED'}
                else:
                    status, body = 501, {'error': {'code': 100}}
                self.send_response(status); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(json.dumps(body).encode())
            do_GET = do_POST = do_DELETE = handle_request
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = Thread(target=self.server.serve_forever, daemon=True); self.thread.start()
    def close(self): self.server.shutdown(); self.server.server_close(); self.thread.join()


class InstagramFixture:
    def setUp(self):
        super().setUp()
        self.temp = tempfile.TemporaryDirectory(dir=settings.MEDIA_ROOT.parent)
        self.mock = MetaStandIn(); self.addCleanup(self.mock.close); self.addCleanup(self.temp.cleanup)
        self.override = override_settings(DEBUG=True, MEDIA_ROOT=self.temp.name, INSTAGRAM_TEST_HTTP_ORIGIN=f'http://127.0.0.1:{self.mock.server.server_port}',
            INSTAGRAM_APP_ID='100000000000001', INSTAGRAM_APP_SECRET='qa-secret', INSTAGRAM_CONFIG_ID='100000000000002', INSTAGRAM_TOKEN_ENCRYPTION_KEY=Fernet.generate_key().decode(),
            INSTAGRAM_REDIRECT_URI='https://localhost:8444/api/instagram/oauth/callback/', INSTAGRAM_FRONTEND_ORIGIN='https://localhost:8444',
            INSTAGRAM_MEDIA_PUBLIC_ORIGIN='https://qa-media.example.test', INSTAGRAM_PUBLISHING_ENABLED=True)
        self.override.enable(); self.addCleanup(self.override.disable)
        self.owner = get_user_model().objects.create_user(username='instagram-owner', email='owner@example.test')
        self.store = Tienda.objects.create(nombre='Instagram QA', id_usuario_propietario=self.owner)
        self.api = APIClient(); self.api.force_authenticate(self.owner)
        self.base = '/api/instagram/'
    def connect(self):
        response = self.api.post(self.base+'oauth/iniciar/', {'autorizar': True}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.oauth = response.data['data']['url_autorizacion']
        self.state = parse_qs(urlsplit(self.oauth).query)['state'][0]
        self.api.get(response.data['data']['url_inicio'], secure=True)
        self.api.get(self.base+'oauth/callback/', {'state': self.state, 'code': 'synthetic-code'}, secure=True)
        return ConexionInstagram.objects.get(tienda=self.store)
    def image(self, size=(1080, 1080), kind='JPEG'):
        stream = BytesIO(); Image.new('RGB', size, '#23645a').save(stream, kind)
        return SimpleUploadedFile('publication.jpg', stream.getvalue(), content_type='image/jpeg')
    def prepare(self, caption='Publicación sintética', key=None, image=None):
        response = self.api.post(self.base+'publicaciones/', {'clave': key or str(uuid.uuid4()), 'descripcion': caption, 'imagen': image or self.image()}, format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data['data']
    def confirm(self, row):
        return self.api.post(self.base+'publicaciones/'+row['id']+'/confirmar/', {'confirmar': True}, format='json')
    def writes(self, suffix): return [call for call in self.mock.calls if call[0] == 'POST' and call[1].endswith(suffix)]


class InstagramTests(InstagramFixture, TestCase):
    def test_oauth_exact_scopes_cookie_and_encrypted_token(self):
        connection = self.connect(); query = parse_qs(urlsplit(self.oauth).query)
        self.assertNotIn('scope', query)
        self.assertEqual(query['config_id'], ['100000000000002'])
        self.assertEqual(query['override_default_response_type'], ['true'])
        self.assertEqual(provider.decrypt(connection.token_cifrado), 'qa-long-token')
        self.assertNotIn('qa-long-token', connection.token_cifrado)
        self.assertTrue(EstadoInstagramOAuth.objects.get().consumido_en)
        state = self.api.get(self.base+'estado/').json()['data']
        self.assertEqual(state['usuario'], 'openmind_qa'); self.assertTrue(state['conectado'])
        self.assertNotIn('qa-long-token', json.dumps(state))
        self.assertGreater(connection.vence_en, timezone.now()+timedelta(days=59))
        self.assertEqual(connection.client_business_id, '100000000000003')
        self.assertEqual(connection.system_user_id, '100000000000004')
        self.assertEqual(connection.config_id, '100000000000002')
        self.assertTrue(all('graph.facebook.com' in call[1] for call in self.mock.calls))

    def test_rejects_excessive_scopes_wrong_app_wrong_token_type_and_multiple_accounts(self):
        for mode in ('excessive', 'wrong_app', 'wrong_type', 'multiple'):
            self.mock.mode = mode
            self.assertFalse(self.connect().token_cifrado, mode)

    def test_suat_without_scheduled_expiry_can_publish(self):
        self.mock.mode = 'no_expiry'; connection = self.connect()
        self.assertIsNone(connection.vence_en)
        self.assertTrue(self.api.get(self.base+'estado/').data['data']['sin_vencimiento_programado'])
        self.assertEqual(self.confirm(self.prepare()).data['data']['estado'], 'publicada')

    def test_state_replay_and_wrong_browser_do_not_exchange(self):
        self.connect(); before = len(self.mock.calls)
        self.api.get(self.base+'oauth/callback/', {'state': self.state, 'code': 'replay'})
        self.assertEqual(len(self.mock.calls), before)
        response = self.api.post(self.base+'oauth/iniciar/', {'autorizar': True}, format='json')
        state = parse_qs(urlsplit(response.data['data']['url_autorizacion']).query)['state'][0]
        APIClient().get(self.base+'oauth/callback/', {'state': state, 'code': 'wrong-browser'})
        self.assertEqual(len(self.mock.calls), before)

    def test_expired_state_and_missing_permissions_do_not_connect(self):
        self.mock.mode = 'scope'; connection = self.connect(); self.assertEqual(connection.token_cifrado, '')
        response = self.api.post(self.base+'oauth/iniciar/', {'autorizar': True}, format='json')
        state = parse_qs(urlsplit(response.data['data']['url_autorizacion']).query)['state'][0]
        EstadoInstagramOAuth.objects.update(vence_en=timezone.now()-timedelta(seconds=1))
        before = len(self.mock.calls); self.api.get(self.base+'oauth/callback/', {'state': state, 'code': 'expired'})
        self.assertEqual(len(self.mock.calls), before)

    def test_owner_permission_consent_and_tenant_spoofing(self):
        self.assertEqual(APIClient().get(self.base+'estado/').status_code, 401)
        self.assertEqual(self.api.post(self.base+'oauth/iniciar/', {'autorizar': False}, format='json').status_code, 400)
        self.assertEqual(self.api.get(self.base+'estado/', HTTP_X_TIENDA_ID='999').status_code, 400)
        other = get_user_model().objects.create_user(username='stranger'); self.api.force_authenticate(other)
        self.assertEqual(self.api.get(self.base+'estado/').status_code, 403)

    def test_disconnect_clears_tokens_and_preserves_social_links(self):
        self.connect()
        from apps.landing.models import ConfiguracionLanding
        config = ConfiguracionLanding.objects.create(tienda=self.store, contenido={'contacto': {'instagram': 'https://instagram.com/qa'}})
        self.assertEqual(self.api.post(self.base+'desconectar/', {}, format='json').status_code, 200)
        connection = ConexionInstagram.objects.get(); self.assertEqual(connection.token_cifrado, '')
        self.assertFalse(EstadoInstagramOAuth.objects.exists()); config.refresh_from_db(); self.assertIn('instagram', config.contenido['contacto'])

    def test_renewal_requires_new_explicit_unified_login_without_legacy_refresh(self):
        self.connect(); before=len(self.mock.calls)
        self.assertEqual(self.api.post(self.base+'renovar/', {}, format='json').status_code, 400)
        ConexionInstagram.objects.update(vence_en=timezone.now()-timedelta(seconds=1))
        response=self.api.post(self.base+'renovar/', {'autorizar': True}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self.mock.calls), before)
        state=parse_qs(urlsplit(response.data['data']['url_autorizacion']).query)['state'][0]
        self.api.get(response.data['data']['url_inicio'], secure=True)
        self.api.get(self.base+'oauth/callback/', {'state': state, 'code': 'renewed'}, secure=True)
        self.assertTrue(self.api.get(self.base+'estado/').data['data']['conectado'])
        self.assertFalse(any('refresh_access_token' in call[1] or 'system_user_access_tokens' in call[1] for call in self.mock.calls))

    def test_public_callback_bootstrap_is_single_use_and_sets_secure_browser_cookie(self):
        response=self.api.post(self.base+'oauth/iniciar/', {'autorizar': True}, format='json')
        self.assertNotIn('openmind_instagram_oauth', response.cookies)
        url=response.data['data']['url_inicio']; opened=self.api.get(url, secure=True)
        self.assertEqual(opened.status_code, 302)
        cookie=opened.cookies['openmind_instagram_oauth']
        self.assertTrue(cookie['secure']); self.assertTrue(cookie['httponly']); self.assertEqual(cookie['samesite'], 'Lax')
        self.assertEqual(cookie['path'], '/api/instagram/oauth/callback/')
        self.assertEqual(self.api.get(url, secure=True).status_code, 400)
        self.assertFalse(EstadoInstagramOAuth.objects.get().estado_cifrado)

    def test_only_square_jpeg_and_caption_limit_are_accepted(self):
        self.connect()
        for image in (self.image((1080, 1920)), self.image(kind='PNG')):
            self.assertEqual(self.api.post(self.base+'publicaciones/', {'clave': str(uuid.uuid4()), 'descripcion': 'QA', 'imagen': image}, format='multipart').status_code, 400)
        self.assertEqual(self.api.post(self.base+'publicaciones/', {'clave': str(uuid.uuid4()), 'descripcion': 'a'*2201, 'imagen': self.image()}, format='multipart').status_code, 400)

    def test_preparation_and_disabled_gate_never_call_media(self):
        self.connect(); row = self.prepare(); self.assertFalse(self.writes('/media'))
        with override_settings(INSTAGRAM_PUBLISHING_ENABLED=False):
            self.assertEqual(self.confirm(row).status_code, 400)
        self.assertFalse(self.writes('/media')); self.assertFalse(self.writes('/media_publish'))

    def test_identical_content_and_key_are_deduplicated(self):
        self.connect(); key = str(uuid.uuid4()); row = self.prepare(key=key)
        self.assertEqual(self.prepare(key=key)['id'], row['id'])
        self.assertEqual(self.prepare()['id'], row['id'])
        self.assertEqual(PublicacionInstagram.objects.count(), 1)
        self.assertEqual(self.api.post(self.base+'publicaciones/', {'clave': key, 'descripcion': 'Otro contenido', 'imagen': self.image()}, format='multipart').status_code, 400)

    def test_success_publishes_once_and_preserves_history(self):
        self.connect(); row = self.prepare(); result = self.confirm(row)
        self.assertEqual(result.data['data']['estado'], 'publicada')
        self.confirm(row); self.api.post(self.base+'publicaciones/'+row['id']+'/actualizar/', {}, format='json')
        self.assertEqual(len(self.writes('/media')), 1); self.assertEqual(len(self.writes('/media_publish')), 1)
        self.assertEqual(self.api.get(self.base+'publicaciones/').data['data']['resultados'][0]['media_id'], '19000000000000001')

    def test_pending_container_requires_finished_before_publish(self):
        self.connect(); self.mock.mode = 'pending'; row = self.prepare(); result = self.confirm(row)
        self.assertEqual(result.data['data']['estado'], 'procesando'); self.assertFalse(self.writes('/media_publish'))
        self.mock.mode = 'normal'; self.api.post(self.base+'publicaciones/'+row['id']+'/actualizar/', {}, format='json')
        self.assertEqual(len(self.writes('/media_publish')), 1)

    def test_unknown_create_and_publish_results_never_resend(self):
        self.connect()
        for mode in ('create500', 'publish500', 'disconnect'):
            self.mock.mode, self.mock.published = mode, False
            row = self.prepare(caption=mode); result = self.confirm(row)
            self.assertEqual(result.data['data']['estado'], 'indeterminada')
            before = len(self.mock.calls); self.confirm(row); self.assertEqual(len(self.mock.calls), before)
            self.mock.mode = 'normal'; self.api.post(self.base+'publicaciones/'+row['id']+'/actualizar/', {}, format='json')
            if mode == 'publish500':
                self.assertEqual(PublicacionInstagram.objects.get(pk=row['id']).estado, 'publicada')

    def test_temporary_asset_is_scoped_expiring_and_not_a_library_url(self):
        self.connect(); self.mock.mode='pending'; row = self.prepare(); model=PublicacionInstagram.objects.get(pk=row['id'])
        url = publishing.image_url(model); relative=urlsplit(url).path+'?'+urlsplit(url).query
        self.assertEqual(APIClient().get(relative).status_code, 404)
        self.confirm(row)
        response=APIClient().get(relative); self.assertEqual(response.status_code, 200); self.assertEqual(response['Content-Type'], 'image/jpeg')
        self.assertEqual(Image.open(BytesIO(b''.join(response.streaming_content))).size, (1080, 1080))
        self.assertEqual(APIClient().get(relative.replace('firma=', 'firma=bad')).status_code, 404)
        self.assertEqual(APIClient().get('/media/'+model.imagen.name).status_code, 404)
        self.api.post(self.base+'desconectar/', {}, format='json'); self.assertEqual(APIClient().get(relative).status_code, 404)

    def test_expired_files_cleanup_keeps_audit_record(self):
        self.connect(); row=self.prepare(); model=PublicacionInstagram.objects.get(pk=row['id'])
        PublicacionInstagram.objects.filter(pk=model.pk).update(imagen_vence_en=timezone.now()-timedelta(seconds=1))
        call_command('limpiar_instagram_media', stdout=StringIO())
        model.refresh_from_db(); self.assertFalse(model.imagen); self.assertEqual(model.estado, 'preparada')

    def test_invalid_token_marks_reconnect_without_exposing_provider_response(self):
        self.connect(); self.mock.mode='token'; row=self.prepare(); result=self.confirm(row)
        self.assertEqual(result.data['data']['estado'], 'fallida')
        self.assertEqual(ConexionInstagram.objects.get().estado, 'reconectar')
        self.assertNotIn('qa-long-token', str(result.data))


class InstagramConcurrencyTests(InstagramFixture, TransactionTestCase):
    def test_concurrent_confirmation_produces_one_remote_publication(self):
        from concurrent.futures import ThreadPoolExecutor
        from django.db import close_old_connections
        self.connect(); row=self.prepare()
        def send():
            close_old_connections(); api=APIClient(); api.force_authenticate(get_user_model().objects.get(pk=self.owner.pk))
            response=api.post(self.base+'publicaciones/'+row['id']+'/confirmar/', {'confirmar': True}, format='json'); close_old_connections(); return response.status_code
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(list(pool.map(lambda _: send(), range(2))), [200, 200])
        self.assertEqual(len(self.writes('/media')), 1); self.assertEqual(len(self.writes('/media_publish')), 1)
