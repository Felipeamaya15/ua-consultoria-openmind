from unittest.mock import Mock, patch
from decimal import Decimal

from django.test import SimpleTestCase
from requests.exceptions import ConnectionError

from apps.catalog.infrastructure.adapters.mercadopago_adapter import MercadoPagoAdapter
from apps.catalog.infrastructure.adapters.paypal_adapter import PayPalAdapter
from apps.catalog.domain.exceptions import PagoGatewayException

from requests.exceptions import ConnectionError as RequestsConnectionError
from apps.catalog.infrastructure.adapters.transbank_adapter import TransbankWebpayAdapter
from apps.catalog.domain.exceptions import (TransbankServicioNoDisponibleException,
    TransbankTransaccionException,
    TransbankRechazoException,
)

SECRETO_FICTICIO = "CLAVE_PRIVADA_QA_NO_PUBLICAR_9876"


class SeguridadErroresExternosTests(SimpleTestCase):

    @patch("apps.catalog.infrastructure.adapters.mercadopago_adapter.requests.request")
    def test_mercadopago_no_filtra_secreto_en_error_http(self, request_mock):
        respuesta = Mock()
        respuesta.status_code = 401
        respuesta.text = f"Token inválido: {SECRETO_FICTICIO}"
        respuesta.json.return_value = {"message": respuesta.text}
        request_mock.return_value = respuesta

        adapter = MercadoPagoAdapter(SECRETO_FICTICIO)

        with self.assertRaises(PagoGatewayException) as contexto:
            adapter.iniciar_pago(
                "PEDIDO-QA", Decimal("1000"),
                "Pedido QA", "http://localhost:5173/retorno"
            )

        self.assertNotIn(SECRETO_FICTICIO, str(contexto.exception))

    @patch("apps.catalog.infrastructure.adapters.mercadopago_adapter.requests.request")
    def test_mercadopago_no_filtra_secreto_en_error_conexion(self, request_mock):
        request_mock.side_effect = ConnectionError(
            f"Authorization: Bearer {SECRETO_FICTICIO}"
        )

        adapter = MercadoPagoAdapter(SECRETO_FICTICIO)

        with self.assertRaises(PagoGatewayException) as contexto:
            adapter.iniciar_pago(
                "PEDIDO-QA", Decimal("1000"),
                "Pedido QA", "http://localhost:5173/retorno"
            )

        self.assertNotIn(SECRETO_FICTICIO, str(contexto.exception))

    @patch("apps.catalog.infrastructure.adapters.paypal_adapter.urllib.request.urlopen")
    def test_paypal_no_filtra_secreto_en_error_autenticacion(self, urlopen_mock):
        urlopen_mock.side_effect = RuntimeError(
            f"Authorization: Basic {SECRETO_FICTICIO}"
        )

        adapter = PayPalAdapter("CLIENT_ID_QA", SECRETO_FICTICIO)

        with self.assertRaises(ValueError) as contexto:
            adapter._get_access_token()

        self.assertNotIn(SECRETO_FICTICIO, str(contexto.exception))
        self.assertEqual(
            str(contexto.exception),
            "Error autenticando con PayPal.",
        )

    @patch.object(PayPalAdapter, "create_order")
    def test_paypal_no_filtra_secreto_en_inicio_pago(self, create_order_mock):
        create_order_mock.side_effect = ValueError(
            f"Respuesta externa: {SECRETO_FICTICIO}"
        )

        adapter = PayPalAdapter("CLIENT_ID_QA", SECRETO_FICTICIO)

        with self.assertRaises(PagoGatewayException) as contexto:
            adapter.iniciar_pago(
                "PEDIDO-QA", Decimal("1000"),
                "Pedido QA", "http://localhost:5173/retorno"
            )

        self.assertNotIn(SECRETO_FICTICIO, str(contexto.exception))


    @patch("apps.catalog.infrastructure.adapters.transbank_adapter.requests.post")
    def test_transbank_no_filtra_credencial_en_error_conexion(self, post_mock):
        post_mock.side_effect = RequestsConnectionError(
            f"Tbk-Api-Key-Secret: {SECRETO_FICTICIO}"
        )
        adapter = TransbankWebpayAdapter("COMERCIO-QA", SECRETO_FICTICIO)

        with self.assertRaises(TransbankServicioNoDisponibleException) as contexto:
            adapter.iniciar_transaccion(
                "PEDIDO-QA", "SESION-QA", 1000,
                "http://localhost:5173/retorno"
            )

        self.assertNotIn(SECRETO_FICTICIO, str(contexto.exception))

    @patch("apps.catalog.infrastructure.adapters.transbank_adapter.requests.post")
    def test_transbank_no_filtra_respuesta_http(self, post_mock):
        respuesta = Mock()
        respuesta.status_code = 401
        respuesta.text = f"Credencial incorrecta: {SECRETO_FICTICIO}"
        post_mock.return_value = respuesta

        adapter = TransbankWebpayAdapter("COMERCIO-QA", SECRETO_FICTICIO)

        with self.assertRaises(TransbankTransaccionException) as contexto:
            adapter.iniciar_transaccion(
                "PEDIDO-QA", "SESION-QA", 1000,
                "http://localhost:5173/retorno"
            )

        self.assertNotIn(SECRETO_FICTICIO, str(contexto.exception))

    @patch("apps.catalog.infrastructure.adapters.transbank_adapter.requests.put")
    def test_transbank_no_filtra_credencial_al_confirmar(self, put_mock):
        put_mock.side_effect = RequestsConnectionError(
            f"Tbk-Api-Key-Secret: {SECRETO_FICTICIO}"
        )
        adapter = TransbankWebpayAdapter("COMERCIO-QA", SECRETO_FICTICIO)

        with self.assertRaises(TransbankServicioNoDisponibleException) as contexto:
            adapter.confirmar_transaccion("TOKEN-QA")

        self.assertNotIn(SECRETO_FICTICIO, str(contexto.exception))

    @patch("apps.catalog.infrastructure.adapters.transbank_adapter.requests.put")
    def test_transbank_no_filtra_datos_de_rechazo(self, put_mock):
        respuesta = Mock()
        respuesta.status_code = 200
        respuesta.json.return_value = {
            "response_code": f"ERROR-{SECRETO_FICTICIO}",
            "status": "FAILED",
        }
        put_mock.return_value = respuesta

        adapter = TransbankWebpayAdapter("COMERCIO-QA", SECRETO_FICTICIO)

        with self.assertRaises(TransbankRechazoException) as contexto:
            adapter.confirmar_transaccion("TOKEN-QA")

        self.assertNotIn(SECRETO_FICTICIO, str(contexto.exception))
