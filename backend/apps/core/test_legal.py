"""Pruebas para los editores y consulta de páginas legales (Términos, Privacidad, Reembolsos)."""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework.authtoken.models import Token

from apps.core.models import Tienda, ConfiguracionLegal
from apps.core.legal import TERMS_DEFAULT, PRIVACY_DEFAULT, REFUND_DEFAULT


class LegalPagesAPITestCase(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.propietario = User.objects.create_user(
            username='propietario_legal',
            email='legal_owner@example.com',
            password='password123',
            is_active=True,
        )
        self.otro_usuario = User.objects.create_user(
            username='otro_usuario',
            email='otro@example.com',
            password='password123',
            is_active=True,
        )
        self.token_propietario = Token.objects.create(user=self.propietario)
        self.token_otro = Token.objects.create(user=self.otro_usuario)

        self.tienda = Tienda.objects.create(
            id_usuario_propietario=self.propietario,
            nombre='Tienda Legal Test',
            descripcion='Tienda para pruebas legales',
        )

    def test_consulta_publica_paginas_por_defecto(self):
        """Verifica que un visitante público pueda consultar las páginas legales predeterminadas."""
        response = self.client.get('/api/legal/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['exito'])

        data = response.data['data']
        self.assertIn('terms', data)
        self.assertIn('privacy', data)
        self.assertIn('refund', data)

        self.assertEqual(data['terms']['title'], 'Términos y Condiciones')
        self.assertIn('1. Aceptación de los términos', data['terms']['published'])
        self.assertNotIn('draft', data['terms'], 'La consulta pública no debe exponer borradores')

        self.assertEqual(data['privacy']['title'], 'Política de Privacidad')
        self.assertIn('1. Información que recopilamos', data['privacy']['published'])

        self.assertEqual(data['refund']['title'], 'Política de Reembolso')
        self.assertIn('1. Derecho a devolución', data['refund']['published'])

    def test_consulta_publica_detalle_por_tipo_y_alias(self):
        """Verifica la consulta individual por clave y alias en español."""
        for endpoint, title_expected in [
            ('/api/legal/terms/', 'Términos y Condiciones'),
            ('/api/legal/terminos/', 'Términos y Condiciones'),
            ('/api/legal/privacy/', 'Política de Privacidad'),
            ('/api/legal/privacidad/', 'Política de Privacidad'),
            ('/api/legal/refund/', 'Política de Reembolso'),
            ('/api/legal/reembolso/', 'Política de Reembolso'),
        ]:
            response = self.client.get(endpoint)
            self.assertEqual(response.status_code, status.HTTP_200_OK, f"Fallo al consultar {endpoint}")
            self.assertEqual(response.data['data']['title'], title_expected)

        # Consulta con tipo inválido devuelve 404
        bad_response = self.client.get('/api/legal/invalido/')
        self.assertEqual(bad_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_configuracion_admin_requiere_propietario(self):
        """Verifica que usuarios anónimos o clientes no puedan acceder a la configuración del editor."""
        # Anónimo
        response = self.client.get('/api/legal/configuracion/')
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

        # Usuario no propietario
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_otro.key}')
        response_otro = self.client.get('/api/legal/configuracion/')
        self.assertEqual(response_otro.status_code, status.HTTP_403_FORBIDDEN)

        # Propietario autorizado
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_propietario.key}')
        response_owner = self.client.get('/api/legal/configuracion/')
        self.assertEqual(response_owner.status_code, status.HTTP_200_OK)
        self.assertIn('draft', response_owner.data['data']['terms'])

    def test_editar_guardar_borrador_terminos(self):
        """Verifica que el emprendedor pueda guardar un borrador sin publicar cambios."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_propietario.key}')

        nuevo_borrador = "**1. Nuevos términos en borrador**\n\nTexto aún no publicado."
        payload = {
            'tipo': 'terms',
            'draft': nuevo_borrador,
            'accion': 'draft',
        }
        res = self.client.put('/api/legal/configuracion/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['data']['terms']['draft'], nuevo_borrador)
        # Lo publicado debe seguir siendo el original
        self.assertNotEqual(res.data['data']['terms']['published'], nuevo_borrador)

        # La consulta pública todavía no debe ver el borrador
        public_res = self.client.get('/api/legal/terms/')
        self.assertNotIn('Texto aún no publicado', public_res.data['data']['published'])

    def test_publicar_terminos_y_condiciones_refleja_en_publico(self):
        """Verifica que al publicar términos, estos se persistan y sean visibles para compradores."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_propietario.key}')

        texto_publicado = "**1. Términos Actualizados 2026**\n\nCondiciones vigentes para compras online."
        payload = {
            'tipo': 'terms',
            'draft': texto_publicado,
            'accion': 'publish',
        }
        res = self.client.put('/api/legal/configuracion/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['data']['terms']['published'], texto_publicado)
        self.assertEqual(res.data['data']['terms']['draft'], texto_publicado)

        # Consulta pública ahora muestra el texto actualizado
        public_res = self.client.get('/api/legal/terms/')
        self.assertIn('Condiciones vigentes para compras online', public_res.data['data']['published'])

    def test_publicar_politica_reembolso_refleja_en_publico(self):
        """Verifica la persistencia y publicación del editor de Política de Reembolso."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_propietario.key}')

        texto_reembolso = "**1. Política de Devolución Personalizada**\n\nPlazo de 30 días para devolución."
        payload = {
            'tipo': 'refund',
            'draft': texto_reembolso,
            'accion': 'publish',
        }
        res = self.client.put('/api/legal/configuracion/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['data']['refund']['published'], texto_reembolso)

        public_res = self.client.get('/api/legal/reembolso/')
        self.assertIn('Plazo de 30 días para devolución', public_res.data['data']['published'])

    def test_publicar_politica_privacidad_refleja_en_publico(self):
        """Verifica la persistencia y publicación del editor de Política de Privacidad."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_propietario.key}')

        texto_privacidad = "**1. Tratamiento de Datos Personales**\n\nProtección de datos conforme a ley chilena."
        payload = {
            'tipo': 'privacy',
            'draft': texto_privacidad,
            'accion': 'publish',
        }
        res = self.client.put('/api/legal/configuracion/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['data']['privacy']['published'], texto_privacidad)

        public_res = self.client.get('/api/legal/privacidad/')
        self.assertIn('Protección de datos conforme a ley chilena', public_res.data['data']['published'])

    def test_restaurar_plantilla_base(self):
        """Verifica la acción de restaurar plantilla base en el borrador."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_propietario.key}')

        # Modificamos el borrador primero
        self.client.put('/api/legal/configuracion/', {'tipo': 'terms', 'draft': 'Texto temporal', 'accion': 'draft'}, format='json')

        # Restauramos
        res = self.client.put('/api/legal/configuracion/', {'tipo': 'terms', 'accion': 'restore'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['data']['terms']['draft'], TERMS_DEFAULT)

    def test_validacion_limite_caracteres(self):
        """Verifica que textos excesivamente largos sean rechazados."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_propietario.key}')
        payload = {
            'tipo': 'terms',
            'draft': 'a' * 50001,
            'accion': 'draft',
        }
        res = self.client.put('/api/legal/configuracion/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
