from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import Mock, patch
from uuid import uuid4

from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.landing.activities import ActivityConfigSerializer, paid_activity_details, validate_activity
from apps.landing.commerce import CommerceInput, CommerceView, InvoiceInput, QuoteInput, WholesaleQuoteView
from apps.landing.paid_availability import sale_snapshot, sale_version
from apps.landing.private_recordings import byte_range, grant_recordings, valid_grant, RecordingStreamView
from apps.landing.private_storage import PrivateRecordingStorage


class CommerceCompletionTests(SimpleTestCase):
    def invoice(self):
        return {'rut': '12.345.678-5', 'razon_social': 'Empresa de prueba', 'giro': 'Comercio',
            'direccion': 'Calle de prueba 123', 'comuna': 'Santiago', 'email': 'tributario@example.com'}

    def section(self):
        config = ActivityConfigSerializer(data={'tipo': 'taller', 'modalidad_venta': 'grabado',
            'grabacion_id': str(uuid4()), 'acceso_dias': 30, 'venta': {},
            'portada': '/media/landing/blocks/1/00000000-0000-0000-0000-000000000001/' + 'a' * 64 + '.png'})
        self.assertTrue(config.is_valid(), config.errors)
        return {'tipo': 'personalizada', 'visible': True, 'titulo': 'Taller grabado', 'actividad': config.validated_data,
            'componentes': [{'tipo': 'texto', 'visible': True, 'texto': 'Descripción'},
                {'tipo': 'precio', 'visible': True, 'importe': '18000'}]}

    def test_invoice_requires_every_field_and_valid_rut(self):
        serializer = InvoiceInput(data=self.invoice())
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data['rut'], '12345678-5')
        for key in self.invoice():
            data = self.invoice()
            data.pop(key)
            invalid = InvoiceInput(data=data)
            self.assertFalse(invalid.is_valid())
            self.assertIn(key, invalid.errors)
        for rut in ('12345678-9', '0-0', 'abc-K', '123456789-0', '１２-3'):
            invalid = InvoiceInput(data={**self.invoice(), 'rut': rut})
            self.assertFalse(invalid.is_valid(), rut)
            self.assertIn('rut', invalid.errors)

    def test_reminders_cannot_override_system_permission(self):
        with patch.dict('os.environ', {'CART_REMINDERS_ENABLED': '0'}):
            enabled = CommerceInput(data={'recordatorios': True})
            self.assertFalse(enabled.is_valid())
            self.assertTrue(CommerceInput(data={'recordatorios': False}).is_valid())
        with patch.dict('os.environ', {'CART_REMINDERS_ENABLED': '1'}):
            self.assertTrue(CommerceInput(data={'recordatorios': True}).is_valid())

    def test_public_settings_cannot_be_changed_anonymously(self):
        from rest_framework.exceptions import NotAuthenticated
        with patch('apps.landing.commerce.resolver_tienda', side_effect=NotAuthenticated()) as resolver:
            with self.assertRaises(NotAuthenticated):
                CommerceView.patch.__wrapped__(CommerceView(), APIRequestFactory().patch('/comercio/', {}))
        self.assertTrue(resolver.call_args.kwargs['exigir_propietario'])

    def test_quote_requires_consent_quantity_and_email(self):
        data = {'solicitud_id': str(uuid4()), 'nombre': 'Cliente', 'email': 'cliente@example.com',
            'producto': 'a' * 24, 'cantidad': 20, 'consentimiento': True, 'mensaje': ''}
        self.assertTrue(QuoteInput(data=data, context={'tipo': 'cotizacion'}).is_valid())
        for key, value in (('cantidad', 0), ('consentimiento', False), ('email', 'invalid'), ('producto', '../file')):
            serializer = QuoteInput(data={**data, key: value}, context={'tipo': 'cotizacion'})
            self.assertFalse(serializer.is_valid())
            self.assertIn(key, serializer.errors)

    def test_recorded_sale_has_stable_version_and_requires_description(self):
        section = self.section()
        validate_activity(section)
        snapshot = sale_snapshot(section, paid_activity_details(section))
        self.assertEqual(snapshot['modalidad_venta'], 'grabado')
        self.assertEqual(snapshot['acceso_dias'], 30)
        self.assertEqual(snapshot['precio'], 18000)
        self.assertEqual(sale_version(snapshot), sale_version(sale_snapshot(section, paid_activity_details(section))))
        section['componentes'] = section['componentes'][1:]
        with self.assertRaisesMessage(ValidationError, 'descripción'):
            validate_activity(section)

    def test_recording_needs_private_file_and_bounded_access(self):
        for change in ({'grabacion_id': None}, {'acceso_dias': 0}, {'acceso_dias': 3651}, {'tipo': 'servicio'}, {'gratuito': True}):
            section = self.section()
            serializer = ActivityConfigSerializer(data={**section['actividad'], **change})
            self.assertFalse(serializer.is_valid(), change)

    def test_grant_is_idempotent_and_expiry_begins_at_approval(self):
        section = self.section()
        snapshot = sale_snapshot(section, paid_activity_details(section))
        row = SimpleNamespace(pk=uuid4(), condiciones=snapshot, estado='confirmada', tienda_id=1, clave_checkout='key')
        order = SimpleNamespace(comprador_id=8, tienda_id=1, clave_checkout='key', entrega={}, estado='pagado', save=Mock())
        before = timezone.now()
        grant_recordings(order, [row])
        grant = valid_grant(order, row)
        self.assertIsNotNone(grant)
        self.assertLessEqual(before.isoformat(), grant['desde'])
        grant_recordings(order, [row])
        order.save.assert_called_once()
        self.assertIsNone(valid_grant(order, row, now=before + timedelta(days=31)))
        for state in ('pendiente', 'cancelado'):
            order.estado = state
            self.assertIsNone(valid_grant(order, row))
        order.estado = 'pagado'
        row.estado = 'liberada'
        self.assertIsNone(valid_grant(order, row))
        row.estado = 'confirmada'
        order.entrega['devoluciones_actividades_transferencia'] = {str(row.pk): {'estado': 'autorizada'}}
        self.assertIsNone(valid_grant(order, row))

    def test_grants_are_bound_to_store_checkout_and_recording(self):
        now = timezone.now()
        row = SimpleNamespace(pk=uuid4(), estado='confirmada', tienda_id=1, clave_checkout='key', condiciones={'grabacion_id': 'a'})
        grant = {'grabacion_id': 'a', 'desde': (now - timedelta(hours=1)).isoformat(), 'hasta': (now + timedelta(days=1)).isoformat()}
        order = SimpleNamespace(estado='pagado', tienda_id=2, clave_checkout='key', entrega={'_grabaciones_acceso': {str(row.pk): grant}})
        self.assertIsNone(valid_grant(order, row))
        order.tienda_id = 1
        self.assertIsNotNone(valid_grant(order, row))
        order.clave_checkout = 'other'
        self.assertIsNone(valid_grant(order, row))
        order.clave_checkout = 'key'
        grant['grabacion_id'] = 'other'
        self.assertIsNone(valid_grant(order, row))

    def test_ranges_and_private_storage(self):
        self.assertEqual(byte_range(None, 100), (0, 99, 200))
        self.assertEqual(byte_range('bytes=10-19', 100), (10, 19, 206))
        self.assertEqual(byte_range('bytes=80-', 100), (80, 99, 206))
        self.assertEqual(byte_range('bytes=-20', 100), (80, 99, 206))
        for value in ('bytes=100-', 'bytes=20-10', 'bytes=-0', 'bytes=0-1,4-5', 'invalid'):
            with self.assertRaises(ValueError):
                byte_range(value, 100)
        with self.assertRaises(ValueError):
            PrivateRecordingStorage().url('secret.mp4')
        with override_settings(PRIVATE_RECORDINGS_ROOT='/tmp/media/private', MEDIA_ROOT='/tmp/media'):
            with self.assertRaises(ValueError):
                PrivateRecordingStorage()

    def test_stream_requires_session_and_checks_buyer(self):
        request = APIRequestFactory().get('/video/')
        response = RecordingStreamView.as_view()(request, pedido_id=1, reserva_id=uuid4())
        self.assertIn(response.status_code, (401, 403))
        request = APIRequestFactory().get('/video/')
        user = SimpleNamespace(is_authenticated=True, pk=7)
        force_authenticate(request, user)
        from rest_framework.exceptions import NotFound
        with patch('apps.landing.private_recordings.resolver_tienda', return_value='store'), patch('apps.landing.private_recordings.get_object_or_404', side_effect=NotFound()) as lookup:
            response = RecordingStreamView.as_view()(request, pedido_id=1, reserva_id=uuid4())
        self.assertEqual(response.status_code, 404)
        self.assertEqual(lookup.call_args.kwargs['comprador'], user)
        self.assertEqual(lookup.call_args.kwargs['tienda'], 'store')

    def test_quote_reuses_inbox_and_scopes_product_without_creating_order(self):
        from rest_framework.request import Request
        from rest_framework.parsers import JSONParser
        request = Request(APIRequestFactory().post('/cotizaciones/', {'solicitud_id': str(uuid4()),
            'nombre': 'Cliente', 'email': 'cliente@example.com', 'producto': 'a' * 24,
            'cantidad': 30, 'empresa': 'Empresa QA', 'mensaje': 'Consulta sintética', 'consentimiento': True}, format='json'), parsers=[JSONParser()])
        request._user = SimpleNamespace(is_authenticated=False)
        store = SimpleNamespace(pk=1, correo_negocio='negocio@example.com')
        with patch('apps.landing.commerce.resolver_tienda', return_value=store), patch('apps.landing.commerce.Tienda'), patch('apps.landing.commerce.commerce_options', return_value={'cotizaciones': True}), patch('apps.catalog.infrastructure.repositories.ProductRepository') as repo, patch('apps.landing.commerce.SolicitudActividad') as inbox, patch('apps.landing.activity_owner_notifications.programar_aviso_consulta') as notice, patch('apps.core.models.Pedido.objects.create') as create_order:
            repo.return_value.get_by_id.return_value = {'nombre': 'Producto QA', 'activo': True}
            inbox.objects.filter.return_value.first.return_value = None
            inbox.objects.filter.return_value.exists.return_value = False
            response = WholesaleQuoteView.post.__wrapped__(WholesaleQuoteView(), request)
            self.assertEqual(response.status_code, 202)
            repo.return_value.get_by_id.assert_called_once_with('1', 'a' * 24)
            values = inbox.objects.create.call_args.kwargs
            self.assertEqual(values['tipo_actividad'], 'producto')
            self.assertEqual(values['tipo'], 'consulta')
            self.assertIn('Cantidad: 30', values['mensaje'])
            self.assertIn('Empresa QA', values['mensaje'])
            notice.assert_called_once()
            create_order.assert_not_called()
            repo.return_value.deduct_stock.assert_not_called()
            inbox.objects.filter.return_value.first.return_value = SimpleNamespace(**values)
            WholesaleQuoteView.post.__wrapped__(WholesaleQuoteView(), request)
            inbox.objects.create.assert_called_once()
            notice.assert_called_once()

    def test_invoice_and_grant_data_are_not_returned_by_customer_serializer(self):
        from decimal import Decimal
        from apps.core.presentation.customer_orders import OrderSerializer, OrderDetailSerializer
        order = SimpleNamespace(clave_checkout='key', medio_pago='Transferencia', costo_envio=Decimal(0), descuento=Decimal(0),
            entrega={'metodo': 'Retiro', '_solicitud_factura': self.invoice(), '_grabaciones_acceso': {'private': 'data'}, 'pago_actividad_externo': {'private': 'data'}})
        with patch.object(OrderSerializer, 'to_representation', return_value={}):
            result = OrderDetailSerializer().to_representation(order)
        self.assertEqual(result['entrega'], {'metodo': 'Retiro'})
        self.assertIn('_solicitud_factura', order.entrega)

    def test_stream_serves_only_authorized_range_with_private_headers(self):
        from io import BytesIO
        now = timezone.now()
        row = SimpleNamespace(pk=uuid4(), estado='confirmada', tienda_id=1, clave_checkout='key', condiciones={'grabacion_id': 'recording'})
        order = SimpleNamespace(estado='pagado', tienda_id=1, clave_checkout='key', entrega={'_grabaciones_acceso': {str(row.pk): {
            'grabacion_id': 'recording', 'desde': (now - timedelta(hours=1)).isoformat(), 'hasta': (now + timedelta(days=1)).isoformat()}}})
        recording = SimpleNamespace(bytes=10, archivo=Mock())
        recording.archivo.open.return_value = BytesIO(b'0123456789')
        request = APIRequestFactory().get('/video/', HTTP_RANGE='bytes=2-5')
        force_authenticate(request, SimpleNamespace(is_authenticated=True, pk=7))
        with patch('apps.landing.private_recordings.resolver_tienda', return_value='store'), patch('apps.landing.private_recordings.get_object_or_404', side_effect=[order, row]), patch('apps.landing.private_recordings.require_recording', return_value=recording):
            response = RecordingStreamView.as_view()(request, pedido_id=1, reserva_id=row.pk)
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response['Content-Range'], 'bytes 2-5/10')
        self.assertEqual(response['Cache-Control'], 'no-store')
        self.assertEqual(b''.join(response.streaming_content), b'2345')

    def test_private_upload_rejects_even_valid_mp4_while_disabled(self):
        from io import BytesIO
        import av
        from PIL import Image
        from django.core.files.uploadedfile import SimpleUploadedFile
        from apps.landing.private_recordings import RecordingUploadView
        data = BytesIO()
        with av.open(data, mode='w', format='mp4') as container:
            stream = container.add_stream('libx264', rate=2)
            stream.width, stream.height, stream.pix_fmt = 64, 48, 'yuv420p'
            for _ in range(2):
                for packet in stream.encode(av.VideoFrame.from_image(Image.new('RGB', (64, 48), '#243e75'))):
                    container.mux(packet)
            for packet in stream.encode():
                container.mux(packet)
        upload = SimpleUploadedFile('sintetico.mp4', data.getvalue(), content_type='video/mp4')
        request = APIRequestFactory().post('/grabaciones/', {'titulo': 'Grabación sintética', 'video': upload}, format='multipart')
        force_authenticate(request, SimpleNamespace(is_authenticated=True, pk=1))
        with patch('apps.landing.private_recordings.resolver_tienda', return_value='store'), patch('apps.landing.models.GrabacionTaller') as model:
            response = RecordingUploadView.as_view()(request)
            self.assertEqual(response.status_code, 400)
            self.assertIn('deshabilitada', str(response.data['video']))
            model.assert_not_called()

    def test_missing_recording_migration_fails_closed(self):
        from django.db import ProgrammingError
        from apps.landing.private_recordings import RecordingUploadView
        request = APIRequestFactory().get('/grabaciones/')
        force_authenticate(request, SimpleNamespace(is_authenticated=True, pk=1))
        with patch('apps.landing.private_recordings.resolver_tienda', side_effect=ProgrammingError('missing table')):
            response = RecordingUploadView.as_view()(request)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data['error']['codigo'], 'GRABACIONES_ACTUALIZACION_PENDIENTE')
