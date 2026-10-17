
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import Pedido, Tienda


class FiltroOrdenesEstadoTests(TestCase):

    def setUp(self):
        User = get_user_model()

        self.usuario = User.objects.create_user(
            username="propietario_filtro",
            password="test12345"
        )

        self.otro_usuario = User.objects.create_user(
            username="otro_propietario",
            password="test12345"
        )

        self.tienda = Tienda.objects.create(
            nombre="Tienda Test",
            id_usuario_propietario=self.usuario
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.usuario)

        self.url = "/api/tienda/pedidos/"

        for estado in [
            "pendiente",
            "pagado",
            "preparando",
            "enviado",
            "entregado"
        ]:
            Pedido.objects.create(
                tienda=self.tienda,
                estado=estado,
                monto_total=10000,
                correo_contacto="cliente@test.com"
            )

    def test_listar_todas_las_ordenes(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 5)

    def test_filtrar_ordenes_pendientes(self):
        response = self.client.get(
            self.url,
            {"estado": "pendiente"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(
            response.data[0]["estado"],
            "pendiente"
        )

    def test_filtrar_ordenes_pagadas(self):
        response = self.client.get(
            self.url,
            {"estado": "pagado"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(
            response.data[0]["estado"],
            "pagado"
        )

    def test_estado_sin_resultados(self):
        response = self.client.get(
            self.url,
            {"estado": "cancelado"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 0)

    def test_estado_invalido(self):
        response = self.client.get(
            self.url,
            {"estado": "desconocido"}
        )

        self.assertEqual(response.status_code, 400)

    def test_otro_usuario_no_puede_consultar_ordenes(self):
        self.client.force_authenticate(
            user=self.otro_usuario
        )

        response = self.client.get(
            self.url,
            {"estado": "pagado"}
        )

        self.assertEqual(response.status_code, 403)
