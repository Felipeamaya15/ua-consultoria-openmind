from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from apps.core.models import Tienda

URL = '/api/tienda/configuracion/'


class StoreConfigurationTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='config-owner')
        self.other = get_user_model().objects.create_user(username='config-other')
        self.store = Tienda.objects.create(nombre='Original', id_usuario_propietario=self.owner)
        self.api = APIClient()
        self.api.force_authenticate(self.owner)

    def test_persistence_and_public_fields_only(self):
        response = self.api.put(URL, {'nombre': 'Mi negocio', 'descripcion': 'Descripción propia'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.store.refresh_from_db()
        self.assertEqual((self.store.nombre, self.store.descripcion), ('Mi negocio', 'Descripción propia'))
        public = APIClient().get(URL)
        self.assertEqual(public.status_code, 200)
        self.assertEqual(public.json()['data'], {'nombre': 'Mi negocio', 'descripcion': 'Descripción propia'})

    def test_permissions_and_invalid_fields(self):
        self.assertEqual(APIClient().put(URL, {'nombre': 'Hack'}).status_code, 401)
        self.api.force_authenticate(self.other)
        self.assertEqual(self.api.put(URL, {'nombre': 'Hack'}).status_code, 403)
        self.api.force_authenticate(self.owner)
        for name in ('', '   ', 'x' * 151):
            self.assertEqual(self.api.put(URL, {'nombre': name}).status_code, 400)
        self.assertEqual(self.api.put(URL + '?tienda_id=999', {'nombre': 'Hack'}).status_code, 400)
        self.store.refresh_from_db()
        self.assertEqual(self.store.nombre, 'Original')
        self.owner.is_active = False
        self.owner.save()
        self.assertEqual(self.api.put(URL, {'nombre': 'Hack'}).status_code, 403)

    def test_does_not_modify_landing_or_design(self):
        from apps.landing.models import ConfiguracionLanding
        landing = ConfiguracionLanding.objects.create(tienda=self.store, titulo='Portada', descripcion='Otra descripción', texto_boton='Ver')
        self.api.put(URL, {'nombre': 'Nuevo', 'descripcion': 'Negocio'}, format='json')
        landing.refresh_from_db()
        self.assertEqual((landing.titulo, landing.descripcion), ('Portada', 'Otra descripción'))
