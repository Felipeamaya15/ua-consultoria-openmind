import copy
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import close_old_connections
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import Tienda, ConsentimientoComercial, Pedido
from apps.landing.models import ConfiguracionLanding, SolicitudActividad


def element(kind, **values):
    return {'id': str(uuid.uuid4()), 'tipo': kind, 'visible': True, **values}


def activity_block(kind='taller', **config):
    day = (timezone.now() + timedelta(days=30)).date().isoformat()
    return {'id': str(uuid.uuid4()), 'tipo': 'personalizada', 'visible': True, 'titulo': '', 'subtitulo': '',
        'texto': '', 'imagenes': [], 'nombre_interno': 'Solo para el panel',
        'actividad': {'tipo': kind, 'estado': 'activa', 'categoria': 'Plantas', 'zona_horaria': 'UTC',
            'plataforma': 'Meet', 'enlace_reunion': 'https://meet.google.com/abc-defg-hij',
            'gratuito': True, 'inscripciones': kind == 'taller', 'cupos': 2, 'confirmacion': 'manual', **config},
        'componentes': [element('titulo', texto='Cuidado de plantas'), element('texto', texto='Contenido público'),
            element('fecha', fecha=day), element('horario', inicio='19:00', termino='20:00'),
            element('modalidad', modalidad='online'), element('consulta', etiqueta='Consultar'), element('inscripcion', etiqueta='Inscribirme')]}


def submission(**patch):
    return {'solicitud_id': str(uuid.uuid4()), 'nombre': 'Ana', 'apellido': 'Prueba', 'email': 'ana@example.test',
        'telefono': '+56 9 1234 5678', 'mensaje': '¿Qué materiales debo llevar?', 'consentimiento': True, **patch}


