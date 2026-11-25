import copy
import uuid

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import Tienda
from apps.landing.home_sections import SYSTEM_SECTION_IDS
from apps.landing.models import ConfiguracionLanding


class HomeSectionOrderTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='home-order-owner')
        self.store = Tienda.objects.create(nombre='Orden real', id_usuario_propietario=self.owner)
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.url = '/api/landing/configuracion/'
        self.first = {'id': str(uuid.uuid4()), 'tipo': 'texto', 'visible': True,
                      'titulo': 'Primera', 'subtitulo': '', 'texto': 'Contenido conservado', 'imagenes': []}
        self.second = {**self.first, 'id': str(uuid.uuid4()), 'titulo': 'Segunda'}
        self.payload = {'titulo': 'Portada', 'texto_boton': 'Comprar', 'secciones': {'Productos destacados': True},
                        'contenido': {'bloques': [self.first, self.second], 'beneficios': [{'titulo': 'Envío'}]}}

    def put(self):
        return self.client.put(self.url, self.payload, format='json')

    def test_saved_order_reload_visibility_and_content_are_independent(self):
        order = ['sistema:destacados', self.second['id'], 'sistema:categorias', self.first['id']]
        self.payload['contenido']['orden_apartados'] = order
        self.assertEqual(self.put().status_code, 201)
        config = ConfiguracionLanding.objects.get(tienda=self.store)
        config.refresh_from_db()
        self.assertEqual(config.contenido['orden_apartados'], order)
        self.assertEqual(config.contenido['bloques'], [self.first, self.second])
        self.payload['secciones']['Productos destacados'] = False
        self.assertEqual(self.put().status_code, 200)
        self.client.force_authenticate(None)
        public = self.client.get(self.url).data['data']
        self.assertEqual(public['contenido']['orden_apartados'], order)
        self.assertFalse(public['secciones']['Productos destacados'])

    def test_unknown_foreign_duplicate_and_fixed_sections_are_rejected_atomically(self):
        for order in [['sistema:destacados'] * 2, [str(uuid.uuid4())], ['hero'], ['sistema:beneficios'], ['sistema:portada']]:
            with self.subTest(order=order):
                self.payload['contenido']['orden_apartados'] = order
                self.assertEqual(self.put().status_code, 400)
                self.assertFalse(ConfiguracionLanding.objects.exists())

    def test_twenty_custom_sections_plus_six_system_slots(self):
        blocks = [{**self.first, 'id': str(uuid.uuid4())} for _ in range(20)]
        self.payload['contenido']['bloques'] = blocks
        self.payload['contenido']['orden_apartados'] = [block['id'] for block in blocks] + sorted(SYSTEM_SECTION_IDS)
        self.assertEqual(self.put().status_code, 201)
        self.assertEqual(len(ConfiguracionLanding.objects.get().contenido['orden_apartados']), 26)
        self.payload['contenido']['bloques'].append({**self.first, 'id': str(uuid.uuid4())})
        self.assertEqual(self.put().status_code, 400)

    def test_legacy_update_preserves_order_and_removes_deleted_references(self):
        order = ['sistema:categorias', self.first['id'], 'sistema:destacados', self.second['id']]
        self.payload['contenido']['orden_apartados'] = order
        self.put()
        self.payload['contenido'] = {'contacto': {'correo': 'nuevo@example.test'}}
        self.assertEqual(self.put().data['data']['contenido']['orden_apartados'], order)
        self.payload['contenido'] = {'bloques': [self.second]}
        content = self.put().data['data']['contenido']
        self.assertEqual(content['orden_apartados'], [id for id in order if id != self.first['id']])
        self.assertEqual(content['beneficios'][0]['titulo'], 'Envío')

    def test_missing_order_is_not_backfilled_or_copied_into_blocks(self):
        self.assertEqual(self.put().status_code, 201)
        content = self.client.get(self.url).data['data']['contenido']
        self.assertNotIn('orden_apartados', content)
        self.assertEqual(content['bloques'], [self.first, self.second])

    def test_owner_permissions_and_store_boundary(self):
        self.payload['contenido']['orden_apartados'] = [self.first['id']]
        self.put()
        previous = copy.deepcopy(ConfiguracionLanding.objects.get().contenido)
        other = get_user_model().objects.create_user(username='home-order-other')
        self.client.force_authenticate(other)
        self.assertEqual(self.put().status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.put().status_code, (401, 403))
        self.assertEqual(ConfiguracionLanding.objects.get().contenido, previous)
        Tienda.objects.create(nombre='Otra tienda', id_usuario_propietario=other)
        self.client.force_authenticate(other)
        self.assertEqual(self.put().status_code, 503)
