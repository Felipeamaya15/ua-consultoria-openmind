import base64
import io

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image
from rest_framework.test import APIClient

from apps.core.models import Tienda


def _foto_jpeg(ancho, alto, calidad=88):
    imagen = Image.effect_noise((ancho, alto), 90).convert('RGB')
    salida = io.BytesIO()
    imagen.save(salida, 'JPEG', quality=calidad)
    return salida.getvalue()


class SubidaConReduccionAutomaticaTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='reduccion-owner')
        self.store = Tienda.objects.create(nombre='Tienda reduccion', id_usuario_propietario=self.owner)
        self.api = APIClient()
        self.api.force_authenticate(self.owner)

    def subir(self, datos, limite):
        return self.api.post('/api/tienda/imagenes/procesar/', {
            'imagen': SimpleUploadedFile('foto.jpg', datos, content_type='image/jpeg'), 'max_mb': limite}, format='multipart')

    def test_con_limite_12_una_foto_grande_se_reduce(self):
        datos = _foto_jpeg(3000, 2000)
        self.assertGreater(len(datos), 3 * 1024 * 1024)
        respuesta = self.subir(datos, 12)
        self.assertEqual(respuesta.status_code, 200, respuesta.data)
        resultado = respuesta.data['data']
        self.assertEqual(resultado['mime'], 'image/webp')
        peso = len(base64.b64decode(resultado['url'].split(',', 1)[1]))
        self.assertLessEqual(peso, 150 * 1024)

    def test_con_limite_2_una_foto_chica_queda_igual(self):
        datos = _foto_jpeg(900, 600, calidad=40)
        self.assertLess(len(datos), 2 * 1024 * 1024)
        respuesta = self.subir(datos, 2)
        self.assertEqual(respuesta.status_code, 200, respuesta.data)
        self.assertEqual(respuesta.data['data']['mime'], 'image/jpeg')
        self.assertEqual(base64.b64decode(respuesta.data['data']['url'].split(',', 1)[1]), datos)

    def test_con_limite_2_sigue_rechazando_una_foto_grande(self):
        respuesta = self.subir(_foto_jpeg(3000, 2000), 2)
        self.assertEqual(respuesta.status_code, 400)
