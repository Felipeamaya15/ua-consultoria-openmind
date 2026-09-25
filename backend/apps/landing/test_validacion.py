from django.test import SimpleTestCase

from apps.landing.serializers import ConfiguracionLandingSerializer


class ConfiguracionLandingSerializerTests(SimpleTestCase):
    def datos_validos(self):
        return {
            'titulo': 'Mi emprendimiento',
            'descripcion': 'Productos hechos con dedicación.',
            'texto_boton': 'Ver productos',
            'imagen_principal': 'imagen-principal.jpg',
            'secciones': {
                'productos_destacados': True,
                'ubicacion': False,
            },
        }

    def test_acepta_configuracion_valida(self):
        serializer = ConfiguracionLandingSerializer(
            data=self.datos_validos()
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_rechaza_titulo_vacio(self):
        datos = self.datos_validos()
        datos['titulo'] = '   '

        serializer = ConfiguracionLandingSerializer(data=datos)

        self.assertFalse(serializer.is_valid())
        self.assertIn('titulo', serializer.errors)

    def test_rechaza_titulo_mayor_a_255_caracteres(self):
        datos = self.datos_validos()
        datos['titulo'] = 'A' * 256

        serializer = ConfiguracionLandingSerializer(data=datos)

        self.assertFalse(serializer.is_valid())
        self.assertIn('titulo', serializer.errors)

    def test_rechaza_texto_boton_vacio(self):
        datos = self.datos_validos()
        datos['texto_boton'] = '   '

        serializer = ConfiguracionLandingSerializer(data=datos)

        self.assertFalse(serializer.is_valid())
        self.assertIn('texto_boton', serializer.errors)

    def test_rechaza_texto_boton_mayor_a_100_caracteres(self):
        datos = self.datos_validos()
        datos['texto_boton'] = 'A' * 101

        serializer = ConfiguracionLandingSerializer(data=datos)

        self.assertFalse(serializer.is_valid())
        self.assertIn('texto_boton', serializer.errors)

    def test_rechaza_secciones_si_no_es_objeto(self):
        datos = self.datos_validos()
        datos['secciones'] = [
            'productos_destacados',
            'ubicacion',
        ]

        serializer = ConfiguracionLandingSerializer(data=datos)

        self.assertFalse(serializer.is_valid())
        self.assertIn('secciones', serializer.errors)

    def test_permite_secciones_vacias(self):
        datos = self.datos_validos()
        datos['secciones'] = {}

        serializer = ConfiguracionLandingSerializer(data=datos)

        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_permite_descripcion_e_imagen_vacias(self):
        datos = self.datos_validos()
        datos['descripcion'] = ''
        datos['imagen_principal'] = ''

        serializer = ConfiguracionLandingSerializer(data=datos)

        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_rechaza_configuracion_sin_titulo(self):
        datos = self.datos_validos()
        datos.pop('titulo')

        serializer = ConfiguracionLandingSerializer(data=datos)

        self.assertFalse(serializer.is_valid())
        self.assertIn('titulo', serializer.errors)

    def test_rechaza_configuracion_sin_texto_boton(self):
        datos = self.datos_validos()
        datos.pop('texto_boton')

        serializer = ConfiguracionLandingSerializer(data=datos)

        self.assertFalse(serializer.is_valid())
        self.assertIn('texto_boton', serializer.errors)