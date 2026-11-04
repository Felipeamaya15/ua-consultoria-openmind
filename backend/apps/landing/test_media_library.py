import tempfile
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from apps.core.models import Tienda
from apps.core.image_processing import process_upload
from apps.landing.media_library import available_media, store_media_image
from apps.landing.models import ArchivoMultimedia, ConfiguracionLanding, RecursoMultimedia


class MediaLibraryTests(TestCase):
    url = '/api/landing/biblioteca/'

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.settings_override = override_settings(MEDIA_ROOT=self.temp.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.owner = get_user_model().objects.create_user(username='library-owner', password='test-password')
        self.other = get_user_model().objects.create_user(username='library-other', password='test-password')
        self.store = Tienda.objects.create(nombre='Biblioteca', id_usuario_propietario=self.owner)
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def create(self, **values):
        return self.client.post(self.url, {'titulo': 'Video de prueba', 'tipo': 'youtube',
            'url': 'https://youtu.be/M7lc1UVf-VE', **values}, format='json')

    def image(self, name='foto.png', content=None, mime='image/png'):
        if content is None:
            data = BytesIO()
            Image.new('RGB', (20, 10), '#5433eb').save(data, 'PNG')
            content = data.getvalue()
        return SimpleUploadedFile(name, content, content_type=mime)

    def upload(self, **values):
        return self.client.post(self.url, {'titulo': 'Imagen', 'tipo': 'imagen',
            'imagen': self.image(), **values}, format='multipart')

    def test_url_crud_persisted_pagination_disable_and_soft_delete(self):
        created = self.create(descripcion='Descripción guardada')
        self.assertEqual(created.status_code, 201, created.data)
        item = created.data['data']
        resource = RecursoMultimedia.objects.get(pk=item['id'])
        self.assertEqual(resource.url, 'https://www.youtube.com/watch?v=M7lc1UVf-VE')
        endpoint = self.url + str(resource.pk) + '/'
        updated = self.client.patch(endpoint, {'titulo': 'Editado', 'descripcion': 'Otra', 'activo': False}, format='json')
        self.assertEqual(updated.status_code, 200, updated.data)
        persisted = APIClient()
        persisted.force_authenticate(self.owner)
        saved = persisted.get(self.url).data['data']['resultados'][0]
        self.assertEqual(saved['titulo'], 'Editado')
        self.assertEqual(saved['descripcion'], 'Otra')
        self.assertFalse(saved['activo'])
        self.assertEqual(list(available_media(self.store, [resource.pk])), [])
        self.assertEqual(self.client.patch(endpoint, {'activo': True}, format='json').status_code, 200)
        self.assertEqual(available_media(self.store, [resource.pk]).count(), 1)
        self.assertEqual(self.client.delete(endpoint).status_code, 200)
        resource.refresh_from_db()
        self.assertTrue(resource.eliminado)
        self.assertFalse(resource.activo)
        self.assertEqual(persisted.get(self.url).data['data']['total'], 0)
        self.assertEqual(self.client.patch(endpoint, {'activo': True}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(endpoint).status_code, 404)

    def test_supported_content_urls_and_canonicalization(self):
        for kind, url in [
            ('youtube', 'https://www.youtube.com/watch?v=M7lc1UVf-VE&t=20'),
            ('youtube', 'https://youtube.com/shorts/M7lc1UVf-VE'),
            ('instagram', 'https://www.instagram.com/p/ABC_123/?igsh=tracking'),
            ('instagram', 'https://instagram.com/reel/ABC_123'),
            ('facebook', 'https://www.facebook.com/mitienda/posts/pfbidABC123'),
            ('facebook', 'https://facebook.com/permalink.php?story_fbid=123&id=456'),
            ('facebook', 'https://facebook.com/mitienda/videos/123'),
            ('facebook', 'https://facebook.com/watch?v=123'),
            ('enlace', 'https://example.org/catalogo?q=producto'),
            ('imagen', 'https://images.example.org/foto.webp?size=large'),
        ]:
            with self.subTest(url=url):
                response = self.create(tipo=kind, url=url)
                self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(ArchivoMultimedia.objects.count(), 0)

    def test_rejects_unsafe_urls_provider_spoofing_private_hosts_and_embed_html(self):
        for kind, url in [
            ('enlace', 'javascript:alert(1)'), ('enlace', 'data:text/html,test'),
            ('enlace', 'http://example.org/test'), ('enlace', 'https://localhost/test'),
            ('enlace', 'https://127.0.0.1/test'), ('enlace', 'https://10.0.0.1/test'),
            ('enlace', 'https://[::1]/test'), ('enlace', 'https://169.254.169.254/test'),
            ('enlace', 'https://example.org:8080/test'), ('enlace', 'https://user:pass@example.org'),
            ('enlace', 'https://example.org/<script>'), ('enlace', 'https://example.org/\nsecret'),
            ('youtube', 'https://youtube.com.evil.test/watch?v=M7lc1UVf-VE'),
            ('youtube', 'https://youtube.com/@canal'), ('youtube', 'https://youtu.be/invalid'),
            ('instagram', 'https://instagram.com/privado'), ('instagram', 'https://instagram.com/stories/persona/123'),
            ('facebook', 'https://facebook.com/login'), ('facebook', 'https://evil.test/mitienda/posts/123'),
            ('imagen', 'https://example.org/file.svg'), ('imagen', 'https://example.org/file.html'),
        ]:
            with self.subTest(url=url):
                self.assertEqual(self.create(tipo=kind, url=url).status_code, 400)
        self.assertFalse(RecursoMultimedia.objects.exists())

    def test_upload_is_real_private_and_deduplicated_with_metadata(self):
        first = self.upload()
        self.assertEqual(first.status_code, 201, first.data)
        second = self.upload(titulo='Otra sección podrá usar la misma imagen')
        self.assertEqual(second.status_code, 201, second.data)
        self.assertEqual(ArchivoMultimedia.objects.count(), 1)
        self.assertEqual(RecursoMultimedia.objects.count(), 2)
        self.assertEqual(first.data['data']['archivo']['id'], second.data['data']['archivo']['id'])
        self.assertEqual(first.data['data']['archivo']['ancho'], 20)
        asset = ArchivoMultimedia.objects.get()
        self.assertTrue(Path(asset.archivo.path).is_file())
        endpoint = self.url + first.data['data']['id'] + '/imagen/'
        response = self.client.get(endpoint)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'image/png')
        self.assertEqual(response['Cache-Control'], 'private, no-store')
        self.assertEqual(response['X-Content-Type-Options'], 'nosniff')
        self.assertTrue(b''.join(response.streaming_content).startswith(b'\x89PNG'))
        self.assertEqual(APIClient().get(endpoint).status_code, 401)
        self.assertEqual(APIClient().get('/media/' + asset.archivo.name).status_code, 404)
        self.client.delete(self.url + first.data['data']['id'] + '/')
        self.assertEqual(self.client.get(endpoint).status_code, 404)
        self.assertTrue(Path(asset.archivo.path).is_file())
        remaining = self.client.get(self.url + second.data['data']['id'] + '/imagen/')
        self.assertEqual(remaining.status_code, 200)
        self.assertTrue(b''.join(remaining.streaming_content).startswith(b'\x89PNG'))

    def test_upload_validation_video_rejection_and_no_partial_resource(self):
        for name, content, mime in [('video.mp4', b'video', 'video/mp4'),
                                    ('image.svg', b'<svg/>', 'image/svg+xml'),
                                    ('wrong.jpg', b'not-an-image', 'image/jpeg'),
                                    ('large.png', b'x' * (2 * 1024 * 1024 + 1), 'image/png')]:
            with self.subTest(name=name):
                self.assertEqual(self.upload(imagen=self.image(name, content, mime)).status_code, 400)
        self.assertFalse(ArchivoMultimedia.objects.exists())
        self.assertFalse(RecursoMultimedia.objects.exists())
        self.assertEqual(self.upload(url='https://example.org/foto.png').status_code, 400)
        self.assertEqual(self.upload(tipo='youtube').status_code, 400)

    def test_image_edit_reuses_asset_and_url_replacement_preserves_original_file(self):
        created = self.upload().data['data']
        asset = ArchivoMultimedia.objects.get()
        endpoint = self.url + created['id'] + '/'
        self.assertEqual(self.client.patch(endpoint, {'titulo': 'Renombrada'}, format='json').status_code, 200)
        self.assertEqual(self.client.patch(endpoint, {'tipo': 'youtube'}, format='json').status_code, 400)
        changed = self.client.patch(endpoint, {'tipo': 'youtube', 'url': 'https://youtu.be/M7lc1UVf-VE'}, format='json')
        self.assertEqual(changed.status_code, 200, changed.data)
        self.assertIsNone(changed.data['data']['archivo'])
        self.assertTrue(Path(asset.archivo.path).is_file())
        self.assertEqual(self.client.get(endpoint + 'imagen/').status_code, 404)

    def test_owner_only_for_every_operation_and_no_writes_by_foreign_or_inactive_user(self):
        created = self.upload().data['data']
        endpoint = self.url + created['id'] + '/'
        for user, expected in [(None, 401), (self.other, 403)]:
            self.client.force_authenticate(user)
            for response in [self.client.get(self.url), self.create(),
                             self.client.patch(endpoint, {'titulo': 'Ajena'}, format='json'),
                             self.client.delete(endpoint), self.client.get(endpoint + 'imagen/')]:
                self.assertEqual(response.status_code, expected)
        self.owner.is_active = False
        self.owner.save()
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(self.client.delete(endpoint).status_code, 403)
        self.assertEqual(RecursoMultimedia.objects.get().titulo, 'Imagen')

    def test_store_ids_and_cross_store_resources_cannot_be_injected(self):
        self.assertEqual(self.client.get(self.url + '?tienda_id=999').status_code, 400)
        self.assertEqual(self.client.get(self.url, HTTP_X_TIENDA_ID='999').status_code, 400)
        for field in ('tienda', 'tienda_id', 'archivo', 'id', 'eliminado', 'html', 'embed_url'):
            self.assertEqual(self.create(**{field: '999'}).status_code, 400)
        foreign = Tienda.objects.create(nombre='Otra', id_usuario_propietario=self.other)
        image = process_upload(self.image())
        own_file = store_media_image(image, self.store)
        foreign_file = store_media_image(image, foreign)
        self.assertNotEqual(own_file.pk, foreign_file.pk)
        self.assertNotEqual(own_file.archivo.name, foreign_file.archivo.name)
        item = RecursoMultimedia.objects.create(tienda=foreign, titulo='Ajeno', tipo='imagen', archivo=foreign_file)
        self.assertEqual(self.client.get(self.url).status_code, 503)
        self.assertEqual(self.client.delete(self.url + str(item.pk) + '/').status_code, 503)
        # Exercise the resource query with the store already resolved by an installation.
        with patch('apps.landing.media_views.resolver_tienda', return_value=self.store):
            self.assertEqual(self.client.get(self.url).data['data']['total'], 0)
            self.assertEqual(self.client.patch(self.url + str(item.pk) + '/', {'titulo': 'No'}, format='json').status_code, 404)
            self.assertEqual(self.client.delete(self.url + str(item.pk) + '/').status_code, 404)
            self.assertEqual(self.client.get(self.url + str(item.pk) + '/imagen/').status_code, 404)
        self.assertEqual(available_media(self.store, [item.pk]).count(), 0)
        item.refresh_from_db()
        self.assertEqual(item.titulo, 'Ajeno')

    def test_multipart_metadata_patch_does_not_disable_an_active_resource(self):
        resource = self.upload().data['data']
        self.assertTrue(resource['activo'])
        response = self.client.patch(self.url + resource['id'] + '/', {'titulo': 'Solo título'}, format='multipart')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['data']['activo'])
        self.assertEqual(response.data['data']['archivo']['id'], resource['archivo']['id'])

    def test_store_cascade_removes_records_without_cross_store_file_reference(self):
        self.upload()
        self.store.delete()
        self.assertFalse(RecursoMultimedia.objects.exists())
        self.assertFalse(ArchivoMultimedia.objects.exists())

    def test_limits_pagination_and_unknown_resource(self):
        RecursoMultimedia.objects.bulk_create([RecursoMultimedia(tienda=self.store, titulo=str(i), tipo='enlace', url='https://example.org') for i in range(200)])
        first = self.client.get(self.url).data['data']
        second = self.client.get(self.url + '?pagina=2').data['data']
        self.assertEqual(first['total'], 200)
        self.assertEqual(len(first['resultados']), 24)
        self.assertFalse(set(i['id'] for i in first['resultados']) & set(i['id'] for i in second['resultados']))
        self.assertEqual(self.create().status_code, 400)
        self.assertEqual(self.client.get(self.url + '?pagina=0').status_code, 400)
        self.assertEqual(self.client.patch(self.url + str(uuid4()) + '/', {'activo': False}, format='json').status_code, 404)

    def test_upload_quota_and_landing_contacts_remain_untouched(self):
        landing = ConfiguracionLanding.objects.create(tienda=self.store, titulo='Conservado', texto_boton='Comprar', contenido={'contacto': {'instagram': 'https://instagram.com/antes'}})
        ArchivoMultimedia.objects.create(tienda=self.store, archivo='not-opened.png', sha256='0'*64, mime='image/png', tamano=100*1024*1024, ancho=1, alto=1)
        self.assertEqual(self.upload().status_code, 400)
        self.assertEqual(self.create().status_code, 201)
        landing.refresh_from_db()
        self.assertEqual(landing.contenido, {'contacto': {'instagram': 'https://instagram.com/antes'}})
        self.assertEqual(landing.titulo, 'Conservado')
