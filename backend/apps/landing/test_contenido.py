from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import Tienda
from apps.landing.models import ConfiguracionLanding


class ContenidoLandingTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='contenido-owner', password='test-password')
        self.store = Tienda.objects.create(nombre='Tienda', id_usuario_propietario=self.owner)
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.url = '/api/landing/configuracion/'
        self.pid = 'a' * 24
        self.payload = {
            'titulo': 'QA SCRUM-58', 'descripcion': 'Configuración persistida correctamente',
            'texto_boton': 'Ver productos', 'secciones': {'Productos destacados': True},
            'contenido': {
                'productos_destacados': [self.pid], 'categorias': ['Categoría real'],
                'beneficios': [{'titulo': 'Entrega personalizada', 'descripcion': 'Hasta tu hogar', 'icono': 'truck'}],
                'contacto': {'telefono': '+56 9 1234 5678', 'whatsapp': '+56 9 1234 5678', 'correo': 'qa@example.test', 'instagram': 'https://instagram.com/qa'},
                'ubicacion': {'direccion': 'Dirección ingresada', 'comuna': 'Comuna', 'ciudad': 'Ciudad', 'enlace_maps': 'https://maps.app.goo.gl/qa'},
            },
        }
        self.mock = patch('apps.catalog.infrastructure.repositories.ProductRepository')
        self.repo = self.mock.start().return_value
        self.addCleanup(self.mock.stop)
        self.repo.list_by_store.return_value = [{'_id': self.pid, 'categoria': 'Categoría real'}]

    def put(self, payload=None):
        return self.client.put(self.url, payload or self.payload, format='json')

    def test_crea_consulta_y_actualiza_contenido_persistido(self):
        created = self.put()
        self.assertEqual(created.status_code, 201, created.data)
        self.repo.list_by_store.assert_called_with(str(self.store.pk), activo=True)
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(self.url).data['data'], created.data['data'])
        self.client.force_authenticate(self.owner)
        self.payload['contenido']['contacto']['telefono'] = '123456789'
        updated = self.put()
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data['data']['id'], created.data['data']['id'])
        self.assertEqual(ConfiguracionLanding.objects.get(tienda=self.store).contenido['contacto']['telefono'], '123456789')

    def test_cliente_anterior_conserva_contenido_al_omitirlo(self):
        self.put()
        old = {k: v for k, v in self.payload.items() if k != 'contenido'}
        response = self.put(old)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data']['contenido'], self.payload['contenido'])

    def test_desactivar_no_borra_datos(self):
        self.payload['secciones'] = {'Productos destacados': False, 'Beneficios': False}
        response = self.put()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['data']['contenido'], self.payload['contenido'])

    def test_rechaza_producto_de_otra_tienda_o_inactivo(self):
        self.repo.list_by_store.return_value = []
        self.assertEqual(self.put().status_code, 400)
        self.assertFalse(ConfiguracionLanding.objects.exists())

    def test_rechaza_categoria_inexistente(self):
        self.payload['contenido']['categorias'] = ['Otra categoría']
        self.assertEqual(self.put().status_code, 400)

    def test_rechaza_id_malformado_y_seleccion_duplicada(self):
        for ids in [['producto-inventado'], [self.pid, self.pid]]:
            self.payload['contenido']['productos_destacados'] = ids
            self.assertEqual(self.put().status_code, 400)

    def test_limites_de_productos_categorias_y_beneficios(self):
        for key, values in [
            ('productos_destacados', [f'{i:024x}' for i in range(7)]),
            ('categorias', [str(i) for i in range(7)]),
            ('beneficios', [{'titulo': str(i)} for i in range(5)]),
        ]:
            with self.subTest(key=key):
                payload = {**self.payload, 'contenido': {key: values}}
                self.assertEqual(self.put(payload).status_code, 400)

    def test_no_acepta_enlaces_inseguros_o_maps_ajeno(self):
        for content in [
            {'contacto': {'instagram': 'javascript:alert(1)'}},
            {'contacto': {'sitio_web': 'ftp://example.test'}},
            {'contacto': {'correo': 'correo inválido'}},
            {'ubicacion': {'enlace_maps': 'https://example.test/mapa'}},
        ]:
            with self.subTest(content=content):
                self.assertEqual(self.put({**self.payload, 'contenido': content}).status_code, 400)

    def test_contenido_vacio_compatible_y_sin_consulta_catalogo(self):
        self.payload['contenido'] = {}
        response = self.put()
        self.assertEqual(response.status_code, 201)
        self.repo.list_by_store.assert_not_called()

    def test_campos_opcionales_vacios(self):
        self.payload['contenido'] = {'contacto': {'correo': '', 'sitio_web': '', 'whatsapp': ''}, 'ubicacion': {'enlace_maps': ''}}
        self.assertEqual(self.put().status_code, 201)

    def test_multipart_igual_que_json(self):
        import json
        payload = {**self.payload, 'contenido': json.dumps(self.payload['contenido']), 'secciones': json.dumps(self.payload['secciones'])}
        response = self.client.put(self.url, payload, format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['data']['contenido'], self.payload['contenido'])

    def test_solo_propietario_puede_guardar_contenido(self):
        other = get_user_model().objects.create_user(username='not-owner')
        self.client.force_authenticate(other)
        self.assertEqual(self.put().status_code, 403)
        self.repo.list_by_store.assert_not_called()

    def test_fallo_catalogo_no_guarda_configuracion(self):
        from pymongo.errors import ConnectionFailure
        self.repo.list_by_store.side_effect = ConnectionFailure('No disponible')
        self.assertEqual(self.put().status_code, 503)
        self.assertFalse(ConfiguracionLanding.objects.exists())


    def test_banderas_deben_ser_booleanos(self):
        self.payload['secciones'] = {'Beneficios': 'false'}
        self.assertEqual(self.put().status_code, 400)
