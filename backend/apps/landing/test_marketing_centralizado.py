"""Published references use real Mongo fixtures and the existing campaigns API."""
import base64
import uuid
from io import BytesIO

from PIL import Image
from django.test import override_settings
from django.utils import timezone
from apps.catalog.test_creation import CatalogAPITestCase
from apps.core.models import ConsentimientoComercial
from apps.landing.models import ConfiguracionLanding, RecursoMultimedia, CampanaPromocional
from apps.landing.campaign_rendering import safe_image


@override_settings(STOREFRONT_PUBLIC_URL='https://shop.example/plantilla/1', STORE_MAIL_PUBLIC_API_URL='https://api.example',
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', STORE_MAIL_EXTERNAL_ENABLED=False)
class CentralizedCampaignTests(CatalogAPITestCase):
    def setUp(self):
        super().setUp()
        self.product_id = self.create()
        product = self.read(self.product_id)
        self.slug = product['slug']
        variants = product['variantes']
        variants[1]['stock'] = 3
        self.repo.update(str(self.store.pk), self.product_id, {'variantes': variants})
        self.section_id = str(uuid.uuid4())
        self.section = {'id': self.section_id, 'visible': True, 'tipo': 'personalizada', 'titulo': 'Servicio publicado',
            'imagenes': [{'src': 'https://images.example/service.png'}], 'actividad': {'tipo': 'servicio', 'estado': 'activa'},
            'componentes': [{'tipo': 'texto', 'visible': True, 'texto': 'Descripción accesible'}, {'tipo': 'precio', 'visible': True, 'importe': '25000'}]}
        self.config = ConfiguracionLanding.objects.create(tienda=self.store, contenido={'bloques': [self.section]})
        self.url = '/api/tienda/campanas/'
        self.payload = {'clave': str(uuid.uuid4()), 'nombre': 'Campaña QA', 'asunto': 'Novedades', 'cuerpo': 'Texto editorial', 'destinatarios': [], 'producto_id': self.product_id,
            'contenido': {'kind': 'product', 'id': self.product_id, 'skus': [], 'images': [0]}}

    def save(self, **changes):
        response = self.api.post(self.url, {**self.payload, **changes}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data['data']

    def test_product_variants_images_price_description_and_slug_are_resolved_on_server(self):
        row = self.save()
        self.assertEqual(float(row['producto']['precio']), 80)
        self.assertTrue(row['producto']['desde'])
        self.assertEqual(len(row['producto']['variantes']), 2)
        self.assertEqual(row['producto']['descripcion'], 'Algodón')
        preview = self.api.get(self.url + row['id'] + '/vista-previa/').data['data']['html']
        self.assertIn('$80 CLP', preview)
        self.assertIn('/producto/' + self.slug, preview)
        self.assertIn('https://example.com/polera.png', preview)

    def test_individual_variant_changes_snapshot_and_client_price_injection_rejects(self):
        selection = {**self.payload['contenido'], 'skus': ['QA-L']}
        row = self.save(contenido=selection)
        self.assertEqual(float(row['producto']['precio']), 120)
        self.assertFalse(row['producto']['desde'])
        self.assertEqual(self.api.post(self.url, {**self.payload, 'clave': str(uuid.uuid4()), 'contenido': {**selection, 'precio': 1}}, format='json').status_code, 400)

    def test_unavailable_variants_and_invalid_image_indices_reject(self):
        for selection in ({'skus': ['NO-EXISTE']}, {'images': [99]}, {'images': [True]}, {'images': [0, 0]}):
            response = self.api.post(self.url, {**self.payload, 'contenido': {**self.payload['contenido'], **selection}}, format='json')
            self.assertEqual(response.status_code, 400, response.data)

    def test_inactive_product_rejects_and_mismatched_reference_cannot_be_saved(self):
        self.assertEqual(self.api.post(self.url, {**self.payload, 'producto_id': ''}, format='json').status_code, 400)
        self.repo.update(str(self.store.pk), self.product_id, {'activo': False})
        self.assertEqual(self.api.post(self.url, self.payload, format='json').status_code, 400)

    def test_services_and_workshops_use_published_section_and_preserve_content_on_reload(self):
        for kind in ('servicio', 'taller'):
            self.section['actividad']['tipo'] = kind
            self.config.contenido = {'bloques': [self.section]}; self.config.save()
            row = self.save(clave=str(uuid.uuid4()), producto_id='', contenido={'kind': 'section', 'id': self.section_id, 'skus': [], 'images': [0]})
            self.assertEqual(row['producto']['tipo'], 'seccion')
            response = self.api.get(self.url + row['id'] + '/')
            self.assertEqual(response.data['data']['producto'], row['producto'])
            html = self.api.get(self.url + row['id'] + '/vista-previa/').data['data']['html']
            self.assertIn('$25.000 CLP', html)
            self.assertIn('#seccion-' + self.section_id, html)
            self.assertIn('Descripción accesible', html)

    def test_hidden_cancelled_foreign_and_invalid_section_reject(self):
        for change in ({'visible': False}, {'actividad': {'estado': 'cancelada'}}):
            self.config.contenido = {'bloques': [{**self.section, **change}]}; self.config.save()
            self.assertEqual(self.api.post(self.url, {**self.payload, 'producto_id': '', 'contenido': {'kind': 'section', 'id': self.section_id, 'skus': [], 'images': []}}, format='json').status_code, 400)
        self.assertEqual(self.api.post(self.url, {**self.payload, 'producto_id': '', 'contenido': {'kind': 'section', 'id': 'invalid', 'skus': [], 'images': []}}, format='json').status_code, 400)

    def test_duplicate_submission_is_idempotent_and_saved_snapshots_are_not_overwritten(self):
        row = self.save()
        self.assertEqual(self.api.post(self.url, self.payload, format='json').status_code, 200)
        self.repo.update(str(self.store.pk), self.product_id, {'nombre': 'Nombre nuevo'})
        edited = self.api.put(self.url + row['id'] + '/', {**self.payload, 'revision': row['revision'], 'cuerpo': 'Otro texto'}, format='json')
        self.assertEqual(edited.status_code, 200, edited.data)
        self.assertEqual(edited.data['data']['producto'], row['producto'])
        self.assertEqual(CampanaPromocional.objects.count(), 1)

    def test_section_duplicate_submission_is_idempotent(self):
        self.payload.update(producto_id='', contenido={'kind': 'section', 'id': self.section_id, 'skus': [], 'images': []})
        row = self.save()
        again = self.api.post(self.url, self.payload, format='json')
        self.assertEqual(again.status_code, 200, again.data)
        self.assertEqual(again.data['data']['id'], row['id'])

    def test_library_image_is_checked_per_store_and_embedded_without_exposing_private_endpoint(self):
        resource = RecursoMultimedia.objects.create(tienda=self.store, tipo='imagen', titulo='Imagen', url='https://images.example/library.png')
        row = self.save(diseno={'recurso_id': str(resource.pk), 'plantilla': 'feature'})
        self.assertEqual(row['diseno']['imagen'], resource.url)
        resource.activo=False; resource.save()
        self.assertEqual(self.api.post(self.url, {**self.payload, 'diseno': {'recurso_id': str(resource.pk)}}, format='json').status_code, 400)

    def test_custom_links_resolve_real_slugs_and_visible_sections_only(self):
        for link in ('https://shop.example/plantilla/1/producto/' + self.slug, 'https://shop.example/plantilla/1#seccion-' + self.section_id):
            self.save(clave=str(uuid.uuid4()), diseno={'boton_url': link})
        for link in ('https://evil.example/plantilla/1', 'https://shop.example/plantilla/1#seccion-no-existe', 'https://shop.example/plantilla/1/producto/no-existe'):
            self.assertEqual(self.api.post(self.url, {**self.payload, 'diseno': {'boton_url': link}}, format='json').status_code, 400)

    def test_relative_media_uses_api_host_and_webp_is_supported(self):
        self.assertEqual(safe_image('/media/logo.png', 'https://shop.example/plantilla/1'), 'https://api.example/media/logo.png')
        stream = BytesIO(); Image.new('RGB', (2, 2), 'blue').save(stream, 'WEBP')
        image = 'data:image/webp;base64,' + base64.b64encode(stream.getvalue()).decode()
        self.assertEqual(safe_image(image, 'https://shop.example'), image)

    def test_legacy_product_snapshot_keeps_its_price_and_links_to_the_public_slug(self):
        row = self.save(contenido=None)
        self.assertNotIn('seleccion', row['producto'])
        html = self.api.get(self.url + row['id'] + '/vista-previa/').data['data']['html']
        self.assertIn('/producto/' + self.slug, html)
        self.assertNotIn('/producto/' + self.product_id, html)
