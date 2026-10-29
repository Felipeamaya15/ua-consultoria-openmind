import base64
import tempfile
from io import BytesIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from apps.core.image_processing import process_image, process_data_url
from apps.core.models import Tienda
from apps.landing.models import ConfiguracionLanding


def fixture(format='HEIF', size=(90, 160), orientation=None):
    image = Image.new('RGB', size, '#224466')
    # Distinct corners make accidental rotation visible in manual evidence.
    image.paste('#f97316', (0, 0, 35, 35))
    output = BytesIO()
    options = {}
    if orientation:
        exif = Image.Exif(); exif[274] = orientation
        options['exif'] = exif
    image.save(output, format=format, **options)
    return output.getvalue()


class ImageProcessingTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='image-owner')
        self.store = Tienda.objects.create(nombre='Imágenes QA', id_usuario_propietario=self.owner)
        self.api = APIClient(); self.api.force_authenticate(self.owner)

    def upload(self, raw=None, name='iphone.heic', mime='image/heic', limit=2, api=None):
        return (api or self.api).post('/api/tienda/imagenes/procesar/', {
            'imagen': SimpleUploadedFile(name, raw if raw is not None else fixture(), content_type=mime), 'max_mb': limit}, format='multipart')

    def test_existing_web_formats_and_both_iphone_extensions(self):
        for fmt, extension, mime in [('JPEG','jpg','image/jpeg'),('PNG','png','image/png'),('WEBP','webp','image/webp'),('HEIF','heic','image/heic'),('HEIF','heif','image/heif')]:
            with self.subTest(fmt=fmt, extension=extension):
                response = self.upload(fixture(fmt), f'foto.{extension}', mime)
                self.assertEqual(response.status_code, 200, response.data)
                result = response.data['data']
                self.assertEqual(result['mime'], 'image/webp' if fmt == 'HEIF' else mime)
                self.assertEqual(result['convertida'], fmt == 'HEIF')
                normalized = process_data_url(result['url'])
                self.assertEqual((normalized.width, normalized.height), (90, 160))
                self.assertEqual(response['Cache-Control'], 'no-store')

    def test_empty_ios_mime_is_checked_by_content(self):
        result = process_image(fixture(), name='IMG.HEIC', mime='application/octet-stream')
        self.assertEqual(result.mime, 'image/webp')

    def test_rejects_corrupt_spoofed_and_raw_files(self):
        for raw, name, mime in [(b'broken','foto.heic','image/heic'),(fixture('PNG'),'foto.jpg','image/jpeg'),(fixture(),'foto.heic','image/png'),(fixture(),'foto.dng','image/heic'),(fixture('PNG'),'foto.heic','image/heic')]:
            with self.subTest(name=name, mime=mime):
                self.assertEqual(self.upload(raw,name,mime).status_code, 400)

    def test_original_byte_limit_and_dimensions(self):
        response = self.upload(b'x'*(1024*1024+1),limit=1)
        self.assertEqual(response.status_code, 400)
        self.assertIn('1 MB', str(response.data))
        with patch('apps.core.image_processing.MAX_PIXELS', 100):
            self.assertEqual(self.upload().status_code, 400)

    def test_orientation_is_normalized_once_and_exif_is_not_published(self):
        result = process_image(fixture(orientation=6), name='portrait.heic', mime='image/heic')
        with Image.open(BytesIO(result.data)) as image:
            self.assertEqual(image.size, (90, 160))
            self.assertIsNone(image.getexif().get(274))
            # The already oriented source is not rotated a second time.
            r,g,b = image.convert('RGB').getpixel((12,12))
            self.assertGreater(r,b)

    def test_owner_only_and_never_creates_landing_during_conversion(self):
        api = APIClient()
        self.assertEqual(self.upload(api=api).status_code, 401)
        api.force_authenticate(get_user_model().objects.create_user(username='not-image-owner'))
        self.assertEqual(self.upload(api=api).status_code, 403)
        self.assertFalse(ConfiguracionLanding.objects.exists())

    def test_direct_landing_upload_persists_webp_and_survives_fresh_public_read(self):
        with tempfile.TemporaryDirectory() as media, override_settings(MEDIA_ROOT=media):
            response = self.api.put('/api/landing/configuracion/', {'titulo':'Imagen QA','descripcion':'Foto vertical','texto_boton':'Ver productos','secciones':'{}',
                'imagen_principal':SimpleUploadedFile('iphone.heif',fixture(),content_type='image/heif'),
                'logo':SimpleUploadedFile('logo.heic',fixture(),content_type='image/heic')},format='multipart')
            self.assertEqual(response.status_code,201,response.data)
            config=ConfiguracionLanding.objects.get(tienda=self.store)
            for field in [config.imagen_principal,config.logo]:
                self.assertTrue(field.name.endswith('.webp'))
                with field.open('rb') as stored, Image.open(stored) as image:
                    self.assertEqual(image.format,'WEBP');self.assertEqual(image.size,(90,160))
            public=APIClient().get('/api/landing/configuracion/')
            self.assertEqual(public.status_code,200)
            self.assertTrue(public.data['data']['imagen_principal'].endswith('.webp'))

    def test_direct_section_upload_is_saved_once_as_webp(self):
        from apps.landing.block_images import store_block_images
        with tempfile.TemporaryDirectory() as media, override_settings(MEDIA_ROOT=media):
            data='data:image/heic;base64,'+base64.b64encode(fixture()).decode()
            content={'bloques':[{'id':'706d696e-6400-4000-8000-000000000001','imagenes':[{'src':data}]}]}
            stored=store_block_images(content,self.store.pk)
            self.assertTrue(stored['bloques'][0]['imagenes'][0]['src'].endswith('.webp'))
            self.assertEqual(store_block_images(content,self.store.pk),stored)
            self.assertEqual(content['bloques'][0]['imagenes'][0]['src'],data)

    def test_product_serializers_normalize_before_persistence(self):
        from apps.catalog.presentation.serializers import ProductCreateSerializer, ProductImageSerializer
        data='data:image/heif;base64,'+base64.b64encode(fixture()).decode()
        image=ProductImageSerializer(data={'imagen':data})
        self.assertTrue(image.is_valid(),image.errors)
        self.assertTrue(image.validated_data['imagen'].startswith('data:image/webp;'))
        product=ProductCreateSerializer(data={'nombre':'Foto','categoria':'QA','imagenes':[data], 'variantes':[{'sku':'IMG-QA','precio':10,'stock':1}]})
        self.assertTrue(product.is_valid(),product.errors)
        self.assertTrue(product.validated_data['imagenes'][0].startswith('data:image/webp;'))
