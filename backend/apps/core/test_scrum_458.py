"""SCRUM-458: los fallos y tiempos de espera de pasarelas externas no alteran las órdenes."""
from decimal import Decimal
from unittest.mock import Mock, patch

import requests
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.catalog.domain.exceptions import (
    PagoGatewayException,
    TransbankServicioNoDisponibleException,
    TransbankTransaccionException,
)
from apps.catalog.infrastructure.adapters.transbank_adapter import TransbankWebpayAdapter
from apps.catalog.infrastructure.adapters.linkify_adapter import LinkifyAdapter
from apps.catalog.infrastructure.adapters.mercadopago_adapter import MercadoPagoAdapter
from apps.catalog.infrastructure.adapters.paypal_adapter import PayPalAdapter
from apps.core.models import ConfiguracionTransbank, ConfiguracionPago, Pedido, Tienda


class TransbankUnavailableAdapterTests(SimpleTestCase):
    def setUp(self):
        self.adapter = TransbankWebpayAdapter("commerce", "secret")

    @patch("apps.catalog.infrastructure.adapters.transbank_adapter.requests.post")
    def test_network_timeout_is_retryable(self, post):
        post.side_effect = requests.Timeout("sensitive details")
        with self.assertRaises(TransbankServicioNoDisponibleException) as error:
            self.adapter.iniciar_transaccion("ORD-1", "SESSION-1", 3000, "http://localhost")
        self.assertNotIn("sensitive details", str(error.exception))
        self.assertEqual(post.call_args.kwargs["timeout"], 15)

    @patch("apps.catalog.infrastructure.adapters.transbank_adapter.requests.post")
    def test_provider_503_is_unavailable(self, post):
        post.return_value = Mock(status_code=503)
        with self.assertRaises(TransbankServicioNoDisponibleException):
            self.adapter.iniciar_transaccion("ORD-1", "SESSION-1", 3000, "http://localhost")

    @patch("apps.catalog.infrastructure.adapters.transbank_adapter.requests.post")
    def test_invalid_success_payload_is_rejected(self, post):
        post.return_value = Mock(status_code=200, json=lambda: {"token": ""})
        with self.assertRaises(TransbankTransaccionException):
            self.adapter.iniciar_transaccion("ORD-1", "SESSION-1", 3000, "http://localhost")

    @patch("apps.catalog.infrastructure.adapters.linkify_adapter.urllib.request.urlopen")
    def test_linkify_timeout_is_safe_and_bounded(self, urlopen):
        urlopen.side_effect = TimeoutError("secret connection")
        result = LinkifyAdapter("test-key").verificar_transferencia("ORD-1", 5000)
        self.assertEqual(result["codigo"], "LINKIFY_NO_DISPONIBLE")
        self.assertNotIn("secret connection", str(result))
        self.assertEqual(urlopen.call_args.kwargs["timeout"], 8)

    @patch("apps.catalog.infrastructure.adapters.paypal_adapter.urllib.request.urlopen")
    def test_paypal_timeout_is_bounded_and_does_not_leak_secrets(self, urlopen):
        urlopen.side_effect = TimeoutError("secret-paypal-host")
        adapter = PayPalAdapter("client", "secret", timeout=12)
        with self.assertRaises(PagoGatewayException) as error:
            adapter.iniciar_pago("ORD-1", Decimal("25.00"), "Pedido", "http://localhost")
        self.assertIn("Tiempo de espera agotado", str(error.exception))
        self.assertNotIn("secret-paypal-host", str(error.exception))
        self.assertEqual(urlopen.call_args.kwargs["timeout"], 12.0)

        capture = adapter.capture_order("ORDER-123")
        self.assertFalse(capture["exito"])
        self.assertEqual(capture["codigo"], "PAYPAL_TIMEOUT")

    @patch("apps.catalog.infrastructure.adapters.mercadopago_adapter.requests.request")
    def test_mercadopago_timeout_is_bounded_and_safe(self, request_mock):
        request_mock.side_effect = requests.Timeout("secret-mp-token")
        adapter = MercadoPagoAdapter("token-mp", timeout=10)
        with self.assertRaises(PagoGatewayException) as error:
            adapter.iniciar_pago("ORD-1", Decimal("15000"), "Pedido", "http://localhost")
        self.assertIn("Tiempo de espera agotado", str(error.exception))
        self.assertNotIn("secret-mp-token", str(error.exception))
        self.assertEqual(request_mock.call_args.kwargs["timeout"], 10.0)


class ProviderUnavailableViewsTests(TestCase):
    def setUp(self):
        owner = get_user_model().objects.create_user(username="qa-scrum-458")
        self.store = Tienda.objects.create(nombre="QA 458", id_usuario_propietario=owner)
        self.order = Pedido.objects.create(tienda=self.store, monto_total=Decimal("10000"),
                                           medio_pago="Transbank", correo_contacto="buyer@example.test")
        ConfiguracionTransbank.objects.create(id_tienda=self.store, activo=True,
                                               codigo_comercio="commerce", api_key="secret")
        self.api = APIClient()
        self.owner_token = Token.objects.create(user=owner)

    @patch("apps.catalog.application.use_cases.TransbankWebpayAdapter")
    def test_transbank_unavailable_does_not_mark_order_paid(self, adapter):
        adapter.return_value.iniciar_transaccion.side_effect = TransbankServicioNoDisponibleException("Temporal")
        response = self.api.post("/api/catalog/pagos/transbank/iniciar/", {
            "id_tienda": self.store.pk, "orden_compra": self.order.identificador,
            "monto": 10000, "email": "buyer@example.test", "session_id": "session",
            "return_url": "http://localhost:5173/pedido-confirmado",
        }, format="json")
        self.assertEqual(response.status_code, 503, response.data)
        self.assertEqual(response.data["error"]["codigo"], "PASARELA_TEMPORALMENTE_NO_DISPONIBLE")
        self.assertEqual(response["Retry-After"], "30")
        self.order.refresh_from_db()
        self.assertEqual(self.order.estado, "pendiente")

    @patch("apps.catalog.infrastructure.adapters.linkify_adapter.LinkifyAdapter.verificar_transferencia")
    def test_linkify_unavailable_does_not_mark_order_paid(self, verificar):
        Pedido.objects.filter(pk=self.order.pk).update(medio_pago="Linkify")
        ConfiguracionPago.objects.create(tienda=self.store, datos={"linkify": {
            "enabled": True, "fields": {"clavePrivada": "secret"}}})
        verificar.return_value = {"exito": False, "verificado": False}
        self.api.credentials(HTTP_AUTHORIZATION="Token " + self.owner_token.key)
        response = self.api.post("/api/pagos/linkify/verificar/", {"pedido_id": self.order.pk}, format="json")
        self.assertEqual(response.status_code, 503, response.data)
        self.assertEqual(response.data["error"]["codigo"], "LINKIFY_NO_DISPONIBLE")
        self.order.refresh_from_db()
        self.assertEqual(self.order.estado, "pendiente")