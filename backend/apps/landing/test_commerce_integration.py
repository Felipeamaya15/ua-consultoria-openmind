import json
from datetime import timedelta
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from urllib.parse import urlencode
from urllib.request import urlopen
from uuid import uuid4

import av
from PIL import Image
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.http import Http404
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.catalog.infrastructure.repositories import ProductRepository
from apps.core.infrastructure.mongo_client import get_mongo_db
from apps.core.infrastructure.store_mail import send_store_mail
from apps.core.models import Pedido, Tienda
from apps.landing.activities import ActivityConfigSerializer
from apps.landing.models import ConfiguracionLanding, GrabacionTaller, ReservaActividadPagada, SolicitudActividad
from apps.landing.paid_availability import availability
from apps.landing.private_recordings import require_recording
from apps.landing.private_storage import PrivateRecordingStorage
from apps.landing.test_unified_activity_orders import UnifiedOrderDBTests
from apps.landing.transfer_activity_orders import change_transfer


@override_settings(DEBUG=True, EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', STORE_MAIL_EXTERNAL_ENABLED=False)
class CommerceIntegrationTests(TestCase):
    def setUp(self):
        UnifiedOrderDBTests.setUp(self)
        self.owner = self.store.id_usuario_propietario
        self.store.correo_negocio = 'qa-owner@openmind.invalid'
        self.store.save(update_fields=['correo_negocio'])
        self.buyer = get_user_model().objects.create_user(username='qa-recording-buyer', email='qa-buyer@openmind.invalid')
        self.outsider = get_user_model().objects.create_user(username='qa-recording-outsider', email='qa-outsider@openmind.invalid')
        self.client = APIClient()
        self.folder = TemporaryDirectory(prefix='openmind-private-integration-')
        self.addCleanup(self.folder.cleanup)
        self.settings_override = override_settings(PRIVATE_RECORDINGS_ROOT=Path(self.folder.name) / 'private')
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        storage_patch = patch.object(GrabacionTaller._meta.get_field('archivo'), 'storage', PrivateRecordingStorage())
        storage_patch.start()
        self.addCleanup(storage_patch.stop)
        self.collection = get_mongo_db().get_collection('qa_commerce_' + uuid4().hex)
        self.addCleanup(self.collection.drop)
        collection = self.collection

        def repository_init(repository):
            repository.db = get_mongo_db()
            repository.collection = collection

        repo_patch = patch.object(ProductRepository, '__init__', repository_init)
        repo_patch.start()
        self.addCleanup(repo_patch.stop)
        self.product = self.collection.insert_one({'tienda_id': str(self.store.pk), 'activo': True,
            'nombre': 'QA Producto sintético', 'variantes': [{'sku': 'QA-SKU', 'precio': 5000, 'stock': 5,
                'activo': True, 'atributos_variante': []}]}).inserted_id
        self.client.force_authenticate(self.owner)
        upload = self.client.post('/api/landing/grabaciones/', {'titulo': 'QA Grabación sintética', 'video': self.video()}, format='multipart')
        self.assertEqual(upload.status_code, 201, upload.data)
        self.recording = GrabacionTaller.objects.get(pk=upload.data['data']['id'])
        self.section = str(uuid4())
        activity = ActivityConfigSerializer(data={'tipo': 'taller', 'modalidad_venta': 'grabado',
            'grabacion_id': str(self.recording.pk), 'acceso_dias': 30, 'venta': {},
            'portada': f'/media/landing/blocks/{self.store.pk}/{self.section}/' + 'a' * 64 + '.png'})
        self.assertTrue(activity.is_valid(), activity.errors)
        self.config = ConfiguracionLanding.objects.get(tienda=self.store)
        self.config.contenido = {'comercio': {'cotizaciones': True, 'factura': True}, 'bloques': [{
            'id': self.section, 'tipo': 'personalizada', 'visible': True, 'titulo': 'QA Grabación sintética',
            'actividad': activity.validated_data, 'componentes': [
                {'tipo': 'texto', 'visible': True, 'texto': 'Contenido sintético de integración'},
                {'tipo': 'precio', 'visible': True, 'importe': '18000'}]}]}
        self.config.save(update_fields=['contenido'])

    def video(self):
        data = BytesIO()
        with av.open(data, mode='w', format='mp4') as container:
            stream = container.add_stream('libx264', rate=2)
            stream.width, stream.height, stream.pix_fmt = 64, 48, 'yuv420p'
            for _ in range(2):
                for packet in stream.encode(av.VideoFrame.from_image(Image.new('RGB', (64, 48), '#243e75'))):
                    container.mux(packet)
            for packet in stream.encode():
                container.mux(packet)
        return SimpleUploadedFile('qa-sintetico.mp4', data.getvalue(), content_type='video/mp4')

    def checkout(self, mixed=False, authenticate=True, **changes):
        self.client.force_authenticate(self.buyer if authenticate else None)
        data = {'clave_checkout': str(uuid4()), 'items': [], 'actividades': [{
            'seccion_id': self.section, 'cantidad': 1, 'version': availability(self.store, self.section)['version']}],
            'contacto': {'nombre': 'QA Comprador sintético', 'email': self.buyer.email, 'telefono': ''},
            'medio_pago': 'Transferencia', 'metodo_entrega': 'Actividad', 'codigo_promocional': '',
            'factura': {'rut': '12345678-5', 'razon_social': 'QA Empresa sintética', 'giro': 'QA Comercio',
                'direccion': 'QA Calle sintética 123', 'comuna': 'Santiago', 'email': 'qa-invoice@openmind.invalid'}}
        if mixed:
            data.update(items=[{'producto_id': str(self.product), 'sku': 'QA-SKU', 'cantidad': 1}], metodo_entrega='Retiro')
        data.update(changes)
        with patch.dict('os.environ', {'PAID_ACTIVITY_UNIFIED_QA': '0', 'PAID_ACTIVITY_TEST_CHECKOUT': '0',
                'PAID_ACTIVITY_TRANSFER_ENABLED': '1', 'PAID_ACTIVITY_MIXED_ENABLED': '1', 'PAID_ACTIVITY_MIXED_TRANSFER_ENABLED': '1'}), patch('apps.core.presentation.checkout.payment_methods_for_store', return_value={'transfer': {'enabled': True}}), patch('apps.core.presentation.checkout.delivery_for_store', return_value={'pickup': {'enabled': True, 'address': {}, 'schedule': {}}}), patch('apps.core.presentation.checkout.validate_pickup_selection', return_value=None):
            response = self.client.post('/api/checkout/pedidos/', data, format='json')
        return response, data

    def approve(self, mixed=False):
        response, _ = self.checkout(mixed=mixed)
        self.assertEqual(response.status_code, 201, response.data)
        order = Pedido.objects.get(pk=response.data['data']['id_pedido'])
        row = ReservaActividadPagada.objects.get(clave_checkout=order.clave_checkout)
        change_transfer(self.store, order.pk, row.pk, self.owner, 'registrar_pago', 'QA Abono simulado sin transferencia', 'QA-' + uuid4().hex, True)
        order.refresh_from_db()
        row.refresh_from_db()
        return order, row

    def test_quote_uses_real_mongo_and_existing_reply_inbox_without_order_or_stock_change(self):
        data = {'solicitud_id': str(uuid4()), 'nombre': 'QA Cliente', 'email': 'qa-quote@openmind.invalid',
            'producto': str(self.product), 'empresa': 'QA Empresa', 'cantidad': 25, 'mensaje': 'QA Consulta sintética', 'consentimiento': True}
        self.client.force_authenticate(None)
        for _ in range(2):
            response = self.client.post('/api/landing/cotizaciones/', data, format='json')
            self.assertEqual(response.status_code, 202, response.data)
        self.assertEqual(SolicitudActividad.objects.count(), 1)
        self.assertFalse(Pedido.objects.exists())
        self.assertEqual(self.collection.find_one({'_id': self.product})['variantes'][0]['stock'], 5)
        record = SolicitudActividad.objects.get()
        self.client.force_authenticate(self.owner)
        response = self.client.post(f'/api/landing/solicitudes-actividades/{record.pk}/respuestas/',
            {'clave': str(uuid4()), 'asunto': 'QA Respuesta', 'cuerpo': 'QA Cotización sintética'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        history = self.client.get(f'/api/landing/solicitudes-actividades/{record.pk}/respuestas/')
        self.assertEqual(history.data['data']['total'], 1)

    def test_mixed_checkout_keeps_invoice_private_and_grants_only_after_approval_once(self):
        response, _ = self.checkout(mixed=True)
        self.assertEqual(response.status_code, 201, response.data)
        order = Pedido.objects.get(pk=response.data['data']['id_pedido'])
        row = ReservaActividadPagada.objects.get(clave_checkout=order.clave_checkout)
        url = f'/api/landing/mis-talleres/{order.pk}/{row.pk}/video/'
        self.assertEqual(int(order.monto_total), 23000)
        self.assertEqual(order.itempedido_set.count(), 2)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.get('/api/landing/mis-talleres/').data['data'], [])
        reference = 'QA-' + uuid4().hex
        for _ in range(2):
            change_transfer(self.store, order.pk, row.pk, self.owner, 'registrar_pago', 'QA Abono simulado', reference, True)
        order.refresh_from_db()
        self.assertEqual(len(order.entrega['_grabaciones_acceso']), 1)
        self.assertEqual(self.collection.find_one({'_id': self.product})['variantes'][0]['stock'], 4)
        response = self.client.get(url, HTTP_RANGE='bytes=0-31')
        self.assertEqual(response.status_code, 206)
        self.assertEqual(len(b''.join(response.streaming_content)), 32)
        self.assertEqual(response['Cache-Control'], 'no-store')
        from apps.core.presentation.customer_orders import OrderDetailSerializer
        self.assertNotIn('_solicitud_factura', OrderDetailSerializer(order).data['entrega'])
        self.assertEqual(order.entrega['_solicitud_factura']['rut'], '12345678-5')

    def test_private_file_requires_buyer_and_cannot_be_reached_through_media(self):
        order, row = self.approve()
        self.assertFalse(Path(self.recording.archivo.path).is_relative_to(Path(settings.MEDIA_ROOT)))
        with self.assertRaises(ValueError):
            self.recording.archivo.url
        self.assertEqual(self.client.get('/media/' + self.recording.archivo.name).status_code, 404)
        url = f'/api/landing/mis-talleres/{order.pk}/{row.pk}/video/'
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.get('/api/landing/mis-talleres/').data['data'], [])
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(url).status_code, (401, 403))
        other = Tienda.objects.create(id_usuario_propietario=self.outsider, nombre='QA Otra tienda aislada')
        with self.assertRaises(Http404):
            require_recording(other, self.recording.pk)

    def test_expiration_cancellation_and_refund_block_existing_access(self):
        order, row = self.approve()
        url = f'/api/landing/mis-talleres/{order.pk}/{row.pk}/video/'
        grant = order.entrega['_grabaciones_acceso'][str(row.pk)]
        original = grant['hasta']
        grant['hasta'] = (timezone.now() - timedelta(seconds=1)).isoformat()
        order.save(update_fields=['entrega'])
        self.assertEqual(self.client.get(url).status_code, 404)
        grant['hasta'] = original
        order.estado = 'cancelado'
        order.save(update_fields=['estado', 'entrega'])
        self.assertEqual(self.client.get(url).status_code, 404)
        order.estado = 'pagado'
        order.save(update_fields=['estado'])
        change_transfer(self.store, order.pk, row.pk, self.owner, 'autorizar_devolucion', 'QA Revisión de devolución', '', True)
        self.assertEqual(self.client.get(url).status_code, 404)
        change_transfer(self.store, order.pk, row.pk, self.owner, 'registrar_devolucion', 'QA Devolución simulada sin movimiento bancario', 'QA-REF-' + uuid4().hex, True)
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_guest_cannot_purchase_recorded_workshop(self):
        response, _ = self.checkout(authenticate=False)
        self.assertIn(response.status_code, (401, 403))
        self.assertFalse(Pedido.objects.exists())
        self.assertFalse(ReservaActividadPagada.objects.exists())

    def test_real_mailpit_transport_and_durable_duplicate_prevention(self):
        subject = 'QA-OPENMIND-' + uuid4().hex
        key = uuid4()
        with override_settings(EMAIL_BACKEND='django.core.mail.backends.smtp.EmailBackend', EMAIL_HOST='mailpit',
                EMAIL_PORT=1025, EMAIL_HOST_USER='', EMAIL_HOST_PASSWORD='', EMAIL_USE_TLS=False, EMAIL_USE_SSL=False,
                STORE_MAIL_TRANSPORT='mailpit', STORE_MAIL_EXTERNAL_ENABLED=False):
            for _ in range(2):
                result = send_store_mail(self.store, key, self.buyer.email, subject, 'QA Mensaje sintético capturado solo en Mailpit.', category='consulta')
                self.assertEqual(result.estado, 'aceptada')
        query = urlencode({'query': f'subject:"{subject}"'})
        with urlopen('http://mailpit:8025/api/v1/search?' + query, timeout=10) as response:
            messages = json.load(response)['messages']
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]['Subject'], subject)

    def test_native_video_cookie_authentication_and_expired_session(self):
        from django.core.cache import cache
        from rest_framework.authtoken.models import Token
        order, row = self.approve()
        url = f'/api/landing/mis-talleres/{order.pk}/{row.pk}/video/'
        self.client.force_authenticate(None)
        token, _ = Token.objects.get_or_create(user=self.buyer)
        self.client.cookies['auth_token'] = token.key
        response = self.client.get(url, HTTP_RANGE='bytes=0-15')
        self.assertEqual(response.status_code, 206)
        self.assertEqual(len(b''.join(response.streaming_content)), 16)
        Token.objects.filter(pk=token.pk).update(created=timezone.now() - timedelta(days=40))
        cache.delete('auth_session_last_activity:' + token.key)
        self.assertIn(self.client.get(url).status_code, (401, 403))
