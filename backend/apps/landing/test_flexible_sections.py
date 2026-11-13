import base64
import io
import tempfile
import uuid

from PIL import Image
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from apps.core.models import Tienda
from apps.landing.models import ConfiguracionLanding, RecursoMultimedia
from apps.landing.media_library import store_media_image
from apps.core.image_processing import process_image


class FlexibleSectionsTests(TestCase):
    url = '/api/landing/configuracion/'
    public = '/api/landing/multimedia-publica/'

    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='flex-owner')
        self.store = Tienda.objects.create(nombre='Secciones', id_usuario_propietario=self.owner)
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.override = override_settings(MEDIA_ROOT=self.temp.name)
        self.override.enable()
        self.addCleanup(self.override.disable)
        self.section = {'id': str(uuid.uuid4()), 'tipo': 'personalizada', 'visible': True,
                        'nombre_interno': 'Servicio', 'titulo': '', 'subtitulo': '', 'texto': '',
                        'imagenes': [], 'componentes': [self.element('titulo', texto='Asesoría de plantas')]}

    def element(self, kind, **fields):
        return {'id': str(uuid.uuid4()), 'tipo': kind, 'visible': True, **fields}

    def test_keep_preview_open_is_an_optional_persisted_boolean(self):
        resource = self.resource()
        element = self.element('biblioteca', recurso_id=str(resource.pk), vista_abierta=True)
        self.section['componentes'] = [element]
        self.assertEqual(self.save().status_code, 201)
        self.assertTrue(APIClient().get(self.url).data['data']['contenido']['bloques'][0]['componentes'][0]['vista_abierta'])
        element['vista_abierta'] = False
        self.assertEqual(self.save().status_code, 200)
        self.assertFalse(APIClient().get(self.url).data['data']['contenido']['bloques'][0]['componentes'][0]['vista_abierta'])

    def save(self, blocks=None):
        return self.client.put(self.url, {'titulo': 'Mi tienda', 'texto_boton': 'Ver catálogo',
            'contenido': {'bloques': blocks if blocks is not None else [self.section]}}, format='json')

    def resource(self, active=True):
        return RecursoMultimedia.objects.create(tienda=self.store, titulo='Video', tipo='youtube',
            url='https://www.youtube.com/watch?v=M7lc1UVf-VE', activo=active)

    def test_saves_repeatable_ordered_elements_with_all_legacy_types(self):
        elements = [self.element('texto', texto='Primero'), self.element('texto', texto='Segundo'), self.element('separador')]
        self.section['componentes'] = elements
        legacy = [{'id': str(uuid.uuid4()), 'tipo': kind, 'visible': True, 'titulo': kind,
                   'subtitulo': '', 'texto': 'Anterior', 'imagenes': []} for kind in ['historia', 'imagen_texto', 'texto', 'galeria', 'cita']]
        result = self.save([*legacy, self.section])
        self.assertEqual(result.status_code, 201, result.data)
        stored = ConfiguracionLanding.objects.get().contenido['bloques']
        self.assertEqual(stored[:5], legacy)
        self.assertEqual(stored[-1]['componentes'], elements)
        elements[0]['visible'] = False
        self.section['componentes'] = [elements[2], elements[0]]
        self.section['visible'] = False
        self.assertEqual(self.save([self.section, *legacy]).status_code, 200)
        reloaded = self.client.get(self.url).data['data']['contenido']['bloques']
        self.assertEqual(reloaded[0]['componentes'], [elements[2], elements[0]])
        self.assertFalse(reloaded[0]['visible'])

    def test_component_schema_and_unsafe_urls_rejected_atomically(self):
        for element in [self.element('compra', producto_id='inventado'), self.element('script', texto='alert(1)'),
                        self.element('texto', texto='Seguro', html='<script/>'),
                        self.element('boton', etiqueta='Más', url='javascript:alert(1)'),
                        self.element('youtube', url='https://youtube.com/@perfil'),
                        self.element('social', proveedor='instagram', url='https://instagram.com/privado'),
                        self.element('precio', importe='-1'), self.element('fecha', fecha='2026-02-31'),
                        self.element('horario', inicio='18:00', termino='10:00'),
                        self.element('biblioteca', recurso_id='no-es-uuid')]:
            self.section['componentes'] = [element]
            with self.subTest(element=element):
                self.assertEqual(self.save().status_code, 400)
        self.assertFalse(ConfiguracionLanding.objects.exists())

    def test_valid_commercial_activity_and_contact_fields(self):
        self.section['componentes'] = [self.element('precio', importe='15000'),
            self.element('fecha', fecha='2027-01-20'), self.element('horario', inicio='10:00', termino='11:00'),
            self.element('modalidad', modalidad='mixta'), self.element('duracion', texto='Una hora'),
            self.element('boton', etiqueta='Solicitar información', url='https://example.org/informacion'),
            self.element('whatsapp', etiqueta='Consultar', numero='+56 9 1234 5678', mensaje='Quiero información'),
            self.element('ubicacion', texto='Lugar público', url='https://example.org/lugar')]
        result = self.save()
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(result.data['data']['contenido']['bloques'][0]['componentes'][0]['importe'], '15000')

    def test_limits_and_duplicate_component_ids(self):
        element = self.element('texto', texto='Texto')
        for elements in [[element, element], [self.element('separador') for _ in range(31)]]:
            self.section['componentes'] = elements
            self.assertEqual(self.save().status_code, 400)
        self.section['componentes'] = []
        blocks = [{**self.section, 'id': str(uuid.uuid4())} for _ in range(21)]
        self.assertEqual(self.save(blocks).status_code, 400)

    def test_references_are_stable_reusable_and_only_active_own_resources_can_be_selected(self):
        resource = self.resource()
        self.section['componentes'] = [self.element('biblioteca', recurso_id=str(resource.pk))]
        second = {**self.section, 'id': str(uuid.uuid4())}
        response = self.save([self.section, second])
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(RecursoMultimedia.objects.count(), 1)
        self.assertEqual(ConfiguracionLanding.objects.get().contenido['bloques'][1]['componentes'][0]['recurso_id'], str(resource.pk))
        inactive = self.resource(active=False)
        self.section['componentes'] = [self.element('biblioteca', recurso_id=str(inactive.pk))]
        self.assertEqual(self.save().status_code, 400)
        self.section['componentes'] = [self.element('biblioteca', recurso_id=str(uuid.uuid4()))]
        self.assertEqual(self.save().status_code, 400)

    def test_hidden_sections_and_elements_cannot_publish_library_records(self):
        resource = self.resource()
        unrelated = self.resource()
        self.section['componentes'] = [self.element('biblioteca', recurso_id=str(resource.pk))]
        self.section['visible'] = False
        self.assertEqual(self.save().status_code, 201)
        self.assertEqual(APIClient().get(self.public).data['data']['recursos'], {})
        anonymous = APIClient().get(self.url).data['data']['contenido']['bloques']
        self.assertEqual(anonymous, [])
        self.assertEqual(len(self.client.get(self.url).data['data']['contenido']['bloques']), 1)
        self.section['visible'] = True
        self.section['componentes'][0]['visible'] = False
        self.assertEqual(self.save().status_code, 200)
        self.assertEqual(APIClient().get(self.public).data['data']['recursos'], {})
        self.section['componentes'][0]['visible'] = True
        self.save()
        public = APIClient().get(self.public).data['data']['recursos']
        self.assertEqual(set(public), {str(resource.pk)})
        self.assertNotIn(str(unrelated.pk), public)
        self.assertEqual(APIClient().get('/api/landing/biblioteca/').status_code, 401)
        self.assertNotIn('nombre_interno', APIClient().get(self.url).data['data']['contenido']['bloques'][0])

    def test_disabling_or_deleting_resource_revokes_public_access_but_keeps_old_reference_editable(self):
        resource = self.resource()
        self.section['componentes'] = [self.element('biblioteca', recurso_id=str(resource.pk))]
        self.save()
        self.assertIn(str(resource.pk), APIClient().get(self.public).data['data']['recursos'])
        resource.activo = False
        resource.save()
        self.assertEqual(APIClient().get(self.public).data['data']['recursos'], {})
        self.assertEqual(self.save().status_code, 200)
        resource.eliminado = True
        resource.save()
        self.assertEqual(APIClient().get(self.public).data['data']['recursos'], {})
        self.assertEqual(self.save().status_code, 200)

    def test_public_image_requires_current_published_reference_and_never_exposes_private_storage(self):
        buffer = io.BytesIO()
        Image.new('RGB', (8, 8), 'purple').save(buffer, 'PNG')
        asset = store_media_image(process_image(buffer.getvalue(), name='imagen.png', mime='image/png'), self.store)
        resource = RecursoMultimedia.objects.create(tienda=self.store, titulo='Foto privada', tipo='imagen', archivo=asset)
        image_url = f'{self.public}{resource.pk}/imagen/'
        self.assertEqual(APIClient().get(image_url).status_code, 404)
        self.section['componentes'] = [self.element('biblioteca', recurso_id=str(resource.pk))]
        self.save()
        response = APIClient().get(image_url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Cache-Control'], 'no-store')
        self.assertTrue(b''.join(response.streaming_content).startswith(b'\x89PNG'))
        public = APIClient().get(self.public).data['data']['recursos'][str(resource.pk)]
        self.assertIsNone(public['archivo'])
        self.assertNotIn(asset.archivo.name, str(public))
        self.section['visible'] = False
        self.save()
        self.assertEqual(APIClient().get(image_url).status_code, 404)

    def test_nested_image_uploads_are_processed_and_previous_client_preserves_sections(self):
        image = io.BytesIO()
        Image.new('RGB', (8, 8), 'green').save(image, 'PNG')
        src = 'data:image/png;base64,' + base64.b64encode(image.getvalue()).decode()
        self.section['componentes'] = [self.element('imagen', imagenes=[{'id': str(uuid.uuid4()), 'src': src, 'alt': 'Foto'}])]
        response = self.save()
        self.assertEqual(response.status_code, 201, response.data)
        saved = response.data['data']['contenido']['bloques']
        self.assertTrue(saved[0]['componentes'][0]['imagenes'][0]['src'].startswith('/media/landing/blocks/'))
        old = self.client.put(self.url, {'titulo': 'Cliente anterior', 'texto_boton': 'Comprar', 'contenido': {'contacto': {'correo': 'hola@example.org'}}}, format='json')
        self.assertEqual(old.status_code, 200)
        self.assertEqual(old.data['data']['contenido']['bloques'], saved)

    def test_multiple_stores_fail_closed_for_public_media_and_writes(self):
        Tienda.objects.create(nombre='Otra', id_usuario_propietario=self.owner)
        self.assertEqual(self.save().status_code, 503)
        self.assertEqual(APIClient().get(self.public).status_code, 503)
