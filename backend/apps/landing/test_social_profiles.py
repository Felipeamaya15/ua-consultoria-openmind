from copy import deepcopy

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import Tienda
from apps.landing.models import ConfiguracionLanding


class SocialProfilesTests(TestCase):
    url = '/api/landing/redes-sociales/'

    def setUp(self):
        users = get_user_model().objects
        self.owner = users.create_user(username='social-owner', password='test-password')
        self.other = users.create_user(username='social-other', password='test-password')
        self.store = Tienda.objects.create(nombre='Social', id_usuario_propietario=self.owner)
        self.config = ConfiguracionLanding.objects.create(
            tienda=self.store, titulo='Título original', texto_boton='Comprar',
            secciones={'Información de contacto': True},
            contenido={'bloques': [], 'contacto': {'instagram': 'https://www.instagram.com/antes/',
                       'whatsapp': '+56 9 1234 5678', 'correo': 'contacto@example.test', 'horario': 'Lunes'}})
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def patch(self, data):
        return self.client.patch(self.url, data, format='json')

    def stored(self):
        self.config.refresh_from_db()
        return self.config.contenido['contacto']

    def test_legacy_read_is_active_and_does_not_migrate_or_duplicate_values(self):
        before = deepcopy(self.config.contenido)
        result = self.client.get(self.url)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result['Cache-Control'], 'no-store')
        self.assertEqual(result.data['data']['instagram'], {
            'perfil': 'https://www.instagram.com/antes/', 'activo': True, 'mensaje': ''})
        self.assertFalse(result.data['data']['youtube']['activo'])
        self.config.refresh_from_db()
        self.assertEqual(self.config.contenido, before)

    def test_reported_instagram_profile_survives_save_reload_and_public_read(self):
        original = 'https://www.instagram.com/la_magia_de_tijax/'
        expected = 'https://instagram.com/la_magia_de_tijax'
        response = self.patch({'instagram': {'perfil': original, 'activo': True}})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.stored()['instagram'], expected)
        self.assertEqual(self.client.get(self.url).data['data']['instagram']['perfil'], expected)
        self.client.force_authenticate(None)
        public = self.client.get('/api/landing/configuracion/')
        self.assertEqual(public.status_code, 200)
        self.assertEqual(public.data['data']['contenido']['contacto']['instagram'], expected)

    def test_create_edit_disable_reload_and_delete_each_network(self):
        for network, value, canonical in [
            ('instagram', '@mi.tienda', 'https://instagram.com/mi.tienda'),
            ('facebook', 'mi.tienda', 'https://facebook.com/mi.tienda'),
            ('youtube', '@mi-canal', 'https://youtube.com/@mi-canal'),
            ('whatsapp', '+56 (9) 1234-5678', '+56912345678'),
        ]:
            with self.subTest(network=network):
                response = self.patch({network: {'perfil': value, 'activo': True}})
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(self.stored()[network], canonical)
                self.assertEqual(self.client.get(self.url).data['data'][network]['perfil'], canonical)
                self.assertEqual(self.patch({network: {'perfil': canonical, 'activo': False}}).status_code, 200)
                self.assertFalse(self.client.get(self.url).data['data'][network]['activo'])
                self.assertEqual(self.stored()[network], canonical)
                self.assertEqual(self.patch({network: None}).status_code, 200)
                self.assertEqual(self.stored()[network], '')
                self.assertFalse(self.client.get(self.url).data['data'][network]['activo'])
        self.assertEqual(self.stored()['correo'], 'contacto@example.test')
        self.assertEqual(self.config.contenido['bloques'], [])
        self.assertEqual(self.config.titulo, 'Título original')
        self.assertEqual(self.config.secciones, {'Información de contacto': True})

    def test_editing_value_and_whatsapp_message(self):
        self.patch({'instagram': {'perfil': '@primero', 'activo': True}})
        self.patch({'instagram': {'perfil': '@segundo', 'activo': True},
                    'whatsapp': {'perfil': '+56998765432', 'activo': True, 'mensaje': '¡Hola! Quiero café & té'}})
        data = self.client.get(self.url).data['data']
        self.assertEqual(data['instagram']['perfil'], 'https://instagram.com/segundo')
        self.assertEqual(data['whatsapp']['mensaje'], '¡Hola! Quiero café & té')
        self.assertEqual(self.stored()['redes_sociales']['whatsapp'], {'activo': True, 'mensaje': '¡Hola! Quiero café & té'})

    def test_valid_profile_variants(self):
        for network, profile in [
            ('instagram', 'instagram.com/mi.tienda?igsh=123'),
            ('instagram', 'instagram.comercio'),
            ('facebook', 'facebook.company'),
            ('facebook', 'https://m.facebook.com/profile.php?id=123456'),
            ('facebook', 'https://www.facebook.com/people/Mi-Tienda/123456/'),
            ('youtube', 'https://youtube.com/channel/UC' + 'a' * 22),
            ('youtube', 'https://youtube.com/c/MiCanal'),
            ('youtube', 'https://www.youtube.com/user/MiCanal'),
        ]:
            with self.subTest(profile=profile):
                result = self.patch({network: {'perfil': profile, 'activo': True}})
                self.assertEqual(result.status_code, 200, result.data)

    def test_rejects_unsafe_or_wrong_network_urls_and_non_profile_paths(self):
        before = deepcopy(self.config.contenido)
        for network, value in [
            ('instagram', 'https://instagram.com.evil.test/name'),
            ('instagram', 'https://evil.test/instagram.com/name'),
            ('instagram', 'https://facebook.com/name'),
            ('instagram', 'https://user:password@instagram.com/name'),
            ('instagram', 'http://instagram.com:8080/name'),
            ('instagram', 'javascript:alert(1)'), ('instagram', 'ftp://instagram.com/name'),
            ('instagram', 'https://instagram.com/p/123'), ('instagram', 'bad..name'),
            ('facebook', 'https://facebook.com/profile.php?id=123&id=456'),
            ('facebook', 'https://facebook.com/profile.php?other=123'),
            ('facebook', 'https://facebook.com/profile.php?id=123&other='),
            ('facebook', '.'), ('facebook', '..'),
            ('youtube', 'https://youtube.com/watch?v=123'),
            ('youtube', 'https://youtu.be/123'), ('youtube', '@ab'),
            ('whatsapp', '123'), ('whatsapp', '+012345678'),
            ('whatsapp', '+1234567890123456'), ('whatsapp', '+56 nueve 1234'),
            ('whatsapp', 'https://wa.me/56912345678'),
        ]:
            with self.subTest(value=value):
                self.assertEqual(self.patch({network: {'perfil': value, 'activo': True}}).status_code, 400)
        self.config.refresh_from_db()
        self.assertEqual(self.config.contenido, before)

    def test_invalid_patch_is_atomic_and_strict(self):
        before = deepcopy(self.config.contenido)
        for data in [
            {}, {'tiktok': None}, {'oauth': 'token'},
            {'instagram': {'perfil': '@correcto', 'activo': 'false'}},
            {'instagram': {'perfil': '', 'activo': False}},
            {'instagram': {'perfil': '@correcto', 'activo': True, 'password': 'no'}},
            {'instagram': {'perfil': '@correcto', 'activo': True, 'mensaje': 'No'}},
            {'whatsapp': {'perfil': '+56912345678', 'activo': True, 'mensaje': 'a' * 501}},
            {'instagram': {'perfil': '@correcto', 'activo': True}, 'youtube': {'perfil': 'invalid/url', 'activo': True}},
        ]:
            self.assertEqual(self.patch(data).status_code, 400, data)
        self.config.refresh_from_db()
        self.assertEqual(self.config.contenido, before)

    def test_stale_landing_put_cannot_restore_deleted_or_overwrite_managed_profiles(self):
        self.patch({'instagram': None, 'youtube': {'perfil': '@mi-canal', 'activo': False},
                    'facebook': {'perfil': 'mi.tienda', 'activo': False},
                    'whatsapp': {'perfil': '+56987654321', 'activo': True, 'mensaje': 'Mensaje vigente'}})
        result = self.client.put('/api/landing/configuracion/', {
            'titulo': 'Nuevo título', 'texto_boton': 'Ver',
            'contenido': {'contacto': {'instagram': 'https://instagram.com/antes', 'correo': 'nuevo@example.test',
                                     'redes_sociales': {'youtube': {'activo': True}}, 'youtube': 'https://youtube.com/@otro',
                                     'facebook': 'https://facebook.com/anterior', 'whatsapp': '+56123456789'}}}, format='json')
        self.assertEqual(result.status_code, 200, result.data)
        contact = self.stored()
        self.assertEqual(contact['instagram'], '')
        self.assertEqual(contact['youtube'], 'https://youtube.com/@mi-canal')
        self.assertFalse(contact['redes_sociales']['youtube']['activo'])
        self.assertEqual(contact['facebook'], 'https://facebook.com/mi.tienda')
        self.assertFalse(contact['redes_sociales']['facebook']['activo'])
        self.assertEqual(contact['whatsapp'], '+56987654321')
        self.assertEqual(contact['redes_sociales']['whatsapp']['mensaje'], 'Mensaje vigente')
        self.assertEqual(contact['correo'], 'nuevo@example.test')
        self.assertEqual(contact['horario'], 'Lunes')

    def test_private_endpoint_requires_active_owner_for_read_and_write(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.url).status_code, 401)
        self.assertEqual(self.patch({'instagram': None}).status_code, 401)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(self.patch({'instagram': None}).status_code, 403)
        self.owner.is_active = False
        self.owner.save()
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(self.patch({'instagram': None}).status_code, 403)
        self.assertEqual(self.stored()['instagram'], 'https://www.instagram.com/antes/')

    def test_client_cannot_select_other_store(self):
        self.assertEqual(self.client.get(self.url + '?tienda_id=999').status_code, 400)
        self.assertEqual(self.client.get(self.url, HTTP_X_TIENDA_ID='999').status_code, 400)
        self.assertEqual(self.patch({'tienda_id': 999, 'instagram': None}).status_code, 400)
        self.assertEqual(self.client.patch(self.url, {'instagram': None}, format='json', HTTP_X_TIENDA_ID='999').status_code, 400)

    def test_multiple_stores_fail_closed_without_read_or_write_leak(self):
        foreign = Tienda.objects.create(nombre='Ajena', id_usuario_propietario=self.other)
        second = ConfiguracionLanding.objects.create(tienda=foreign, titulo='Ajeno', texto_boton='Ver', contenido={'contacto': {'instagram': 'https://instagram.com/ajena'}})
        self.assertEqual(self.client.get(self.url).status_code, 503)
        self.assertEqual(self.patch({'instagram': None}).status_code, 503)
        second.refresh_from_db()
        self.assertEqual(second.contenido['contacto']['instagram'], 'https://instagram.com/ajena')
        # Simulate the other installation resolving only its own store.
        self.store.delete()
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.url).data['data']['instagram']['perfil'], 'https://instagram.com/ajena')
        self.assertEqual(self.patch({'instagram': {'perfil': '@otra', 'activo': True}}).status_code, 200)
        second.refresh_from_db()
        self.assertEqual(second.contenido['contacto']['instagram'], 'https://instagram.com/otra')

    def test_first_social_write_works_without_landing_and_does_not_enable_sections(self):
        self.config.delete()
        self.assertEqual(self.client.get(self.url).data['data']['instagram']['perfil'], '')
        self.assertFalse(ConfiguracionLanding.objects.exists())
        self.assertEqual(self.patch({'instagram': {'perfil': '@primero', 'activo': True}}).status_code, 200)
        created = ConfiguracionLanding.objects.get(tienda=self.store)
        self.assertEqual(created.titulo, '')
        self.assertEqual(created.secciones, {})
        public = APIClient().get('/api/landing/configuracion/')
        self.assertEqual(public.status_code, 200)
        self.assertEqual(public.data['data']['contenido']['contacto']['instagram'], 'https://instagram.com/primero')
