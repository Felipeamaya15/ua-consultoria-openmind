
import tempfile
from io import BytesIO
from uuid import UUID

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from apps.core.models import Tienda
from apps.landing.models import (
    ConfiguracionLanding,
    ImagenCarruselLanding,
)


class CarruselLandingTests(TestCase):
    url = '/api/landing/carrusel/'

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)

        media_settings = override_settings(
            MEDIA_ROOT=self.temp.name
        )
        media_settings.enable()
        self.addCleanup(media_settings.disable)

        User = get_user_model()

        self.owner = User.objects.create_user(
            username='carrusel-owner',
            password='test-password',
        )

        # Usuario sin autorización sobre la tienda.
        self.other = User.objects.create_user(
            username='carrusel-other',
            password='test-password',
        )

        # OpenMind admite una sola tienda por instalación.
        self.store = Tienda.objects.create(
            nombre='Tienda Carrusel',
            id_usuario_propietario=self.owner,
        )

        self.config = ConfiguracionLanding.objects.create(
            tienda=self.store,
            titulo='Mi tienda',
            texto_boton='Ver productos',
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)

    def image(self, name='portada.png'):
        buffer = BytesIO()

        Image.new(
            'RGB',
            (40, 30),
            '#3478b5',
        ).save(buffer, format='PNG')

        return SimpleUploadedFile(
            name,
            buffer.getvalue(),
            content_type='image/png',
        )

    def upload(self, name='portada.png', **values):
        return self.client.post(
            self.url,
            {
                'archivo': self.image(name),
                **values,
            },
            format='multipart',
        )

    def uploaded_id(self, name='portada.png', **values):
        response = self.upload(name, **values)

        self.assertEqual(
            response.status_code,
            201,
            response.data,
        )

        return response.data['data']['id']

    # ---------------------------------------------------------
    # 1. SUBIR IMÁGENES
    # ---------------------------------------------------------

    def test_slide_content_is_stable_after_reorder_reload_and_stale_landing_save(self):
        first, second = str(self.uploaded_id()), str(self.uploaded_id('otra.png'))
        payload = {'titulo': 'Título de imagen uno', 'descripcion': 'Subtítulo propio', 'texto_boton': 'Explorar', 'enlace': 'catalogo?categoria=Pruebas', 'mostrar_descripcion': False}
        response = self.client.patch(self.url + first + '/', {'contenido': payload}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        ordered = self.client.patch(self.url + 'orden/', {'ids': [second, first]}, format='json')
        self.assertEqual(ordered.status_code, 200, ordered.data)
        rows = self.client.get(self.url).data['data']
        self.assertEqual([row['id'] for row in rows], [second, first])
        self.assertEqual(rows[1]['contenido'], payload)
        stale = self.client.put('/api/landing/configuracion/', {'titulo': 'Otro título general', 'texto_boton': 'Ver', 'contenido': {'carrusel_contenido': {first: {'titulo': 'No sobrescribir'}}}}, format='json')
        self.assertEqual(stale.status_code, 200, stale.data)
        self.assertEqual(stale.data['data']['imagenes_carrusel'][1]['contenido'], payload)
        for link in ('javascript:alert(1)', '//evil.example/path', 'data:text/html,bad'):
            self.assertEqual(self.client.patch(self.url + first + '/', {'contenido': {'enlace': link}}, format='json').status_code, 400)
        self.assertEqual(self.client.get(self.url).data['data'][1]['contenido'], payload)

    def test_uploaded_library_video_is_reused_and_only_public_while_referenced_and_active(self):
        from apps.landing.test_media_library import MediaLibraryTests
        from apps.landing.models import RecursoMultimedia
        video = MediaLibraryTests.video_file(self)
        saved = self.client.post('/api/landing/biblioteca/', {'titulo': 'Clip', 'tipo': 'video', 'video': video}, format='multipart')
        self.assertEqual(saved.status_code, 201, saved.data)
        resource_id = saved.data['data']['id']
        public = APIClient()
        file_url = f'/api/landing/multimedia-publica/{resource_id}/imagen/'
        self.assertEqual(public.get(file_url).status_code, 404)
        added = self.client.post(self.url, {'recurso_id': resource_id}, format='json')
        self.assertEqual(added.status_code, 201, added.data)
        self.assertEqual(added.data['data']['tipo'], 'video')
        self.assertEqual(public.get(file_url).status_code, 200)
        pk = added.data['data']['id']
        self.assertEqual(self.client.patch(self.url + pk + '/', {'contenido': {'titulo': 'Video propio'}}, format='json').status_code, 200)
        resource = RecursoMultimedia.objects.get(pk=resource_id)
        resource.activo = False
        resource.save(update_fields=['activo'])
        self.assertEqual(public.get(file_url).status_code, 404)
        self.assertFalse(public.get('/api/landing/configuracion/').data['data']['imagenes_carrusel'])
        resource.activo = True
        resource.save(update_fields=['activo'])
        self.assertEqual(public.get('/api/landing/configuracion/').data['data']['imagenes_carrusel'][0]['contenido']['titulo'], 'Video propio')
        self.assertEqual(self.client.delete(self.url + pk + '/').status_code, 200)
        self.assertTrue(resource.archivo.archivo.storage.exists(resource.archivo.archivo.name))
        self.assertEqual(public.get(file_url).status_code, 404)

    def test_propietario_puede_subir_imagen(self):
        imagen_id = self.uploaded_id(
            texto_alternativo='Productos artesanales'
        )

        imagen = ImagenCarruselLanding.objects.get(
            pk=imagen_id
        )

        self.assertEqual(imagen.configuracion, self.config)
        self.assertEqual(imagen.orden, 0)

        self.assertEqual(
            imagen.texto_alternativo,
            'Productos artesanales',
        )

        self.assertTrue(imagen.archivo.name)

    # ---------------------------------------------------------
    # 2. CONSULTAR IMÁGENES
    # ---------------------------------------------------------

    def test_propietario_puede_consultar_imagenes(self):
        self.uploaded_id('primera.png')
        self.uploaded_id('segunda.png')

        response = self.client.get(self.url)

        self.assertEqual(
            response.status_code,
            200,
            response.data,
        )

        self.assertEqual(len(response.data['data']), 2)

        self.assertEqual(
            [imagen['orden'] for imagen in response.data['data']],
            [0, 1],
        )

    # ---------------------------------------------------------
    # 3. INTEGRACIÓN CON CONFIGURACIÓN LANDING
    # ---------------------------------------------------------

    def test_configuracion_incluye_imagenes(self):
        self.uploaded_id()

        response = self.client.get(
            '/api/landing/configuracion/'
        )

        self.assertEqual(
            response.status_code,
            200,
            response.data,
        )

        self.assertIn(
            'imagenes_carrusel',
            response.data['data'],
        )

        self.assertEqual(
            len(response.data['data']['imagenes_carrusel']),
            1,
        )

    # ---------------------------------------------------------
    # 4. REORDENAR IMÁGENES
    # ---------------------------------------------------------

    def test_reordenar_imagenes(self):
        primera = self.uploaded_id('primera.png')
        segunda = self.uploaded_id('segunda.png')
        tercera = self.uploaded_id('tercera.png')

        nuevo_orden = [tercera, primera, segunda]

        response = self.client.patch(
            self.url + 'orden/',
            {'ids': nuevo_orden},
            format='json',
        )

        self.assertEqual(
            response.status_code,
            200,
            response.data,
        )

        guardadas = list(
            ImagenCarruselLanding.objects.filter(
                configuracion=self.config
            ).values_list('id', flat=True)
        )

        self.assertEqual(
            guardadas,
            [UUID(str(value)) for value in nuevo_orden],
        )

    # ---------------------------------------------------------
    # 5. RECHAZAR ÓRDENES INVÁLIDOS
    # ---------------------------------------------------------

    def test_rechazar_orden_incompleto_o_repetido(self):
        primera = self.uploaded_id('primera.png')
        self.uploaded_id('segunda.png')

        for ids in [
            [primera],
            [primera, primera],
        ]:
            with self.subTest(ids=ids):
                response = self.client.patch(
                    self.url + 'orden/',
                    {'ids': ids},
                    format='json',
                )

                self.assertEqual(
                    response.status_code,
                    400,
                    response.data,
                )

    # ---------------------------------------------------------
    # 6. ELIMINAR IMÁGENES
    # ---------------------------------------------------------

    def test_eliminar_imagen(self):
        imagen_id = self.uploaded_id('eliminar.png')

        imagen = ImagenCarruselLanding.objects.get(
            pk=imagen_id
        )

        storage = imagen.archivo.storage
        filename = imagen.archivo.name

        self.assertTrue(storage.exists(filename))

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.delete(
                self.url + str(imagen_id) + '/'
            )

        self.assertEqual(
            response.status_code,
            200,
            response.data,
        )

        self.assertFalse(
            ImagenCarruselLanding.objects.filter(
                pk=imagen_id
            ).exists()
        )

        self.assertFalse(storage.exists(filename))

    # ---------------------------------------------------------
    # 7. VALIDAR ARCHIVOS
    # ---------------------------------------------------------

    def test_rechazar_archivos_invalidos(self):
        missing = self.client.post(
            self.url,
            {},
            format='multipart',
        )

        self.assertEqual(missing.status_code, 400)

        invalid = SimpleUploadedFile(
            'archivo.png',
            b'no-es-una-imagen',
            content_type='image/png',
        )

        response = self.client.post(
            self.url,
            {'archivo': invalid},
            format='multipart',
        )

        self.assertEqual(
            response.status_code,
            400,
            response.data,
        )

        texto_largo = self.upload(
            texto_alternativo='A' * 251
        )

        self.assertEqual(
            texto_largo.status_code,
            400,
            texto_largo.data,
        )

        self.assertEqual(
            ImagenCarruselLanding.objects.count(),
            0,
        )

    # ---------------------------------------------------------
    # 8. LÍMITE MÁXIMO DE IMÁGENES
    # ---------------------------------------------------------

    def test_limite_ocho_imagenes(self):
        for index in range(8):
            self.uploaded_id(f'foto-{index}.png')

        novena = self.upload('novena.png')

        self.assertEqual(
            novena.status_code,
            400,
            novena.data,
        )

        self.assertEqual(
            ImagenCarruselLanding.objects.count(),
            8,
        )

    # ---------------------------------------------------------
    # 9. BLOQUEAR USUARIOS QUE NO SON PROPIETARIOS
    # ---------------------------------------------------------

    def test_otro_usuario_no_administra_carrusel(self):
        imagen_id = self.uploaded_id('privada.png')

        self.client.force_authenticate(user=self.other)

        listado = self.client.get(self.url)

        self.assertEqual(
            listado.status_code,
            403,
            listado.data,
        )

        subida = self.upload('otra.png')

        self.assertEqual(
            subida.status_code,
            403,
            subida.data,
        )

        eliminacion = self.client.delete(
            self.url + str(imagen_id) + '/'
        )

        self.assertEqual(
            eliminacion.status_code,
            403,
            eliminacion.data,
        )

        orden = self.client.patch(
            self.url + 'orden/',
            {'ids': [imagen_id]},
            format='json',
        )

        self.assertEqual(
            orden.status_code,
            403,
            orden.data,
        )

        self.assertTrue(
            ImagenCarruselLanding.objects.filter(
                pk=imagen_id
            ).exists()
        )

    # ---------------------------------------------------------
    # 10. BLOQUEAR USUARIOS ANÓNIMOS
    # ---------------------------------------------------------

    def test_usuario_anonimo_no_administra_carrusel(self):
        anonimo = APIClient()

        listado = anonimo.get(self.url)

        subida = anonimo.post(
            self.url,
            {'archivo': self.image()},
            format='multipart',
        )

        self.assertIn(
            listado.status_code,
            (401, 403),
        )

        self.assertIn(
            subida.status_code,
            (401, 403),
        )

    # ---------------------------------------------------------
    # 11. RECHAZAR IDENTIFICADOR DE TIENDA INCORRECTO
    # ---------------------------------------------------------

    def test_rechazar_identificador_tienda_incorrecto(self):
        response = self.client.get(
            self.url,
            HTTP_X_TIENDA_ID='999999',
        )

        self.assertEqual(
            response.status_code,
            400,
            response.data,
        )

    # ---------------------------------------------------------
    # 12. RECHAZAR INSTALACIÓN CON VARIAS TIENDAS
    # ---------------------------------------------------------

    def test_rechazar_configuracion_con_varias_tiendas(self):
        Tienda.objects.create(
            nombre='Segunda Tienda',
            id_usuario_propietario=self.other,
        )

        response = self.client.get(self.url)

        self.assertEqual(
            response.status_code,
            503,
            response.data,
        )

        self.assertEqual(
            ImagenCarruselLanding.objects.count(),
            0,
        )
