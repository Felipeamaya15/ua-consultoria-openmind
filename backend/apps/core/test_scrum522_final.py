"""Contratos finales SCRUM-522: autorización del remitente y preferencia propia."""
import uuid
from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from apps.core import commercial_consent as consent
from apps.core.models import (Tienda, ConexionGmailTienda, EventoAutorizacionCorreo,
    VerificacionCorreoCuenta, ConsentimientoComercial, EventoConsentimiento, Pedido)
from apps.core.email_verification import record_verified_email
from apps.core.infrastructure.contacts import contact_rows
from apps.core.infrastructure.store_mail import connection_state, send_store_mail
from apps.core.mail_authorization import VERSION
from apps.landing.test_scrum522 import GmailConnectionTests
from apps.core.test_commercial_consent import tokens


class FinalMailAuthorizationTests(GmailConnectionTests):
    def payload(self, **changes):
        return {'autorizar': True, 'correo_negocio': self.store.correo_negocio,
            'version_texto': VERSION, **changes}

    def start(self, **changes):
        response = self.client.post(self.base+'iniciar/', self.payload(**changes), format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return parse_qs(urlsplit(response.data['data']['url_autorizacion']).query)['state'][0]

    def callback(self, state, email=None):
        with patch('apps.core.presentation.gmail_oauth_views.intercambiar_codigo', return_value={
                'correo': email or self.store.correo_negocio, 'refresh_token': 'synthetic-refresh'}):
            return APIClient().get(self.base+'callback/', {'state': state, 'code': 'qa'})

    def test_address_alone_and_old_oauth_token_never_authorize_external_sending(self):
        self.assertFalse(connection_state(self.store)['conectado'])
        connection = self.connection()
        connection.autorizacion_fecha = None; connection.save()
        with override_settings(STORE_MAIL_EXTERNAL_ENABLED=True):
            state = connection_state(self.store)
            self.assertFalse(state['autorizacion_vigente']); self.assertFalse(state['envio_habilitado'])
            with patch('apps.core.infrastructure.store_mail.requests.post') as provider:
                with self.assertRaises(ValueError):
                    send_store_mail(self.store, uuid.uuid4(), self.owner.email, 'QA', 'QA', category='prueba')
                provider.assert_not_called()

    def test_explicit_current_authorization_is_required_and_unknown_inputs_reject(self):
        for payload in ({}, self.payload(autorizar=False), self.payload(autorizar='true'),
                self.payload(version_texto='old'), self.payload(destinatario='third@example.test')):
            self.assertEqual(self.client.post(self.base+'iniciar/', payload, format='json').status_code, 400)
        self.assertEqual(self.client.post(self.base+'iniciar/', self.payload(correo_negocio='third@example.test'), format='json').status_code, 409)

    def test_oauth_must_finish_for_the_same_saved_account_before_grant_is_active(self):
        state = self.start()
        self.assertFalse(connection_state(self.store)['autorizacion_vigente'])
        self.callback(state, 'wrong@example.test')
        self.assertFalse(connection_state(self.store)['conectado'])
        self.assertEqual(EventoAutorizacionCorreo.objects.count(), 0)
        self.callback(self.start())
        status = connection_state(self.store)
        self.assertTrue(status['conectado']); self.assertTrue(status['autorizacion_vigente'])
        event = EventoAutorizacionCorreo.objects.get()
        self.assertEqual((event.usuario_id, event.correo, event.version), (self.owner.pk, self.store.correo_negocio, VERSION))
        self.assertNotIn('refresh', str(self.client.get(self.base+'estado/').data))

    def test_changing_saved_account_invalidates_grant_even_if_address_is_changed_back(self):
        self.connection()
        for email in ['another@example.test', self.store.correo_negocio]:
            response = self.client.patch('/api/tienda/configuracion/', {'correo_negocio': email}, format='json')
            self.assertEqual(response.status_code, 200, response.data)
        self.store.refresh_from_db()
        self.assertFalse(connection_state(self.store)['autorizacion_vigente'])
        self.assertEqual(EventoAutorizacionCorreo.objects.filter(tipo='cuenta_cambiada').count(), 1)

    def test_failure_to_invalidate_grant_cannot_save_account_change(self):
        from django.db import OperationalError
        self.connection()
        with patch('apps.core.mail_authorization.invalidate', side_effect=OperationalError('private SQL details')):
            response = self.client.patch('/api/tienda/configuracion/', {'correo_negocio':'changed@example.test'}, format='json')
        self.assertEqual(response.status_code,503)
        self.assertNotIn('private SQL',str(response.data))
        self.store.refresh_from_db()
        self.assertEqual(self.store.correo_negocio,'authorized@example.test')

    def test_disconnection_and_email_change_invalidate_in_flight_oauth(self):
        state = self.start()
        self.client.post(self.base+'desconectar/', {}, format='json')
        self.callback(state)
        self.assertFalse(connection_state(self.store)['conectado'])
        state = self.start()
        self.client.patch('/api/tienda/configuracion/', {'correo_negocio': 'other@example.test'}, format='json')
        self.callback(state)
        self.assertFalse(connection_state(self.store)['conectado'])

    @override_settings(STORE_MAIL_EXTERNAL_ENABLED=True)
    def test_starting_reconnection_does_not_reenable_a_known_revoked_token(self):
        self.connection()
        with patch('apps.core.infrastructure.store_mail._gmail', return_value=('fallida','reconectar')):
            send_store_mail(self.store, uuid.uuid4(), self.owner.email, 'QA', 'QA', category='prueba')
        self.assertFalse(connection_state(self.store)['envio_habilitado'])
        self.start()
        self.assertFalse(connection_state(self.store)['envio_habilitado'])

    @override_settings(STORE_MAIL_EXTERNAL_ENABLED=True)
    def test_grant_revoked_after_reservation_never_reaches_provider(self):
        from email.message import EmailMessage
        from apps.core.mail_authorization import invalidate
        connection = self.connection()
        def revoke_before_mime():
            invalidate(connection, self.owner, 'desconectada')
            return EmailMessage()
        with patch('apps.core.infrastructure.store_mail.EmailMessage',side_effect=revoke_before_mime), patch('apps.core.infrastructure.store_mail._gmail') as provider:
            result=send_store_mail(self.store,uuid.uuid4(),self.owner.email,'QA','QA',category='prueba')
        self.assertEqual((result.estado,result.codigo),('fallida','autorizacion_cambiada'))
        provider.assert_not_called()


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    COMMERCIAL_CONSENT_FRONTEND_ORIGIN='https://tienda.example.test')
class OwnCommercialPreferenceTests(TestCase):
    def setUp(self):
        cache.clear()
        self.owner = get_user_model().objects.create_user(username='final-owner', email='owner@example.test')
        self.user = get_user_model().objects.create_user(username='final-buyer', email='buyer@example.test')
        self.store = Tienda.objects.create(nombre='Final QA', id_usuario_propietario=self.owner)
        self.client = APIClient(); self.client.force_authenticate(self.user)
        self.path = '/api/consentimiento/mi-preferencia/'

    def change(self, value, **extra):
        return self.client.post(self.path, {'recibir': value, 'version_texto': consent.VERSION, **extra}, format='json')

    def verify(self):
        record_verified_email(self.user.pk, self.user.email, 'enlace_email')

    def test_login_is_not_verification_and_self_endpoint_rejects_unverified_accounts(self):
        self.assertFalse(self.client.get(self.path).data['data']['correo_verificado'])
        self.assertEqual(self.change(True).status_code, 403)
        self.assertEqual(self.change(False).status_code, 403)
        self.assertFalse(ConsentimientoComercial.objects.exists())

    def test_verified_customer_can_grant_withdraw_and_regrant_with_audit_and_no_email(self):
        self.verify()
        for receive, state in [(True,'autorizado'), (True,'autorizado'), (False,'retirado'), (False,'retirado'), (True,'autorizado')]:
            response = self.change(receive)
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data['data']['estado'], state)
            self.assertTrue(response.data['data']['correo_verificado'])
        record = ConsentimientoComercial.objects.get()
        self.assertEqual(record.email, self.user.email)
        self.assertIsNotNone(record.fecha_autorizacion); self.assertIsNotNone(record.fecha_verificacion)
        self.assertEqual(record.version_texto, consent.VERSION)
        self.assertEqual(list(record.eventos.values_list('tipo',flat=True)), ['autorizado','retirado','autorizado'])
        self.assertEqual(set(record.eventos.values_list('metodo', flat=True)), {'cuenta_correo_verificado'})
        self.assertEqual(len(mail.outbox), 0)

    def test_only_own_email_and_current_version_are_accepted(self):
        self.verify()
        for extra in [{'email':'victim@example.test'}, {'usuario_id':self.owner.pk}, {'estado':'autorizado'}, {'version_texto':'old'}]:
            self.assertEqual(self.change(True, **extra).status_code, 400)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.change(True).status_code, 403)
        self.client.force_authenticate(user=None)
        self.assertIn(self.change(True).status_code, [401,403])

    def test_changed_account_email_needs_new_proof(self):
        self.verify()
        response = self.client.patch('/api/auth/perfil/', {'email':'new@example.test'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.user.refresh_from_db()
        self.assertFalse(self.client.get(self.path).data['data']['correo_verificado'])
        self.assertEqual(self.change(True).status_code, 403)

    def test_confirmation_link_proves_only_matching_authenticated_email(self):
        consent.request_link(self.store, self.user.email, 'confirmar', 4)
        token = tokens(mail.outbox[-1])['confirmar']
        self.assertTrue(mail.outbox[-1].body.count('https://tienda.example.test/plantilla/4/preferencias-comerciales#'))
        response = self.client.post('/api/consentimiento/enlace/', {'token':token,'accion':'confirmar'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(self.client.get(self.path).data['data']['correo_verificado'])
        self.change(False)
        self.assertTrue(self.client.get(self.path).data['data']['correo_verificado'])
        self.assertEqual(self.change(True).status_code, 200)

    def test_link_for_someone_else_does_not_verify_logged_in_account(self):
        consent.request_link(self.store, 'someone@example.test', 'confirmar', 1)
        self.client.post('/api/consentimiento/enlace/', {'token':tokens(mail.outbox[-1])['confirmar'],'accion':'confirmar'}, format='json')
        self.assertFalse(VerificacionCorreoCuenta.objects.filter(usuario=self.user).exists())

    @patch('apps.authentication.application.use_cases.requests.get')
    def test_google_verifies_email_without_granting_publicity(self, get):
        get.return_value.ok = True
        get.return_value.json.return_value = {'email':self.user.email,'email_verified':True}
        result = APIClient().post('/api/auth/google/', {'token':'synthetic-google-access'}, format='json')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertTrue(VerificacionCorreoCuenta.objects.filter(usuario=self.user).exists())
        self.assertFalse(ConsentimientoComercial.objects.exists())

    def test_filters_pagination_and_marketing_use_complete_evidence(self):
        self.verify(); self.change(True)
        now=timezone.now()
        incomplete = ConsentimientoComercial.objects.create(tienda=self.store,email='incomplete@example.test',
            estado='autorizado', verificado=True, version_texto=consent.VERSION,referencia_evidencia='legacy')
        ConsentimientoComercial.objects.create(tienda=self.store,email='pending@example.test',estado='pendiente')
        ConsentimientoComercial.objects.create(tienda=self.store,email='withdrawn@example.test',estado='retirado')
        for i,(email, instant) in enumerate([(self.user.email,'2026-11-14T12:00:00+00:00'),('without@example.test','2026-10-01T12:00:00+00:00')]):
            order=Pedido.objects.create(tienda=self.store,correo_contacto=email,monto_total=100,identificador='FINAL-'+str(i))
            Pedido.objects.filter(pk=order.pk).update(fecha_creacion=datetime.fromisoformat(instant))
        self.client.force_authenticate(self.owner)
        data=self.client.get('/api/tienda/contactos/', {'q':'buyer','consentimiento':'autorizado','fecha_desde':'2026-11-14','fecha_hasta':'2026-11-14'}).data
        self.assertEqual([r['email'] for r in data['data']], [self.user.email])
        self.assertEqual([r['email'] for r in contact_rows(self.store,{'consentimiento':'autorizado'})], [self.user.email])
        self.assertIn(incomplete.email,[r['email'] for r in contact_rows(self.store,{'consentimiento':'pendiente'})])
        self.assertEqual([r['email'] for r in contact_rows(self.store,{'consentimiento':'sin_registro'})], ['without@example.test'])
        rows=contact_rows(self.store,{})
        self.assertEqual(len(rows),5)
        first=self.client.get('/api/tienda/contactos/',{'tamano':2,'pagina':1}).data
        second=self.client.get('/api/tienda/contactos/',{'tamano':2,'pagina':2}).data
        self.assertFalse({r['email'] for r in first['data']} & {r['email'] for r in second['data']})
        self.client.force_authenticate(self.user);self.change(False)
        self.assertEqual(contact_rows(self.store,{},marketing=True),[])
