from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.core.models import Tienda
from apps.visual_config.models import ConfiguracionVisual


class LogoNegocioTests(TestCase):
    def setUp(self):
        self.propietario = get_user_model().objects.create_user(
            username="logo-owner",
            password="test-password",
        )

        self.tienda = Tienda.objects.create(
            nombre="Tienda Logo",
            id_usuario_propietario=self.propietario,
        )

    def test_logo_vacio_por_defecto(self):
        configuracion = ConfiguracionVisual.objects.create(
            tienda=self.tienda,
        )

        self.assertEqual(configuracion.logo_negocio, "")

    def test_guarda_logo_del_negocio(self):
        logo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB"

        ConfiguracionVisual.objects.create(
            tienda=self.tienda,
            logo_negocio=logo,
        )

        recuperada = ConfiguracionVisual.objects.get(tienda=self.tienda)

        self.assertEqual(recuperada.logo_negocio, logo)

    def test_reemplaza_logo_del_negocio(self):
        configuracion = ConfiguracionVisual.objects.create(
            tienda=self.tienda,
            logo_negocio="data:image/png;base64,LOGO_ANTERIOR",
        )

        configuracion.logo_negocio = "data:image/png;base64,LOGO_NUEVO"
        configuracion.save(update_fields=["logo_negocio"])
        configuracion.refresh_from_db()

        self.assertEqual(
            configuracion.logo_negocio,
            "data:image/png;base64,LOGO_NUEVO",
        )

    def test_permite_quitar_logo(self):
        configuracion = ConfiguracionVisual.objects.create(
            tienda=self.tienda,
            logo_negocio="data:image/png;base64,LOGO",
        )

        configuracion.logo_negocio = ""
        configuracion.save(update_fields=["logo_negocio"])
        configuracion.refresh_from_db()

        self.assertEqual(configuracion.logo_negocio, "")

    def test_modificar_logo_no_altera_otras_configuraciones(self):
        personalizacion = {
            "editorial": {
                "primaryColor": "#111111",
                "secondaryColor": "#ffffff",
            }
        }

        configuracion = ConfiguracionVisual.objects.create(
            tienda=self.tienda,
            plantilla_seleccionada="editorial",
            personalizacion=personalizacion,
            logo_negocio="data:image/png;base64,LOGO_1",
        )

        configuracion.logo_negocio = "data:image/png;base64,LOGO_2"
        configuracion.save(update_fields=["logo_negocio"])
        configuracion.refresh_from_db()

        self.assertEqual(configuracion.plantilla_seleccionada, "editorial")
        self.assertEqual(configuracion.personalizacion, personalizacion)
        self.assertEqual(
            configuracion.logo_negocio,
            "data:image/png;base64,LOGO_2",
        )
