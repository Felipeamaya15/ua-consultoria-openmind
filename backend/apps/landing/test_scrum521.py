from uuid import uuid4

from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import Tienda
from apps.landing.models import ConfiguracionLanding, RecursoMultimedia
from apps.landing.test_media_library import MediaLibraryTests
from apps.catalog.test_creation import CatalogAPITestCase


class MarketingMediaTests(TestCase):
    setUp = MediaLibraryTests.setUp
    url = MediaLibraryTests.url
    create = MediaLibraryTests.create
    image = MediaLibraryTests.image
    upload = MediaLibraryTests.upload

    def test_search_filters_sort_and_pagination_apply_to_entire_own_library(self):
        RecursoMultimedia.objects.bulk_create([
            RecursoMultimedia(tienda=self.store, titulo=f'Recurso {index:02}', tipo='enlace', url='https://example.org', activo=index % 2 == 0)
            for index in range(30)])
        self.create(titulo='Oferta especial', descripcion='Algodón azul')
        data = self.client.get(self.url, {'q': 'Algodón', 'tipo': 'youtube', 'estado': 'activo'}).data['data']
        self.assertEqual(data['total'], 1)
        self.assertEqual(data['resultados'][0]['titulo'], 'Oferta especial')
        data = self.client.get(self.url, {'tipo': 'enlace', 'estado': 'inactivo', 'orden': 'nombre'}).data['data']
        self.assertEqual(data['total'], 15)
        self.assertEqual(data['resultados'][0]['titulo'], 'Recurso 01')
        self.assertEqual(self.client.get(self.url, {'pagina': 2}).data['data']['total'], 31)
        self.assertEqual(len(self.client.get(self.url, {'pagina': 2}).data['data']['resultados']), 7)
        self.assertEqual(self.client.get(self.url, {'q': 'no existe'}).data['data']['total'], 0)
        for params in ({'tipo': 'html'}, {'estado': 'otro'}, {'orden': 'sql'}, {'q': 'x' * 181}, {'pagina': 0}):
            self.assertEqual(self.client.get(self.url, params).status_code, 400)

    def test_private_detail_and_binary_require_active_owner_and_resolved_store(self):
        item = self.upload().data['data']
        detail = f'{self.url}{item["id"]}/'
        self.assertEqual(self.client.get(detail).status_code, 200)
        self.assertEqual(APIClient().get(detail).status_code, 401)
        self.assertEqual(self.client.get(detail, {'tienda_id': '999'}).status_code, 400)
        self.client.force_authenticate(self.other)
        self.assertIn(self.client.get(detail).status_code, (403, 404))
        self.assertIn(self.client.get(detail + 'imagen/').status_code, (403, 404))
        self.owner.is_active = False
        self.owner.save()
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(detail).status_code, 403)

    def test_delete_blocks_saved_hidden_sections_videos_and_carousel_until_unlinked(self):
        resource = self.upload().data['data']
        key = resource['id']
        config = ConfiguracionLanding.objects.create(tienda=self.store, titulo='QA', contenido={
            'bloques': [{'id': str(uuid4()), 'tipo': 'personalizada', 'titulo': 'Taller oculto', 'visible': False,
                        'componentes': [{'tipo': 'biblioteca', 'visible': False, 'recurso_id': key}],
                        'imagenes': [{'video_recurso_id': key}]}],
            'carrusel_recursos': [{'id': str(uuid4()), 'recurso_id': key}]})
        endpoint = f'{self.url}{key}/'
        self.assertEqual(self.client.get(endpoint).data['data']['usos'], ['Taller oculto', 'Carrusel de portada'])
        self.assertEqual(self.client.delete(endpoint).status_code, 400)
        self.assertFalse(RecursoMultimedia.objects.get(pk=key).eliminado)
        config.contenido = {}
        config.save()
        self.assertEqual(self.client.delete(endpoint).status_code, 200)

    def test_repeated_uploads_reuse_file_bytes_without_changing_other_resource(self):
        first, second = self.upload(titulo='Uno').data['data'], self.upload(titulo='Dos').data['data']
        self.assertEqual(first['archivo']['id'], second['archivo']['id'])
        self.assertEqual(self.client.delete(f'{self.url}{first["id"]}/').status_code, 200)
        response = self.client.get(f'{self.url}{second["id"]}/imagen/')
        self.assertEqual(response.status_code, 200)
        self.assertGreater(len(b''.join(response.streaming_content)), 0)


class MarketingCatalogUsageTests(CatalogAPITestCase):
    def test_delete_protects_video_referenced_by_product_even_when_inactive(self):
        pk = self.create()
        resource = RecursoMultimedia.objects.create(tienda=self.store, titulo='Clip QA', tipo='video')
        self.repo.update(str(self.store.pk), pk, {'activo': False, 'video_recurso_id': str(resource.pk)})
        endpoint = f'/api/landing/biblioteca/{resource.pk}/'
        self.assertEqual(self.api.delete(endpoint).status_code, 400)
        self.repo.update(str(self.store.pk), pk, {'video_recurso_id': None})
        self.assertEqual(self.api.delete(endpoint).status_code, 200)
