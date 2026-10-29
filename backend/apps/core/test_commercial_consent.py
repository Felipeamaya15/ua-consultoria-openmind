"""Internal development checks. Synthetic mailboxes, isolated test databases only."""
import csv
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from io import BytesIO, StringIO
from threading import Barrier
from urllib.parse import parse_qs, urlsplit
from unittest import skipUnless
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.db import close_old_connections, connection
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from openpyxl import load_workbook
from rest_framework.test import APIClient

from apps.core import commercial_consent as service
from apps.core.models import ConsentimientoComercial as Consent, EventoConsentimiento as Event, SolicitudConsentimiento as Challenge, Tienda, Pedido

REQUEST = '/api/consentimiento/solicitar/'
ACTION = '/api/consentimiento/enlace/'
EXPORT = '/api/tienda/contactos/exportar/'
LOC = 'django.core.mail.backends.locmem.EmailBackend'


def tokens(message):
    result = {}
    for link in re.findall(r'https?://\S+', message.body):
        data = parse_qs(urlsplit(link).fragment)
        if 'token' in data:
            result[data['accion'][0]] = data['token'][0]
    return result


@override_settings(EMAIL_BACKEND=LOC, COMMERCIAL_CONSENT_FRONTEND_ORIGIN='http://localhost:5174')
class CommercialConsentTests(TestCase):
    def setUp(self):
        cache.clear()
        mail.get_connection()
        self.owner = get_user_model().objects.create_user(username='consent-owner', email='owner@example.test')
        self.buyer = get_user_model().objects.create_user(username='consent-buyer', email='buyer@example.test', password='PasswordQA1!')
        self.store = Tienda.objects.create(nombre='Consent QA', id_usuario_propietario=self.owner)
        self.client = APIClient()

    def request(self, email='buyer@example.test', purpose='confirmar', **extra):
        return self.client.post(REQUEST, {'email': email, 'proposito': purpose, 'version_texto': service.VERSION, 'plantilla': 1, **extra}, format='json')

    def act(self, token, action):
        return self.client.post(ACTION, {'token': token, 'accion': action}, format='json')

    def grant(self):
        self.assertEqual(self.request().status_code, 202)
        links = tokens(mail.outbox[-1])
        self.assertEqual(self.act(links['confirmar'], 'confirmar').status_code, 200)
        return links

    def record(self):
        return Consent.objects.get(tienda=self.store, email='buyer@example.test')

    def exported(self, fmt='csv', **extra):
        self.client.force_authenticate(self.owner)
        response = self.client.get(EXPORT, {'uso': 'marketing', 'formato': fmt, **extra})
        self.assertEqual(response.status_code, 200)
        value = b''.join(response.streaming_content)
        # Django's test-client streaming wrapper closes the response on exhaustion.
        self.client.force_authenticate(None)
        if fmt == 'csv':
            return list(csv.reader(StringIO(value.decode('utf-8-sig'))))
        workbook = load_workbook(BytesIO(value), read_only=True, data_only=True)
        rows = list(workbook['Contactos'].values)
        workbook.close()
        return [list(row) for row in rows if row[0] == 'Email' or (row[0] and '@' in str(row[0]))]

    def test_pending_is_not_authorized_and_token_is_not_stored(self):
        response = self.request(' BUYER@example.test ')
        self.assertEqual(response.status_code, 202)
        record = self.record()
        self.assertEqual(record.estado, 'pendiente')
        self.assertFalse(record.verificado)
        self.assertIsNone(record.fecha_autorizacion)
        self.assertEqual(record.eventos.count(), 1)
        links = tokens(mail.outbox[-1])
        self.assertTrue(all(len(c.token_hash) == 64 and c.token_hash not in links.values() for c in Challenge.objects.all()))
        self.assertTrue(all(t not in response.content.decode() for t in links.values()))
        self.assertEqual(self.exported(), [['Email']])

    def test_valid_confirmation_and_replay_are_one_event(self):
        links = self.grant()
        record = self.record()
        self.assertTrue(record.verificado)
        self.assertEqual(record.fecha_autorizacion, record.fecha_verificacion)
        self.assertEqual(record.version_texto, service.VERSION)
        self.assertTrue(record.referencia_evidencia.startswith('email-link:'))
        self.assertEqual(self.act(links['confirmar'], 'confirmar').status_code, 200)
        self.assertEqual(record.eventos.filter(tipo='autorizado').count(), 1)

    def test_invalid_and_wrong_purpose_links_never_authorize(self):
        self.request()
        links = tokens(mail.outbox[-1])
        for token in ('invalid', links['gestionar'], links['confirmar'] + 'x'):
            self.assertEqual(self.act(token, 'confirmar').status_code, 400)
        self.assertFalse(self.record().verificado)

    def test_signature_age_expires_even_if_database_expiry_is_extended(self):
        self.request()
        token = tokens(mail.outbox[-1])['confirmar']
        with patch('django.core.signing.time.time', return_value=timezone.now().timestamp() + 86402):
            self.assertEqual(self.act(token, 'confirmar').status_code, 400)
        self.assertFalse(self.record().verificado)

    def test_database_expiry_is_enforced(self):
        self.request()
        token = tokens(mail.outbox[-1])['confirmar']
        Challenge.objects.filter(proposito='confirmar').update(fecha_vencimiento=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.act(token, 'confirmar').status_code, 400)

    def test_withdrawal_updates_dates_preserves_authorization_and_is_idempotent(self):
        links = self.grant()
        authorized = self.record().fecha_autorizacion
        later = timezone.now() + timedelta(minutes=1)
        with patch('django.utils.timezone.now', return_value=later):
            self.assertEqual(self.act(links['gestionar'], 'retirar').status_code, 200)
        record = self.record()
        self.assertEqual(record.estado, 'retirado')
        self.assertFalse(record.verificado)
        self.assertEqual(record.fecha_retirada, later)
        self.assertEqual(record.fecha_actualizacion, later)
        self.assertEqual(record.fecha_autorizacion, authorized)
        self.assertEqual(self.act(links['gestionar'], 'retirar').status_code, 200)
        self.assertEqual(record.eventos.filter(tipo='retirado').count(), 1)
        self.assertEqual(self.act(links['confirmar'], 'confirmar').status_code, 400)
        self.assertEqual(self.exported(), [['Email']])

    def test_reauthorization_keeps_full_history_and_invalidates_old_management(self):
        old = self.grant()
        self.act(old['gestionar'], 'retirar')
        withdrawn = self.record().fecha_retirada
        self.assertEqual(self.request().status_code, 202)
        self.assertEqual(self.record().estado, 'pendiente')
        links = tokens(mail.outbox[-1])
        self.assertEqual(self.act(links['confirmar'], 'confirmar').status_code, 200)
        self.assertEqual(self.record().fecha_retirada, withdrawn)
        self.assertEqual(self.act(old['gestionar'], 'retirar').status_code, 400)
        self.assertEqual(list(self.record().eventos.order_by('pk').values_list('tipo', flat=True)),
                         ['solicitado', 'autorizado', 'retirado', 'solicitado', 'autorizado'])

    def test_unconfirmed_future_management_cannot_apply_to_another_authorization(self):
        self.request()
        old = tokens(mail.outbox[-1])
        self.request(purpose='gestionar')
        self.act(tokens(mail.outbox[-1])['gestionar'], 'retirar')
        self.request()
        self.assertEqual(self.act(old['gestionar'], 'retirar').status_code, 400)

    def test_authenticated_account_is_not_email_verification(self):
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.request('someone-else@example.test').status_code, 202)
        self.assertFalse(Consent.objects.get(email='someone-else@example.test').verificado)
        self.assertEqual(mail.outbox[-1].to, ['someone-else@example.test'])

    def test_owner_cannot_grant_and_contacts_have_no_write_endpoint(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.request().status_code, 403)
        self.assertEqual(self.client.post('/api/tienda/contactos/', {'email':'buyer@example.test', 'estado':'autorizado'}, format='json').status_code, 405)
        self.assertFalse(Consent.objects.exists())

    def test_state_in_payload_cannot_bypass_confirmation(self):
        self.assertEqual(self.request(estado='autorizado', verificado=True).status_code, 202)
        self.assertFalse(self.record().verificado)

    def test_unknown_and_known_management_requests_have_same_public_response(self):
        missing = self.request('missing@example.test', 'gestionar')
        self.request()
        known = self.request(purpose='gestionar')
        self.assertEqual(missing.status_code, known.status_code)
        self.assertEqual(missing.json(), known.json())
        self.assertNotIn('email', known.json().get('data') or {})

    def test_preferences_require_a_valid_bearer_link(self):
        links = self.grant()
        self.assertEqual(self.act('bad', 'consultar').status_code, 400)
        response = self.act(links['gestionar'], 'consultar')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['data']['estado'], 'autorizado')
        self.assertNotIn('email', response.json()['data'])
        self.assertNotIn('eventos', response.json()['data'])
        self.assertEqual(response['Cache-Control'], 'no-store')

    def test_duplicate_requests_do_not_duplicate_mail_or_events(self):
        self.request()
        self.request()
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(Event.objects.count(), 1)
        self.assertEqual(Challenge.objects.filter(proposito='confirmar').count(), 1)

    def test_resend_invalidates_old_confirmation(self):
        self.request()
        old = tokens(mail.outbox[-1])['confirmar']
        Challenge.objects.filter(proposito='confirmar').update(fecha_creacion=timezone.now() - timedelta(minutes=6))
        self.request()
        self.assertEqual(len(mail.outbox), 2)
        self.assertEqual(self.act(old, 'confirmar').status_code, 400)
        self.assertEqual(self.act(tokens(mail.outbox[-1])['confirmar'], 'confirmar').status_code, 200)

    def test_delivery_failure_rolls_back_without_returning_secrets(self):
        with patch('apps.core.commercial_consent.send_mail', side_effect=RuntimeError('private transport failure')):
            response = self.request()
        self.assertEqual(response.status_code, 503)
        self.assertFalse(Consent.objects.exists())
        self.assertFalse(Event.objects.exists())
        self.assertNotIn('private transport', response.content.decode())
        self.assertEqual(self.request().status_code, 202)

    def test_console_transport_is_rejected_before_persisting_links(self):
        with override_settings(EMAIL_BACKEND='django.core.mail.backends.console.EmailBackend'):
            self.assertEqual(self.request().status_code, 503)
        self.assertFalse(Consent.objects.exists())

    def test_untrusted_origin_and_text_version_are_rejected(self):
        self.assertEqual(self.request(version_texto='unknown').status_code, 400)
        for origin in ('javascript:unsafe', 'http://public.example.test', 'https://user:password@example.test'):
            cache.clear()
            with override_settings(COMMERCIAL_CONSENT_FRONTEND_ORIGIN=origin):
                self.assertEqual(self.request().status_code, 503)
        self.assertFalse(Consent.objects.exists())

    def test_rate_limit_and_metadata_do_not_share_recipient_bucket(self):
        for _ in range(4):
            self.assertEqual(self.client.get(REQUEST).status_code, 200)
        for _ in range(3):
            self.assertEqual(self.request().status_code, 202)
        self.assertEqual(self.request().status_code, 429)

    def test_legacy_unverified_records_and_pending_contacts_are_excluded(self):
        Consent.objects.create(tienda=self.store, email='legacy@example.test', estado='autorizado', version_texto='legacy', referencia_evidencia='legacy-unverified')
        self.request()
        self.assertEqual(self.exported(), [['Email']])
        self.client.force_authenticate(self.owner)
        response = self.client.get('/api/tienda/contactos/', {'consentimiento':'pendiente'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['paginacion']['total'], 2)
        self.assertTrue(all(r['ultimo_pedido'] is None for r in response.json()['data']))

    def test_csv_xlsx_only_email_and_include_verified_contacts_without_orders(self):
        self.grant()
        for fmt in ('csv', 'xlsx'):
            rows = self.exported(fmt)
            self.assertEqual(rows, [['Email'], ['buyer@example.test']])

    def test_export_requires_owner_and_tenant_filters_cannot_expand_scope(self):
        self.assertIn(self.client.get(EXPORT, {'uso':'marketing'}).status_code, (401,403))
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.get(EXPORT, {'uso':'marketing'}).status_code, 403)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(EXPORT, {'uso':'marketing', 'tienda_id':self.store.pk+1}).status_code, 400)
        self.assertEqual(self.client.get(EXPORT, {'uso':'marketing', 'verificado':'false'}).status_code, 400)

    def test_other_store_cannot_use_link_or_export_consent(self):
        links = self.grant()
        other = Tienda.objects.create(nombre='Otra tienda QA', id_usuario_propietario=self.buyer)
        with patch('apps.core.presentation.consent.resolver_tienda', return_value=other):
            self.assertEqual(self.act(links['confirmar'], 'confirmar').status_code, 400)
            self.assertEqual(self.act(links['gestionar'], 'retirar').status_code, 400)
        from apps.core.infrastructure.contacts import contact_rows
        self.assertEqual(contact_rows(other, {}, marketing=True), [])

    def test_history_is_append_only_and_normalized(self):
        self.grant()
        event = Event.objects.first()
        event.tipo = 'retirado'
        with self.assertRaises(ValueError): event.save()
        with self.assertRaises(ValueError): Event.objects.all().update(tipo='retirado')
        with self.assertRaises(ValueError): Event.objects.all().delete()
        self.assertEqual(self.record().email, 'buyer@example.test')

    def test_direct_withdrawal_updates_timestamp_even_with_update_fields(self):
        self.grant()
        record = self.record()
        before = record.fecha_actualizacion
        record.estado = 'retirado'
        record.save(update_fields=['estado'])
        record.refresh_from_db()
        self.assertGreater(record.fecha_actualizacion, before)
        self.assertIsNotNone(record.fecha_retirada)
        self.assertFalse(record.verificado)

    def test_registration_without_marketing_creates_no_consent(self):
        response = self.client.post('/api/auth/register/', {'username':'no-marketing', 'email':'no-marketing@example.test',
            'password':'PasswordQA1!', 'first_name':'Cliente', 'last_name':'Prueba'}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertFalse(Consent.objects.exists())
        self.assertEqual(len(mail.outbox), 0)

    def test_operational_mail_is_independent_of_every_marketing_state(self):
        from apps.core.infrastructure.notificaciones_pedido import (
            notificar_recepcion, notificar_cambio_de_estado, notificar_pago_rechazado,
        )
        for state in (None, 'pendiente', 'retirado', 'autorizado'):
            with self.subTest(marketing=state):
                email = f'operational-{state or "absent"}@example.test'
                if state:
                    Consent.objects.create(tienda=self.store, email=email, estado=state,
                        verificado=state == 'autorizado', version_texto=service.VERSION,
                        referencia_evidencia='synthetic-operational-matrix',
                        fecha_autorizacion=timezone.now() if state == 'autorizado' else None,
                        fecha_verificacion=timezone.now() if state == 'autorizado' else None)
                order = Pedido.objects.create(tienda=self.store, correo_contacto=email,
                    nombre_contacto='Comprador artificial', monto_total=10000, estado='pendiente',
                    entrega={'metodo': 'Starken', 'codigo_seguimiento': 'SYNTHETIC-TRACKING'})
                before = len(mail.outbox)
                self.assertTrue(notificar_recepcion(order).enviado)
                # A rejected attempt precedes successful payment; preserve develop's state guards.
                self.assertTrue(notificar_pago_rechazado(order).enviado)
                order.estado = 'pagado'
                order.save(update_fields=['estado'])
                self.assertTrue(notificar_cambio_de_estado(order, 'pendiente').enviado)
                order.estado = 'enviado'
                order.save(update_fields=['estado'])
                self.assertTrue(notificar_cambio_de_estado(order, 'pagado').enviado)
                messages = mail.outbox[before:]
                self.assertEqual(len(messages), 4)
                self.assertTrue(all(message.to == [email] for message in messages))
                self.assertEqual(notificar_recepcion(order).codigo, 'ya_enviado')
                self.assertEqual(len(mail.outbox), before + 4)
                self.assertFalse(Event.objects.filter(consentimiento__email=email).exists())

    def test_unavailable_schema_never_returns_empty_success_or_debug_details(self):
        from django.db import ProgrammingError
        self.client.force_authenticate(self.owner)
        with patch('apps.core.presentation.commercial_exports.contact_rows', side_effect=ProgrammingError('private sql detail')):
            response = self.client.get(EXPORT, {'uso':'marketing'})
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private sql', response.content.decode())


@skipUnless(connection.vendor == 'postgresql', 'Row-lock concurrency requires PostgreSQL')
@override_settings(EMAIL_BACKEND=LOC, COMMERCIAL_CONSENT_FRONTEND_ORIGIN='http://localhost:5174')
class CommercialConsentConcurrencyTests(TransactionTestCase):
    def setUp(self):
        mail.get_connection()
        owner = get_user_model().objects.create_user(username='concurrent-owner')
        self.store = Tienda.objects.create(nombre='Concurrent QA', id_usuario_propietario=owner)

    def parallel(self, operation):
        barrier = Barrier(2)
        def worker():
            close_old_connections()
            try:
                store = Tienda.objects.get(pk=self.store.pk)
                barrier.wait(timeout=10)
                return operation(store)
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            return list(pool.map(lambda _:worker(), range(2)))

    def test_simultaneous_requests_create_one_pending_event_and_one_message(self):
        self.parallel(lambda store: service.request_link(store, 'concurrent@example.test', 'confirmar', 1))
        self.assertEqual(Consent.objects.count(), 1)
        self.assertEqual(Event.objects.count(), 1)
        self.assertEqual(len(mail.outbox), 1)

    def test_simultaneous_confirmation_then_withdrawal_each_create_one_event(self):
        service.request_link(self.store, 'concurrent@example.test', 'confirmar', 1)
        links = tokens(mail.outbox[-1])
        self.parallel(lambda store: service.use_link(store, links['confirmar'], 'confirmar', 'confirmar'))
        self.assertEqual(Event.objects.filter(tipo='autorizado').count(), 1)
        self.parallel(lambda store: service.use_link(store, links['gestionar'], 'gestionar', 'retirar'))
        self.assertEqual(Event.objects.filter(tipo='retirado').count(), 1)
