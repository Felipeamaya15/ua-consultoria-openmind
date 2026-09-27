from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.core.models import Tienda, Usuario
from apps.landing.models import ConfiguracionLanding


class ConfiguracionLandingTests(TestCase):
    def setUp(self):
        self.propietario = Usuario.objects.create(
            correo='landing@example.test', password_hash='test',
            nombre='Nombre', apellido='Apellido', rol='admin',
        )
        self.tienda = Tienda.objects.create(
            nombre='Mi tienda', id_usuario_propietario=self.propietario,
        )

    def configurar(self, **datos):
        return ConfiguracionLanding.objects.create(**{
            'tienda': self.tienda,
            'titulo': 'Bienvenido',
            'texto_boton': 'Ver productos',
            **datos,
        })

    def test_guarda_y_recupera_todos_los_datos_y_la_asociacion(self):
        secciones = {'Productos destacados': True, 'Mapa / ubicación': False}
        imagen = 'data:image/png;base64,aW1hZ2Vu'
        creada = self.configurar(
            descripcion='Descripción de la landing', imagen_principal=imagen,
            secciones=secciones,
        )
        recuperada = ConfiguracionLanding.objects.get(tienda=self.tienda)
        self.assertEqual(recuperada.pk, creada.pk)
        self.assertEqual(recuperada.titulo, 'Bienvenido')
        self.assertEqual(recuperada.descripcion, 'Descripción de la landing')
        self.assertEqual(recuperada.texto_boton, 'Ver productos')
        self.assertEqual(recuperada.imagen_principal, imagen)
        self.assertEqual(recuperada.secciones, secciones)
        self.assertEqual(recuperada.tienda, self.tienda)
        self.assertEqual(Tienda.objects.get(pk=self.tienda.pk).configuracion_landing, recuperada)

    def test_actualiza_y_recupera_la_configuracion(self):
        config = self.configurar()
        config.titulo = 'Nuevo título'
        config.descripcion = 'Nueva descripción'
        config.texto_boton = 'Entrar'
        config.imagen_principal = 'https://example.test/imagen.png'
        config.secciones = {'Categorías': True}
        config.save()
        config.refresh_from_db()
        self.assertEqual(config.titulo, 'Nuevo título')
        self.assertEqual(config.descripcion, 'Nueva descripción')
        self.assertEqual(config.texto_boton, 'Entrar')
        self.assertEqual(config.imagen_principal, 'https://example.test/imagen.png')
        self.assertEqual(config.secciones, {'Categorías': True})

    def test_rechaza_segunda_configuracion_y_conserva_la_original(self):
        original = self.configurar()
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.configurar(titulo='Duplicada')
        self.assertEqual(ConfiguracionLanding.objects.count(), 1)
        self.assertEqual(ConfiguracionLanding.objects.get(tienda=self.tienda), original)

    def test_rechaza_configuracion_sin_tienda(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.configurar(tienda=None)
        self.assertFalse(ConfiguracionLanding.objects.exists())

    def test_rechaza_referencia_a_tienda_inexistente(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            ConfiguracionLanding.objects.create(tienda_id=self.tienda.pk + 1000, titulo='Inválida')
            # PostgreSQL difiere la comprobación de esta FK hasta cerrar la transacción.
            transaction.get_connection().check_constraints()
        self.assertFalse(ConfiguracionLanding.objects.exists())

    def test_no_crea_configuracion_automaticamente(self):
        self.assertFalse(ConfiguracionLanding.objects.filter(tienda=self.tienda).exists())

    def test_secciones_por_defecto_no_se_comparten_entre_instancias(self):
        primera = ConfiguracionLanding(tienda=self.tienda)
        segunda = ConfiguracionLanding(tienda=self.tienda)
        primera.secciones['Beneficios'] = True
        self.assertEqual(segunda.secciones, {})
        guardada = self.configurar()
        guardada.refresh_from_db()
        self.assertEqual(guardada.secciones, {})

    def test_eliminar_configuracion_conserva_tienda_y_propietario(self):
        self.configurar().delete()
        self.tienda.refresh_from_db()
        self.assertEqual(self.tienda.id_usuario_propietario_id, self.propietario.pk)
        self.assertTrue(Usuario.objects.filter(pk=self.propietario.pk).exists())

    def test_eliminar_tienda_elimina_su_configuracion(self):
        self.configurar()
        self.tienda.delete()
        self.assertFalse(ConfiguracionLanding.objects.exists())
        self.assertTrue(Usuario.objects.filter(pk=self.propietario.pk).exists())
