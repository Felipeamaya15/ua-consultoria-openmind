from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.core.models import Tienda, Usuario
from apps.visual_config.models import ConfiguracionVisual


class ConfiguracionVisualTests(TestCase):
    def setUp(self):
        self.propietario = Usuario.objects.create(
            correo='visual@example.test',
            password_hash='test',
            nombre='Nombre',
            apellido='Apellido',
            rol='admin',
        )

        self.tienda = Tienda.objects.create(
            nombre='Mi tienda',
            id_usuario_propietario=self.propietario,
        )

    def crear_configuracion(self, **datos):
        return ConfiguracionVisual.objects.create(
            tienda=self.tienda,
            **datos,
        )

    def test_guarda_y_recupera_configuracion_visual(self):
        personalizacion = {
            'editorial': {
                'primaryColor': '#1a3a6b',
                'secondaryColor': '#eef1f8',
                'accentColor': '#e04b1a',
                'paletteName': 'Original',
            }
        }

        creada = self.crear_configuracion(
            plantilla_seleccionada='editorial',
            personalizacion=personalizacion,
        )

        recuperada = ConfiguracionVisual.objects.get(tienda=self.tienda)

        self.assertEqual(recuperada.pk, creada.pk)
        self.assertEqual(recuperada.tienda, self.tienda)
        self.assertEqual(recuperada.plantilla_seleccionada, 'editorial')
        self.assertEqual(recuperada.personalizacion, personalizacion)
        self.assertEqual(
            self.tienda.configuracion_visual,
            recuperada,
        )

    def test_permite_configuracion_inicial_vacia(self):
        config = self.crear_configuracion()

        self.assertEqual(config.plantilla_seleccionada, '')
        self.assertEqual(config.personalizacion, {})

    def test_acepta_las_cuatro_plantillas_definidas(self):
        plantillas = ('editorial', 'minimal', 'visual', 'catalog')

        for plantilla in plantillas:
            with self.subTest(plantilla=plantilla):
                config = ConfiguracionVisual(
                    tienda=self.tienda,
                    plantilla_seleccionada=plantilla,
                )
                config.full_clean()

    def test_rechaza_identificador_de_plantilla_desconocido(self):
        config = ConfiguracionVisual(
            tienda=self.tienda,
            plantilla_seleccionada='plantilla-inexistente',
        )

        with self.assertRaises(ValidationError):
            config.full_clean()

    def test_rechaza_segunda_configuracion_para_la_misma_tienda(self):
        original = self.crear_configuracion(
            plantilla_seleccionada='editorial',
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            self.crear_configuracion(
                plantilla_seleccionada='minimal',
            )

        self.assertEqual(ConfiguracionVisual.objects.count(), 1)
        self.assertEqual(
            ConfiguracionVisual.objects.get(tienda=self.tienda),
            original,
        )

    def test_rechaza_configuracion_sin_tienda(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            ConfiguracionVisual.objects.create(
                plantilla_seleccionada='editorial',
            )

    def test_conserva_personalizaciones_de_varias_plantillas(self):
        personalizacion = {
            'editorial': {
                'primaryColor': '#111111',
                'secondaryColor': '#222222',
                'accentColor': '#333333',
                'paletteName': 'Editorial personalizada',
            },
            'minimal': {
                'primaryColor': '#aaaaaa',
                'secondaryColor': '#bbbbbb',
                'accentColor': '#cccccc',
                'paletteName': 'Minimal personalizada',
            },
        }

        config = self.crear_configuracion(
            plantilla_seleccionada='editorial',
            personalizacion=personalizacion,
        )

        config.refresh_from_db()

        self.assertEqual(
            config.personalizacion['editorial']['primaryColor'],
            '#111111',
        )
        self.assertEqual(
            config.personalizacion['minimal']['primaryColor'],
            '#aaaaaa',
        )

    def test_actualizar_una_plantilla_no_elimina_las_demas(self):
        config = self.crear_configuracion(
            plantilla_seleccionada='editorial',
            personalizacion={
                'editorial': {
                    'primaryColor': '#111111',
                },
                'minimal': {
                    'primaryColor': '#222222',
                },
            },
        )

        personalizacion = config.personalizacion.copy()
        personalizacion['editorial'] = {
            **personalizacion['editorial'],
            'primaryColor': '#ffffff',
        }

        config.personalizacion = personalizacion
        config.save()
        config.refresh_from_db()

        self.assertEqual(
            config.personalizacion['editorial']['primaryColor'],
            '#ffffff',
        )
        self.assertEqual(
            config.personalizacion['minimal']['primaryColor'],
            '#222222',
        )

    def test_eliminar_tienda_elimina_su_configuracion_visual(self):
        self.crear_configuracion(
            plantilla_seleccionada='catalog',
        )

        self.tienda.delete()

        self.assertEqual(ConfiguracionVisual.objects.count(), 0)