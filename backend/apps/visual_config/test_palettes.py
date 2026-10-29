from copy import deepcopy
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from apps.core.models import Tienda
from apps.visual_config.palettes import SYSTEM_PALETTES

URL = '/api/visual-config/paletas/'
APPEARANCE = '/api/visual-config/apariencia/'


class PaletteTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='palette-owner')
        self.other = get_user_model().objects.create_user(username='palette-other')
        self.store = Tienda.objects.create(nombre='Tienda', id_usuario_propietario=self.owner)
        self.api = APIClient()
        self.api.force_authenticate(self.owner)
        self.value = {'nombre': 'Mi marca', 'colores': deepcopy(SYSTEM_PALETTES[0]['colores'])}

    def create(self, name='Mi marca'):
        response = self.api.post(URL, {**self.value, 'nombre': name}, format='json')
        self.assertEqual(response.status_code, 201)
        return response.data['data']['propias'][-1]['id']

    def test_only_original_editor_presets_are_selectable(self):
        data = APIClient().get(URL).data['data']
        self.assertEqual([palette['nombre'] for palette in data['sistema']], ['Océano', 'Bosque', 'Ciruela', 'Grafito'])
        self.assertEqual([palette['colores']['primary'] for palette in data['sistema']], ['#2563eb', '#15803d', '#7e22ce', '#1f2937'])
        self.assertEqual(len(data['sistema']), 4)
        self.assertIn('system-original', [palette['id'] for palette in data['compatibles']])

    def test_limit_persistence_and_second_client(self):
        self.create()
        self.create('Verano')
        self.assertEqual(self.api.post(URL, {**self.value, 'nombre': 'Tercera'}, format='json').status_code, 400)
        fresh = APIClient().get(URL)
        self.assertEqual([item['nombre'] for item in fresh.data['data']['propias']], ['Mi marca', 'Verano'])
        self.assertEqual(len(fresh.data['data']['sistema']), len(SYSTEM_PALETTES))

    def test_permissions_validation_and_tenant_isolation(self):
        self.assertEqual(APIClient().post(URL, self.value, format='json').status_code, 401)
        self.api.force_authenticate(self.other)
        self.assertEqual(self.api.post(URL, self.value, format='json').status_code, 403)
        self.api.force_authenticate(self.owner)
        self.assertEqual(self.api.post(URL+'?tienda_id=999', self.value, format='json').status_code, 400)
        for invalid in ({}, {'primary': 'url(javascript:alert(1))'}):
            self.assertEqual(self.api.post(URL, {**self.value, 'colores': invalid}, format='json').status_code, 400)
        self.assertEqual(self.api.get(URL).data['data']['propias'], [])

    def test_reference_on_four_templates_update_and_safe_delete(self):
        palette_id = self.create()
        configs = {template: {'visualConfig': {'global': {'typography': {'body': 'inter', 'heading': 'playfair'}}}, 'paleta_id': palette_id} for template in ('editorial', 'minimal', 'visual', 'catalog')}
        self.assertEqual(self.api.put(APPEARANCE, {'plantillas': configs}, format='json').status_code, 200)
        self.assertEqual(APIClient().get(APPEARANCE).data['data']['plantillas'], configs)
        changed = {**self.value, 'nombre': 'Navidad', 'colores': {**self.value['colores'], 'primary': '#992233'}}
        self.assertEqual(self.api.put(URL+palette_id+'/', changed, format='json').status_code, 200)
        self.assertEqual(APIClient().get(URL).data['data']['propias'][0]['colores']['primary'], '#992233')
        self.assertEqual(self.api.delete(URL+palette_id+'/').status_code, 409)
        for entry in configs.values():
            entry['paleta_id'] = None
        self.assertEqual(self.api.put(APPEARANCE, {'plantillas': configs}, format='json').status_code, 200)
        self.assertEqual(self.api.delete(URL+palette_id+'/').status_code, 200)
        configs['editorial']['paleta_id'] = palette_id
        self.assertEqual(self.api.put(APPEARANCE, {'plantillas': configs}, format='json').status_code, 400)
        self.assertIsNone(APIClient().get(APPEARANCE).data['data']['plantillas']['editorial']['paleta_id'])

    def test_email_is_private_and_independent_of_public_contact(self):
        from apps.landing.models import ConfiguracionLanding
        landing = ConfiguracionLanding.objects.create(tienda=self.store, titulo='Hola', texto_boton='Ver', contenido={'contacto': {'correo': 'publico@example.test'}})
        url = '/api/tienda/configuracion/'
        self.assertEqual(self.api.put(url, {'nombre': 'Tienda', 'correo_negocio': 'admin@example.test'}, format='json').status_code, 200)
        self.assertEqual(self.api.get(url).data['data']['correo_negocio'], 'admin@example.test')
        self.assertNotIn('correo_negocio', APIClient().get(url).data['data'])
        self.assertEqual(self.api.put(url, {'nombre': 'Tienda', 'correo_negocio': 'invalido'}, format='json').status_code, 400)
        landing.refresh_from_db()
        self.assertEqual(landing.contenido['contacto']['correo'], 'publico@example.test')
