import io

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase
from PIL import Image

from apps.core import image_processing as ip


def _foto_jpeg(ancho, alto, calidad=88, exif=None):
    # ruido: casi no se comprime, es el peor caso para el peso
    imagen = Image.effect_noise((ancho, alto), 90).convert('RGB')
    salida = io.BytesIO()
    imagen.save(salida, 'JPEG', quality=calidad, **({'exif': exif} if exif else {}))
    return salida.getvalue()


class ReduccionAutomaticaDeFotosTests(SimpleTestCase):
    def test_una_foto_grande_baja_al_peso_objetivo(self):
        datos = _foto_jpeg(3000, 2000)
        self.assertGreater(len(datos), 2 * 1024 * 1024)
        resultado = ip.process_image(datos, name='foto.jpg', mime='image/jpeg', max_mb=12, optimize=True)
        self.assertLessEqual(len(resultado.data), ip.OPTIMIZE_TARGET_KB * 1024)
        self.assertEqual(resultado.mime, 'image/webp')

    def test_no_supera_el_lado_maximo(self):
        resultado = ip.process_image(_foto_jpeg(4000, 3000), name='f.jpg', mime='image/jpeg', max_mb=12, optimize=True)
        self.assertLessEqual(max(resultado.width, resultado.height), ip.OPTIMIZE_MAX_SIDE)

    def test_borra_la_ubicacion_gps(self):
        exif = Image.Exif()
        exif[0x0110] = 'SM-S918B'
        gps = exif.get_ifd(0x8825)
        gps[1], gps[2], gps[3], gps[4] = 'S', (33.0, 26.0, 20.0), 'W', (70.0, 38.0, 56.0)
        datos = _foto_jpeg(1500, 1000, exif=exif.tobytes())
        self.assertTrue(Image.open(io.BytesIO(datos)).getexif().get_ifd(0x8825))
        resultado = ip.process_image(datos, name='f.jpg', mime='image/jpeg', max_mb=12, optimize=True)
        guardado = Image.open(io.BytesIO(resultado.data)).getexif()
        self.assertFalse(guardado.get_ifd(0x8825))
        self.assertFalse(guardado.get(0x0110))

    def test_conserva_la_transparencia(self):
        imagen = Image.new('RGBA', (800, 600), (0, 0, 0, 0))
        salida = io.BytesIO()
        imagen.save(salida, 'PNG')
        resultado = ip.process_image(salida.getvalue(), name='logo.png', mime='image/png', max_mb=12, optimize=True)
        self.assertIn('A', Image.open(io.BytesIO(resultado.data)).getbands())

    def test_por_defecto_no_cambia_nada(self):
        datos = _foto_jpeg(1200, 800, calidad=50)
        resultado = ip.process_image(datos, name='f.jpg', mime='image/jpeg')
        self.assertEqual(resultado.data, datos)

    def test_sigue_rechazando_lo_que_supera_el_limite_de_entrada(self):
        with self.assertRaises(ValidationError):
            ip.process_image(_foto_jpeg(4000, 3000), name='f.jpg', mime='image/jpeg', max_mb=1, optimize=True)