class ActivityTests(TestCase):
    def setUp(self):
        cache.clear()
        self.owner = get_user_model().objects.create_user(username='activity-owner')
        self.buyer = get_user_model().objects.create_user(username='activity-buyer')
        self.store = Tienda.objects.create(nombre='Actividades de prueba', id_usuario_propietario=self.owner)
        self.owner_client = APIClient()
        self.owner_client.force_authenticate(self.owner)
        self.client = APIClient()
        self.block = activity_block()
        self.payload = {'titulo': 'Portada', 'texto_boton': 'Ver', 'secciones': {},
                        'contenido': {'bloques': [self.block], 'orden_apartados': ['sistema:destacados', self.block['id']]}}
        response = self.save()
        self.assertEqual(response.status_code, 201, response.data)

    def save(self):
        return self.owner_client.put('/api/landing/configuracion/', self.payload, format='json')

    def submit(self, kind='consultas', data=None, block=None):
        return self.client.post(f'/api/landing/actividades/{block or self.block["id"]}/{kind}/', data or submission(), format='json')

    def management(self, **query):
        return self.owner_client.get('/api/landing/solicitudes-actividades/', query)

    def state(self, record, state, **extra):
        return self.owner_client.patch(f'/api/landing/solicitudes-actividades/{record.pk}/', {'estado': state, **extra}, format='json')

    def test_service_crud_publication_preserves_existing_order_and_blocks(self):
        self.block['actividad'].update(tipo='servicio', inscripciones=False, gratuito=False)
        self.block['componentes'].append(element('precio', importe='15000'))
        self.assertEqual(self.save().status_code, 200)
        config = ConfiguracionLanding.objects.get(tienda=self.store)
        self.assertEqual(config.contenido['orden_apartados'], ['sistema:destacados', self.block['id']])
        self.assertEqual(config.contenido['bloques'][0]['componentes'][-1]['importe'], '15000')
        self.assertEqual(self.submit().status_code, 202)
        self.assertEqual(self.submit('inscripciones').status_code, 400)
        self.block['visible'] = False
        self.assertEqual(self.save().status_code, 200)
        self.assertEqual(self.submit().status_code, 404)

    def test_public_config_never_exposes_private_meeting_or_owner_names(self):
        public = self.client.get('/api/landing/configuracion/')
        self.assertEqual(public.status_code, 200)
        self.assertNotIn('meet.google.com', str(public.data))
        self.assertNotIn('enlace_reunion', str(public.data))
        self.assertNotIn('Solo para el panel', str(public.data))
        self.assertIn('Meet', str(public.data))
        owner = self.owner_client.get('/api/landing/configuracion/')
        self.assertIn('https://meet.google.com/abc-defg-hij', str(owner.data))

    def test_guest_consultation_is_permanent_private_and_not_enrollment_or_marketing(self):
        response = self.submit()
        self.assertEqual(response.status_code, 202, response.data)
        self.assertEqual(response.data['data'], {'recibida': True})
        self.assertNotIn('ana@example.test', str(response.data))
        record = SolicitudActividad.objects.get()
        record.refresh_from_db()
        self.assertEqual((record.tipo, record.estado, record.tienda_id), ('consulta', 'nueva', self.store.pk))
        self.assertIsNone(record.usuario_id)
        self.assertIn('consulta', record.consentimiento_version)
        self.assertIsNotNone(record.consentimiento_fecha)
        self.assertFalse(ConsentimientoComercial.objects.exists())
        self.assertFalse(Pedido.objects.exists())
        self.assertEqual(response['Cache-Control'], 'no-store')
        listed = self.management().data['data']['resultados']
        self.assertEqual(listed[0]['email'], 'ana@example.test')

    def test_authenticated_request_associates_only_current_user(self):
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.submit('inscripciones').status_code, 202)
        self.assertEqual(SolicitudActividad.objects.get().usuario_id, self.buyer.pk)
        self.assertIn(self.client.get('/api/landing/solicitudes-actividades/').status_code, (401, 403))

    def test_validation_consent_fields_and_unsafe_private_url(self):
        for patch in [{'consentimiento': False}, {'email': 'bad'}, {'nombre': ' '}, {'telefono': '<script>'}, {'mensaje': ''}, {'tienda_id': 999}, {'usuario': self.owner.pk}]:
            cache.clear()
            with self.subTest(patch=patch):
                self.assertEqual(self.submit(data=submission(**patch)).status_code, 400)
        self.assertFalse(SolicitudActividad.objects.exists())
        self.block['actividad']['enlace_reunion'] = 'javascript:alert(1)'
        self.assertEqual(self.save().status_code, 400)

    def test_duplicate_retry_and_changed_key_body_are_distinguished(self):
        data = submission(email='ANA@EXAMPLE.TEST')
        self.assertEqual(self.submit(data=data).status_code, 202)
        self.assertEqual(self.submit(data=data).status_code, 202)
        self.assertEqual(self.submit(data={**data, 'solicitud_id': str(uuid.uuid4())}).status_code, 202)
        self.assertEqual(SolicitudActividad.objects.count(), 1)
        self.assertEqual(SolicitudActividad.objects.get().email, 'ana@example.test')
        self.assertEqual(self.submit(data={**data, 'mensaje': 'Otra consulta'}).status_code, 400)

    def test_enrollment_duplicate_and_capacity_pending_reservation(self):
        for email in ['a@example.test', 'a@example.test', 'b@example.test']:
            self.assertEqual(self.submit('inscripciones', submission(email=email)).status_code, 202)
        self.assertEqual(SolicitudActividad.objects.count(), 2)
        self.assertEqual(set(SolicitudActividad.objects.values_list('estado', flat=True)), {'pendiente'})
        self.assertEqual(self.submit('inscripciones', submission(email='c@example.test')).status_code, 400)
        record = SolicitudActividad.objects.get(email='a@example.test')
        self.assertEqual(self.state(record, 'cancelada').status_code, 200)
        self.assertEqual(self.submit('inscripciones', submission(email='c@example.test')).status_code, 202)
        self.assertEqual(self.state(record, 'confirmada').status_code, 400)

    def test_free_auto_confirmation_is_not_paid_and_cannot_enable_paid_enrollment(self):
        self.block['actividad']['confirmacion'] = 'automatica'
        self.save()
        self.assertEqual(self.submit('inscripciones').status_code, 202)
        self.assertEqual(SolicitudActividad.objects.get().estado, 'confirmada')
        self.assertFalse(Pedido.objects.exists())
        self.block['actividad']['gratuito'] = False
        self.assertEqual(self.save().status_code, 400)
        self.block['actividad']['gratuito'] = True
        self.block['componentes'].append(element('precio', importe='10000'))
        self.assertEqual(self.save().status_code, 400)

    def test_hidden_cancelled_past_or_deleted_workshop_rejects_enrollment(self):
        for patch in ['hidden', 'cancelled', 'past', 'deleted']:
            cache.clear()
            content = copy.deepcopy(self.payload)
            if patch == 'hidden': self.block['visible'] = False
            if patch == 'cancelled': self.block['actividad']['estado'] = 'cancelada'
            if patch == 'past': self.block['componentes'][2]['fecha'] = '2020-01-01'
            if patch == 'deleted': self.payload['contenido'] = {'bloques': [], 'orden_apartados': []}
            self.assertEqual(self.save().status_code, 200)
            self.assertIn(self.submit('inscripciones').status_code, (400, 404))
            self.payload = content
            self.block = self.payload['contenido']['bloques'][0]
        self.assertFalse(SolicitudActividad.objects.exists())

    def test_date_time_timezone_and_publication_validation(self):
        original = copy.deepcopy(self.payload)
        for invalid in ['end_day', 'end_hour', 'zone', 'no_date', 'no_title', 'dst_gap']:
            self.payload = copy.deepcopy(original)
            block = self.payload['contenido']['bloques'][0]
            if invalid == 'end_day': block['componentes'][2]['hasta'] = '2020-01-01'
            if invalid == 'end_hour': block['componentes'][3]['termino'] = '18:00'
            if invalid == 'zone': block['actividad']['zona_horaria'] = 'Mars/City'
            if invalid == 'no_date': block['componentes'][2]['visible'] = False
            if invalid == 'no_title': block['componentes'][0]['texto'] = ''
            if invalid == 'dst_gap':
                block['actividad']['zona_horaria'] = 'America/New_York'
                block['componentes'][2]['fecha'] = '2030-03-10'
                block['componentes'][3].update(inicio='02:30', termino='04:00')
            with self.subTest(invalid=invalid): self.assertEqual(self.save().status_code, 400)

    def test_hidden_draft_can_be_saved_before_schedule_is_added(self):
        self.block['visible'] = False
        self.block['componentes'] = [element('titulo', texto='')]
        self.assertEqual(self.save().status_code, 200)
        self.assertEqual(self.submit().status_code, 404)

    def test_old_client_preserves_activity_and_can_explicitly_remove_it(self):
        del self.block['actividad']
        self.assertEqual(self.save().status_code, 200)
        self.assertEqual(ConfiguracionLanding.objects.get().contenido['bloques'][0]['actividad']['tipo'], 'taller')
        self.block['actividad'] = None
        self.assertEqual(self.save().status_code, 200)
        self.assertIsNone(ConfiguracionLanding.objects.get().contenido['bloques'][0]['actividad'])
        self.assertEqual(self.submit().status_code, 404)

    def test_state_updates_cannot_change_original_content_or_request_kind(self):
        self.submit()
        record = SolicitudActividad.objects.get()
        self.assertEqual(self.state(record, 'en_revision').status_code, 200)
        self.assertEqual(self.state(record, 'respondida').status_code, 200)
        self.assertEqual(self.state(record, 'confirmada').status_code, 400)
        self.assertEqual(self.state(record, 'cerrada', mensaje='Sobrescrito').status_code, 400)
        record.refresh_from_db()
        self.assertEqual(record.mensaje, '¿Qué materiales debo llevar?')
        self.assertEqual(record.tipo, 'consulta')

    def test_capacity_cannot_be_lowered_below_current_enrollments(self):
        self.submit('inscripciones')
        self.submit('inscripciones', submission(email='otra@example.test'))
        self.block['actividad']['cupos'] = 1
        self.assertEqual(self.save().status_code, 400)

    def test_history_survives_section_removal_and_filters_are_scoped(self):
        self.submit()
        record = SolicitudActividad.objects.get()
        self.payload['contenido'] = {'bloques': [], 'orden_apartados': []}
        self.assertEqual(self.save().status_code, 200)
        self.assertEqual(self.management(tipo='consulta', seccion=self.block['id']).data['data']['total'], 1)
        self.assertEqual(self.management(tipo='inscripcion').data['data']['total'], 0)
        self.assertEqual(self.state(record, 'cerrada').status_code, 200)

    def test_no_public_listing_and_no_cross_store_or_other_owner_writes(self):
        self.submit()
        record = SolicitudActividad.objects.get()
        self.assertIn(self.client.get('/api/landing/solicitudes-actividades/').status_code, (401, 403))
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.patch(f'/api/landing/solicitudes-actividades/{record.pk}/', {'estado': 'cerrada'}, format='json').status_code, 403)
        self.assertEqual(self.submit(block=str(uuid.uuid4())).status_code, 404)
        self.assertEqual(self.client.post(f'/api/landing/actividades/{self.block["id"]}/consultas/', submission(), format='json', HTTP_X_TIENDA_ID='999').status_code, 400)
        Tienda.objects.create(nombre='Otra tienda', id_usuario_propietario=self.buyer)
        self.assertEqual(self.submit().status_code, 503)
        self.assertEqual(self.management().status_code, 503)

    # QA Sprint 8: historial y archivado de consultas (sin alterar inscripciones).
    def archive(self, record, archivada, **extra):
        return self.owner_client.patch(
            f'/api/landing/solicitudes-actividades/{record.pk}/',
            {'archivada': archivada, **extra},
            format='json',
        )

    def test_consultation_is_active_by_default_and_archive_fields_are_public_to_owner(self):
        self.assertEqual(self.submit().status_code, 202)
        record = SolicitudActividad.objects.get(tipo='consulta')
        self.assertFalse(record.archivada)
        self.assertIsNone(record.archivada_en)

        response = self.management(tipo='consulta')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data']['total'], 1)
        listed = response.data['data']['resultados'][0]
        self.assertEqual(listed['id'], str(record.pk))
        self.assertIs(listed['archivada'], False)
        self.assertIsNone(listed['archivada_en'])

    def test_archiving_and_unarchiving_preserves_consultation_state_and_content(self):
        self.assertEqual(self.submit().status_code, 202)
        record = SolicitudActividad.objects.get(tipo='consulta')
        self.assertEqual(self.state(record, 'respondida').status_code, 200)
        original_message = record.mensaje
        original_email = record.email

        archived = self.archive(record, True)
        self.assertEqual(archived.status_code, 200, archived.data)
        self.assertIs(archived.data['data']['archivada'], True)
        self.assertIsNotNone(archived.data['data']['archivada_en'])
        self.assertEqual(archived.data['data']['estado'], 'respondida')
        record.refresh_from_db()
        self.assertTrue(record.archivada)
        self.assertIsNotNone(record.archivada_en)
        self.assertEqual(record.estado, 'respondida')
        self.assertEqual((record.mensaje, record.email), (original_message, original_email))

        restored = self.archive(record, False)
        self.assertEqual(restored.status_code, 200, restored.data)
        self.assertIs(restored.data['data']['archivada'], False)
        self.assertIsNone(restored.data['data']['archivada_en'])
        record.refresh_from_db()
        self.assertFalse(record.archivada)
        self.assertIsNone(record.archivada_en)
        self.assertEqual(record.estado, 'respondida')
        self.assertEqual((record.mensaje, record.email), (original_message, original_email))

    def test_archived_consultations_are_hidden_from_active_list_and_can_be_filtered(self):
        self.assertEqual(self.submit().status_code, 202)
        record = SolicitudActividad.objects.get(tipo='consulta')
        self.assertEqual(self.archive(record, True).status_code, 200)

        active_default = self.management(tipo='consulta').data['data']
        active_explicit = self.management(tipo='consulta', archivada='false').data['data']
        archived = self.management(tipo='consulta', archivada='true').data['data']
        self.assertEqual(active_default['total'], 0)
        self.assertEqual(active_explicit['total'], 0)
        self.assertEqual(active_default['resultados'], [])
        self.assertEqual(archived['total'], 1)
        self.assertEqual(archived['resultados'][0]['id'], str(record.pk))
        self.assertTrue(archived['resultados'][0]['archivada'])

        self.assertEqual(self.archive(record, False).status_code, 200)
        self.assertEqual(self.management(tipo='consulta').data['data']['total'], 1)
        self.assertEqual(self.management(tipo='consulta', archivada='true').data['data']['total'], 0)

    def test_enrollments_cannot_be_archived_or_removed_from_capacity(self):
        self.assertEqual(self.submit('inscripciones').status_code, 202)
        record = SolicitudActividad.objects.get(tipo='inscripcion')
        rejected = self.archive(record, True)
        self.assertEqual(rejected.status_code, 400, rejected.data)
        record.refresh_from_db()
        self.assertFalse(record.archivada)
        self.assertIsNone(record.archivada_en)
        self.assertEqual(record.estado, 'pendiente')
        self.assertEqual(self.management(tipo='inscripcion').data['data']['total'], 1)
        self.assertEqual(self.management(tipo='inscripcion', archivada='true').data['data']['total'], 0)

        # La inscripción sigue ocupando un cupo tras el intento fallido.
        self.assertEqual(
            self.submit('inscripciones', submission(email='segunda@example.test')).status_code,
            202,
        )
        self.assertEqual(
            self.submit('inscripciones', submission(email='tercera@example.test')).status_code,
            400,
        )

    def test_archiving_rejects_mixed_actions_and_unexpected_fields(self):
        self.assertEqual(self.submit().status_code, 202)
        record = SolicitudActividad.objects.get(tipo='consulta')
        for payload in (
            {'estado': 'cerrada', 'archivada': True},
            {'archivada': True, 'mensaje': 'No autorizado'},
            {},
            {'archivada': 'no-es-booleano'},
        ):
            with self.subTest(payload=payload):
                response = self.owner_client.patch(
                    f'/api/landing/solicitudes-actividades/{record.pk}/',
                    payload,
                    format='json',
                )
                self.assertEqual(response.status_code, 400, response.data)
        record.refresh_from_db()
        self.assertEqual(record.estado, 'nueva')
        self.assertFalse(record.archivada)
        self.assertEqual(record.mensaje, '¿Qué materiales debo llevar?')

    def test_archiving_requires_owner_and_cannot_access_another_store_record(self):
        from unittest.mock import patch

        self.assertEqual(self.submit().status_code, 202)
        record = SolicitudActividad.objects.get(tipo='consulta')
        endpoint = f'/api/landing/solicitudes-actividades/{record.pk}/'

        guest = self.client.patch(endpoint, {'archivada': True}, format='json')
        self.assertIn(guest.status_code, (401, 403))
        self.client.force_authenticate(self.buyer)
        unauthorized = self.client.patch(endpoint, {'archivada': True}, format='json')
        self.assertEqual(unauthorized.status_code, 403, unauthorized.data)
        record.refresh_from_db()
        self.assertFalse(record.archivada)

        # Simular un registro que pertenece a otra tienda. Forzamos la
        # resolución de la tienda del propietario para aislar el control del
        # queryset, independientemente de la selección de tenant en desarrollo.
        other_owner = get_user_model().objects.create_user(username='other-activity-owner')
        other_store = Tienda.objects.create(
            nombre='Otra tienda con consultas',
            id_usuario_propietario=other_owner,
        )
        record.tienda = other_store
        record.save(update_fields=['tienda'])

        with patch('apps.landing.activity_views.resolver_tienda', return_value=self.store):
            self.assertEqual(self.management(tipo='consulta', archivada='true').data['data']['total'], 0)
            self.assertEqual(self.management(tipo='consulta').data['data']['total'], 0)
            foreign_write = self.owner_client.patch(
                endpoint, {'archivada': True}, format='json'
            )
        self.assertEqual(foreign_write.status_code, 404, foreign_write.data)
        record.refresh_from_db()
        self.assertFalse(record.archivada)

    def test_basic_abuse_limits_do_not_log_or_expose_recipient(self):
        for _ in range(5): self.assertEqual(self.submit().status_code, 202)
        limited = self.submit()
        self.assertEqual(limited.status_code, 429)
        self.assertIn('Retry-After', limited)
        self.assertNotIn('ana@example.test', str(limited.data))

    def test_non_object_payload_is_rejected_without_server_error(self):
        response = self.client.post(f'/api/landing/actividades/{self.block["id"]}/consultas/', ['bad'], format='json')
        self.assertEqual(response.status_code, 400)


class ActivityCapacityConcurrencyTests(TransactionTestCase):
    def test_two_requests_for_last_seat_cannot_overbook(self):
        owner = get_user_model().objects.create_user(username='concurrent-activity-owner')
        store = Tienda.objects.create(nombre='Concurrencia', id_usuario_propietario=owner)
        block = activity_block(cupos=1)
        ConfiguracionLanding.objects.create(tienda=store, titulo='Tienda', texto_boton='Ver', contenido={'bloques': [block]})
        cache.clear()
        ready = Barrier(2)
        def reserve(index):
            close_old_connections()
            try:
                ready.wait(timeout=10)
                response = APIClient().post(f'/api/landing/actividades/{block["id"]}/inscripciones/', submission(email=f'persona{index}@example.test'), format='json', REMOTE_ADDR=f'192.0.2.{index + 1}')
                return response.status_code
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(reserve, [0, 1]))
        self.assertEqual(sorted(results), [202, 400])
        self.assertEqual(SolicitudActividad.objects.filter(tipo='inscripcion').count(), 1)
