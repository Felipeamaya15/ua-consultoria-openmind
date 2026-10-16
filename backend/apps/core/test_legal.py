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
        self.assertIn('cookies', data)

        self.assertEqual(data['terms']['title'], 'Términos y Condiciones')
        self.assertIn('1. Aceptación de los términos', data['terms']['published'])
        self.assertNotIn('draft', data['terms'], 'La consulta pública no debe exponer borradores')

        self.assertEqual(data['privacy']['title'], 'Política de Privacidad')
        self.assertIn('1. Información que recopilamos', data['privacy']['published'])

        self.assertEqual(data['refund']['title'], 'Política de Reembolso')
        self.assertIn('1. Derecho a devolución', data['refund']['published'])

        self.assertEqual(data['cookies']['title'], 'Política de Cookies')
        self.assertIn('1. ¿Qué son las cookies?', data['cookies']['published'])

    def test_consulta_publica_detalle_por_tipo_y_alias(self):
        """Verifica la consulta individual por clave y alias en español."""
        for endpoint, title_expected in [
            ('/api/legal/terms/', 'Términos y Condiciones'),
            ('/api/legal/terminos/', 'Términos y Condiciones'),
            ('/api/legal/privacy/', 'Política de Privacidad'),
            ('/api/legal/privacidad/', 'Política de Privacidad'),
            ('/api/legal/refund/', 'Política de Reembolso'),
            ('/api/legal/reembolso/', 'Política de Reembolso'),
            ('/api/legal/cookies/', 'Política de Cookies'),
            ('/api/legal/galletas/', 'Política de Cookies'),
            ('/api/legal/politica-de-cookies/', 'Política de Cookies'),
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

    def test_publicar_politica_cookies_refleja_en_publico(self):
        """Verifica la persistencia y publicación del editor de Política de Cookies."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_propietario.key}')

        texto_cookies = "**1. Política de Cookies Personalizada**\n\nUso de cookies estrictamente técnicas."
        payload = {
            'tipo': 'cookies',
            'draft': texto_cookies,
            'accion': 'publish',
        }
        res = self.client.put('/api/legal/configuracion/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['data']['cookies']['published'], texto_cookies)

        public_res = self.client.get('/api/legal/cookies/')
        self.assertIn('Uso de cookies estrictamente técnicas', public_res.data['data']['published'])

        alias_res = self.client.get('/api/legal/galletas/')
        self.assertIn('Uso de cookies estrictamente técnicas', alias_res.data['data']['published'])

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

    def test_creacion_contenido_legal_post_201(self):
        """Implementar la creación de contenido legal: POST responde 201 CREATED."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_propietario.key}')

        # 1. Creación en /api/legal/configuracion/
        payload = {
            'tipo': 'terms',
            'title': 'Términos Oficiales 2026',
            'draft': '**1. Cláusula inicial**\n\nTexto de prueba creado.',
        }
        res = self.client.post('/api/legal/configuracion/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data['exito'])
        self.assertEqual(res.data['mensaje'], 'Contenido legal creado correctamente.')
        self.assertEqual(res.data['data']['terms']['title'], 'Términos Oficiales 2026')
        self.assertEqual(res.data['data']['terms']['draft'], '**1. Cláusula inicial**\n\nTexto de prueba creado.')

        # 2. Creación en /api/legal/
        payload_privacy = {
            'tipo': 'privacy',
            'title': 'Privacidad Personalizada',
            'draft': '**1. Protección**\n\nDatos cifrados.',
        }
        res_root = self.client.post('/api/legal/', payload_privacy, format='json')
        self.assertEqual(res_root.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_root.data['data']['privacy']['title'], 'Privacidad Personalizada')

    def test_actualizacion_contenido_legal_put_patch_200(self):
        """Implementar la actualización del contenido legal: PUT y PATCH responden 200 OK."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_propietario.key}')

        # PUT
        payload_put = {
            'tipo': 'refund',
            'draft': '**1. Reembolsos actualizados**\n\nNueva política.',
            'title': 'Política de Reembolso Express',
            'accion': 'draft',
        }
        res_put = self.client.put('/api/legal/configuracion/', payload_put, format='json')
        self.assertEqual(res_put.status_code, status.HTTP_200_OK)
        self.assertEqual(res_put.data['mensaje'], 'Contenido legal actualizado correctamente.')
        self.assertEqual(res_put.data['data']['refund']['draft'], '**1. Reembolsos actualizados**\n\nNueva política.')
        self.assertEqual(res_put.data['data']['refund']['title'], 'Política de Reembolso Express')

        # PATCH
        payload_patch = {
            'tipo': 'refund',
            'draft': '**1. Reembolsos parcheados**\n\nVersión parcheada.',
        }
        res_patch = self.client.patch('/api/legal/configuracion/', payload_patch, format='json')
        self.assertEqual(res_patch.status_code, status.HTTP_200_OK)
        self.assertEqual(res_patch.data['data']['refund']['draft'], '**1. Reembolsos parcheados**\n\nVersión parcheada.')

    def test_publicacion_contenido_legal_endpoint_dedicado(self):
        """Implementar la publicación de contenido legal: endpoint dedicado POST responde 200 OK y refleja en público."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_propietario.key}')

        # Publicar vía /api/legal/configuracion/publicar/
        payload_pub = {
            'tipo': 'privacy',
            'content': '**1. Política Oficial Publicada**\n\nVisible inmediatamente en la tienda.',
        }
        res_pub = self.client.post('/api/legal/configuracion/publicar/', payload_pub, format='json')
        self.assertEqual(res_pub.status_code, status.HTTP_200_OK)
        self.assertEqual(res_pub.data['mensaje'], 'Contenido legal publicado correctamente.')
        self.assertEqual(res_pub.data['data']['privacy']['published'], payload_pub['content'])

        # Verificar en endpoint público
        res_public = self.client.get('/api/legal/privacy/')
        self.assertEqual(res_public.status_code, status.HTTP_200_OK)
        self.assertEqual(res_public.data['data']['published'], payload_pub['content'])

        # Publicar vía /api/legal/<tipo>/publicar/
        res_pub_tipo = self.client.post(
            '/api/legal/terms/publicar/',
            {'content': '**1. Términos Vía URL Específica**\n\nPublicado directo.'},
            format='json'
        )
        self.assertEqual(res_pub_tipo.status_code, status.HTTP_200_OK)
        self.assertEqual(res_pub_tipo.data['mensaje'], 'Contenido legal publicado correctamente.')

        res_pub_terms = self.client.get('/api/legal/terms/')
        self.assertEqual(res_pub_terms.data['data']['published'], '**1. Términos Vía URL Específica**\n\nPublicado directo.')

    def test_publicacion_rechaza_contenido_vacio(self):
        """La publicación de contenido legal debe validar que el texto no esté vacío ni en blanco."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token_propietario.key}')

        res_vacio = self.client.post(
            '/api/legal/configuracion/publicar/',
            {'tipo': 'terms', 'content': '   '},
            format='json'
        )
        self.assertEqual(res_vacio.status_code, status.HTTP_400_BAD_REQUEST)

