"""SCRUM-460: los reintentos del inicio Webpay reutilizan la misma transacción."""
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.catalog.domain.exceptions import TransbankServicioNoDisponibleException
from apps.core.models import ConfiguracionTransbank, Pedido, Tienda


class InicioWebpayIdempotenteTests(TestCase):
    URL = "/api/catalog/pagos/transbank/iniciar/"

    def setUp(self):
        owner = get_user_model().objects.create_user(username="qa-scrum-460")
        self.store = Tienda.objects.create(nombre="QA 460", id_usuario_propietario=owner)
        self.order = Pedido.objects.create(
            tienda=self.store, monto_total=Decimal("15000"),
            medio_pago="Transbank", correo_contacto="buyer@example.test",
        )
        ConfiguracionTransbank.objects.create(
            id_tienda=self.store, activo=True, codigo_comercio="commerce", api_key="secret",
        )
        self.api = APIClient()
        self.payload = {
            "id_tienda": self.store.pk, "orden_compra": self.order.identificador,
            "monto": 15000, "email": "buyer@example.test", "session_id": "session-1",
            "return_url": "http://localhost:5173/pedido-confirmado",
        }

    def iniciar(self, **changes):
        return self.api.post(self.URL, {**self.payload, **changes}, format="json")

    @patch("apps.catalog.application.use_cases.TransbankWebpayAdapter")
    def test_reintento_reutiliza_token_sin_consultar_otra_vez_a_webpay(self, adapter):
        expected = {"token": "token-uno", "url": "https://webpay.example.test"}
        adapter.return_value.iniciar_transaccion.return_value = expected
        primera = self.iniciar()
        segunda = self.iniciar(session_id="session-diferente")
        self.assertEqual(primera.status_code, 200, primera.data)
        self.assertEqual(segunda.status_code, 200, segunda.data)
        self.assertEqual(primera.data["data"], expected)
        self.assertEqual(segunda.data["data"], expected)
        adapter.return_value.iniciar_transaccion.assert_called_once()
        self.order.refresh_from_db()
        self.assertEqual(self.order.webpay_token, "token-uno")
        self.assertEqual(self.order.webpay_url, expected["url"])
        self.assertEqual(Pedido.objects.count(), 1)

    @patch("apps.catalog.application.use_cases.TransbankWebpayAdapter")
    def test_se_puede_reintentar_cuando_webpay_no_responde(self, adapter):
        adapter.return_value.iniciar_transaccion.side_effect = [
            TransbankServicioNoDisponibleException("Webpay no disponible"),
            {"token": "token-dos", "url": "https://webpay.example.test"},
        ]
        primera = self.iniciar()
        self.assertEqual(primera.status_code, 503)
        self.order.refresh_from_db()
        self.assertEqual(self.order.webpay_token, "")
        self.assertEqual(self.order.estado, "pendiente")
        segunda = self.iniciar()
        self.assertEqual(segunda.status_code, 200, segunda.data)
        self.assertEqual(adapter.return_value.iniciar_transaccion.call_count, 2)

    @patch("apps.catalog.application.use_cases.TransbankWebpayAdapter")
    def test_transaccion_incompleta_no_se_persiste(self, adapter):
        adapter.return_value.iniciar_transaccion.return_value = {"token": "", "url": ""}
        respuesta = self.iniciar()
        self.assertEqual(respuesta.status_code, 502, respuesta.data)
        self.order.refresh_from_db()
        self.assertFalse(self.order.webpay_token)
        self.assertFalse(self.order.webpay_url)
