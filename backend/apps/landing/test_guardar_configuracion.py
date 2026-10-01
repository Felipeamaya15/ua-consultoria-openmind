from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.core.models import Tienda
from apps.landing.models import ConfiguracionLanding


class GuardarConfiguracionLandingAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = "/api/landing/configuracion/"

        self.propietario = get_user_model().objects.create_user(
            username="landing-owner",
            password="test-password",
        )

        self.tienda = Tienda.objects.create(
            nombre="Tienda Landing",
            id_usuario_propietario=self.propietario,
        )

    def datos_validos(self):
        return {
            "titulo": "Bienvenido a mi tienda",
            "descripcion": "Productos creados con dedicación.",
            "texto_boton": "Ver productos",
            "secciones": {
                "productos_destacados": True,
                "ubicacion": False,
            },
        }

    def test_propietario_puede_crear_configuracion(self):
        self.client.force_authenticate(user=self.propietario)

        response = self.client.put(
            self.url,
            self.datos_validos(),
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
        )

        configuracion = ConfiguracionLanding.objects.get(
            tienda=self.tienda
        )

        self.assertEqual(
            configuracion.titulo,
            "Bienvenido a mi tienda",
        )
        self.assertEqual(
            configuracion.texto_boton,
            "Ver productos",
        )

    def test_actualiza_configuracion_existente(self):
        ConfiguracionLanding.objects.create(
            tienda=self.tienda,
            titulo="Título anterior",
            texto_boton="Entrar",
        )

        self.client.force_authenticate(user=self.propietario)

        datos = self.datos_validos()
        datos["titulo"] = "Título actualizado"

        response = self.client.put(
            self.url,
            datos,
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.assertEqual(
            ConfiguracionLanding.objects.filter(
                tienda=self.tienda
            ).count(),
            1,
        )

        configuracion = ConfiguracionLanding.objects.get(
            tienda=self.tienda
        )

        self.assertEqual(
            configuracion.titulo,
            "Título actualizado",
        )

    def test_rechaza_datos_invalidos(self):
        self.client.force_authenticate(user=self.propietario)

        response = self.client.put(
            self.url,
            {
                "titulo": "   ",
                "texto_boton": "Ver productos",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.assertFalse(
            ConfiguracionLanding.objects.filter(
                tienda=self.tienda
            ).exists()
        )

    def test_rechaza_solicitud_no_autenticada(self):
        response = self.client.put(
            self.url,
            self.datos_validos(),
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_otro_usuario_no_puede_modificar_configuracion(self):
        otro_usuario = get_user_model().objects.create_user(
            username="otro-landing-user",
            password="test-password",
        )

        self.client.force_authenticate(user=otro_usuario)

        response = self.client.put(
            self.url,
            self.datos_validos(),
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
        )

        self.assertFalse(
            ConfiguracionLanding.objects.filter(
                tienda=self.tienda
            ).exists()
        )

    def test_no_permite_seleccionar_otra_tienda(self):
        self.client.force_authenticate(user=self.propietario)

        datos = self.datos_validos()
        datos["tienda_id"] = self.tienda.pk + 1000

        response = self.client.put(
            self.url,
            datos,
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.assertFalse(
            ConfiguracionLanding.objects.filter(
                tienda=self.tienda
            ).exists()
        )


    def test_guardado_se_consulta_publicamente_y_se_actualiza_sin_duplicar(self):
        self.client.force_authenticate(user=self.propietario)
        creada = self.client.put(self.url, self.datos_validos(), format="json")
        self.client.force_authenticate(user=None)
        consulta = self.client.get(self.url)
        self.assertEqual(consulta.data["data"], creada.data["data"])
        self.client.force_authenticate(user=self.propietario)
        datos = self.datos_validos()
        datos["titulo"] = "Valor persistido actualizado"
        actualizada = self.client.put(self.url, datos, format="json")
        self.assertEqual(actualizada.status_code, status.HTTP_200_OK)
        self.client.force_authenticate(user=None)
        consulta = self.client.get(self.url)
        self.assertEqual(consulta.data["data"]["titulo"], datos["titulo"])
        self.assertEqual(consulta.data["data"]["id"], creada.data["data"]["id"])
        self.assertEqual(ConfiguracionLanding.objects.count(), 1)

    def test_formulario_multipart_guarda_imagen_conserva_y_elimina(self):
        import io
        import tempfile
        from PIL import Image
        from django.core.files.uploadedfile import SimpleUploadedFile
        from django.test import override_settings
        import json

        with tempfile.TemporaryDirectory() as media, override_settings(MEDIA_ROOT=media):
            imagen = io.BytesIO()
            Image.new("RGB", (2, 2)).save(imagen, format="PNG")
            datos = self.datos_validos()
            datos["secciones"] = json.dumps(datos["secciones"])
            datos["imagen_principal"] = SimpleUploadedFile("hero.png", imagen.getvalue(), content_type="image/png")
            self.client.force_authenticate(user=self.propietario)
            creada = self.client.put(self.url, datos, format="multipart")
            self.assertEqual(creada.status_code, status.HTTP_201_CREATED, creada.data)
            archivo = ConfiguracionLanding.objects.get(tienda=self.tienda).imagen_principal
            self.assertTrue(archivo.storage.exists(archivo.name))
            del datos["imagen_principal"]
            actualizada = self.client.put(self.url, datos, format="multipart")
            self.assertEqual(actualizada.data["data"]["imagen_principal"], creada.data["data"]["imagen_principal"])
            datos["imagen_principal"] = ""
            eliminada = self.client.put(self.url, datos, format="multipart")
            self.assertIsNone(eliminada.data["data"]["imagen_principal"])
