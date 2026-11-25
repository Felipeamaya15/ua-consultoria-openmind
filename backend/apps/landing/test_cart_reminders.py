from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.core.models import ConsentimientoComercial, Pedido, Tienda
from apps.landing.abandoned_cart_jobs import process_one, process_reminders
from apps.landing.models import RegistroCarritoAbandonado, ConfiguracionLanding


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
                   STORE_MAIL_TRANSPORT='auto', STORE_MAIL_EXTERNAL_ENABLED=False)
class CartReminderTests(TestCase):
    def setUp(self):
        owner = get_user_model().objects.create_user(username='reminder-owner')
        self.buyer = get_user_model().objects.create_user(username='reminder-buyer', email='buyer@example.test')
        self.store = Tienda.objects.create(nombre='QA Recordatorios', id_usuario_propietario=owner)
        ConfiguracionLanding.objects.create(tienda=self.store, contenido={'comercio': {'recordatorios': True}})
        self.consent = ConsentimientoComercial.objects.create(tienda=self.store,
            email=self.buyer.email, estado='autorizado', verificado=True,
            fecha_autorizacion=timezone.now(), fecha_verificacion=timezone.now(),
            version_texto='qa', referencia_evidencia='qa-only')
        self.cart = RegistroCarritoAbandonado.objects.create(tienda=self.store,
            usuario=self.buyer, email=self.buyer.email,
            items=[{'nombre': 'Taller QA', 'cantidad': 2}], ruta='/plantilla/1/carrito',
            ultima_actividad=timezone.now() - timedelta(hours=3))
        self.flags = patch.dict('os.environ', {'CART_REMINDERS_ENABLED': '1',
            'CART_REMINDER_PUBLIC_STORE_URL': 'http://localhost:5173'})
        self.flags.start()
        self.addCleanup(self.flags.stop)

    def test_disabled_by_default_never_queries_or_sends(self):
        with patch.dict('os.environ', {}, clear=True), self.assertNumQueries(0):
            self.assertEqual(process_reminders(), {'deshabilitado': True})
        self.assertEqual(len(mail.outbox), 0)

    def test_active_cart_waits_for_two_hours(self):
        self.cart.ultima_actividad = timezone.now()
        self.cart.save(update_fields=['ultima_actividad'])
        self.assertEqual(process_one(self.cart.pk), 'esperando')
        self.assertEqual(len(mail.outbox), 0)

    def test_revoked_consent_excludes_cart(self):
        self.consent.estado = 'retirado'
        self.consent.save(update_fields=['estado'])
        self.assertEqual(process_one(self.cart.pk), 'excluido')
        self.assertEqual(len(mail.outbox), 0)

    def test_started_checkout_stops_reminders_even_before_payment(self):
        Pedido.objects.create(tienda=self.store, comprador=self.buyer, correo_contacto=self.buyer.email,
            identificador='QA-' + uuid4().hex[:12], monto_total=30000, estado='pendiente')
        self.assertEqual(process_one(self.cart.pk), 'comprado')
        self.assertEqual(len(mail.outbox), 0)

    def test_enabled_reminder_sends_once_with_unsubscribe(self):
        self.assertEqual(process_reminders(), {'aceptada': 1})
        self.assertEqual(process_reminders(), {})
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, [self.buyer.email])
        self.assertIn('Taller QA (cantidad: 2)', message.body)
        self.assertIn('List-Unsubscribe', message.extra_headers)

    def test_uncertain_delivery_does_not_retry(self):
        with patch('apps.landing.abandoned_cart_jobs.send_store_mail',
                   return_value=SimpleNamespace(estado='indeterminada')) as send:
            self.assertEqual(process_one(self.cart.pk), 'indeterminada')
            self.assertEqual(process_one(self.cart.pk), 'omitido')
            self.assertEqual(send.call_count, 1)

    def test_consent_revoked_between_checks_blocks_delivery(self):
        def connection_state(store):
            ConsentimientoComercial.objects.filter(pk=self.consent.pk).update(estado='retirado')
            return {'envio_habilitado': True}
        with patch('apps.landing.abandoned_cart_jobs.connection_state', side_effect=connection_state):
            self.assertEqual(process_one(self.cart.pk), 'excluido')
        self.assertEqual(len(mail.outbox), 0)
