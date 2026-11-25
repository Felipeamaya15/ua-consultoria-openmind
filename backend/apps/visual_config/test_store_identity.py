from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from apps.visual_config.views import PlantillaSeleccionadaAPIView


class StoreIdentityContractTests(SimpleTestCase):
    """Public identity contract; no database setup, writes or migrations."""

    def get_response(self, store_id, template=None, params=None):
        request = APIRequestFactory().get('/api/visual-config/plantilla-seleccionada/', params or {})
        config = SimpleNamespace(plantilla_seleccionada=template) if template else None
        with patch('apps.core.infrastructure.tenant.Tienda.objects.get', return_value=SimpleNamespace(pk=store_id)):
            with patch('apps.visual_config.views.ConfiguracionVisual.objects.filter') as query:
                query.return_value.first.return_value = config
                return PlantillaSeleccionadaAPIView.as_view()(request)

    def test_public_identity_preserves_selected_template(self):
        response = self.get_response(7, 'minimal')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data'], {'plantilla_seleccionada': 'minimal', 'tienda_id': 7})

    def test_identity_available_without_visual_config(self):
        response = self.get_response(7)
        self.assertEqual(response.data['data'], {'plantilla_seleccionada': '', 'tienda_id': 7})

    def test_different_stores_return_different_identities(self):
        self.assertEqual(self.get_response(7).data['data']['tienda_id'], 7)
        self.assertEqual(self.get_response(8).data['data']['tienda_id'], 8)

    def test_client_cannot_choose_another_store(self):
        response = self.get_response(7, params={'tienda_id': 8})
        self.assertEqual(response.status_code, 400)
