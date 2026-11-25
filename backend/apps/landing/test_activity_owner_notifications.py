from unittest.mock import patch

from django.core import mail
from django.test import TestCase, override_settings

from apps.landing import test_webpay_activity_reconciliation as helpers
from apps.landing.activity_owner_notifications import enviar_aviso_inscripcion
from apps.landing.models import EnvioCorreoTienda, ReservaActividadPagada
from apps.landing.webpay_activity_orders import process_order


@override_settings(DEBUG=True, EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
                   STORE_MAIL_TRANSPORT='auto', STORE_MAIL_EXTERNAL_ENABLED=False)
class ActivityOwnerNotificationTests(helpers.ReconciliationFixtures, TestCase):
    def paid(self):
        order = self.fixture()
        self.store.correo_negocio = 'owner@example.test'
        self.store.save(update_fields=['correo_negocio'])
        with patch('apps.landing.webpay_activity_orders.adapter_for'), patch(
            'apps.landing.webpay_activity_orders.status_raw', return_value=self.approved(order)):
            process_order(order.pk, callback_token=order.webpay_token)
        return order

    def test_confirmed_inscription_notifies_owner_once_after_commit(self):
        with self.captureOnCommitCallbacks(execute=True):
            order = self.paid()
            self.assertEqual(len(mail.outbox), 0)
        enviar_aviso_inscripcion(order.pk)
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ['owner@example.test'])
        self.assertIn('inscripción pagada', message.subject)
        self.assertIn('Taller QA: 2 participante(s)', message.body)
        self.assertNotIn(order.webpay_token, message.body)
        self.assertEqual(EnvioCorreoTienda.objects.get().estado, 'aceptada')

    def test_pending_order_and_released_seats_do_not_notify(self):
        order = self.fixture()
        self.assertIsNone(enviar_aviso_inscripcion(order.pk))
        self.assertEqual(len(mail.outbox), 0)

    def test_transport_failure_does_not_undo_payment_or_seats(self):
        with patch('apps.landing.activity_owner_notifications.send_store_mail', side_effect=RuntimeError('SMTP unavailable')):
            with self.captureOnCommitCallbacks(execute=True):
                order = self.paid()
        order.refresh_from_db()
        self.assertEqual(order.estado, 'pagado')
        self.assertEqual(ReservaActividadPagada.objects.get().estado, 'confirmada')

    def test_sandbox_never_uses_external_transport(self):
        order = self.paid()
        with patch('apps.core.infrastructure.store_mail.local_transport', return_value=False), patch(
            'apps.landing.activity_owner_notifications.send_store_mail') as send:
            self.assertIsNone(enviar_aviso_inscripcion(order.pk))
            send.assert_not_called()
