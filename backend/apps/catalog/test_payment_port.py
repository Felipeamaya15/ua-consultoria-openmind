from decimal import Decimal

from django.test import SimpleTestCase

from apps.catalog.domain.ports.payment_gateway import (
    EstadoPago,
    PagoIniciado,
    PaymentGatewayPort,
    ResultadoPago,
)


class PaymentGatewayPortTests(SimpleTestCase):

    def test_puerto_no_se_puede_instanciar(self):
        with self.assertRaises(TypeError):
            PaymentGatewayPort()

    def test_implementacion_incompleta_falla(self):
        class Incompleta(PaymentGatewayPort):
            def iniciar_pago(self, orden_compra, monto, descripcion, url_retorno):
                return PagoIniciado("ref", "https://pago")

        with self.assertRaises(TypeError):
            Incompleta()

    def test_implementacion_completa_cumple_el_contrato(self):
        class Fake(PaymentGatewayPort):
            def iniciar_pago(self, orden_compra, monto, descripcion, url_retorno):
                return PagoIniciado("ref-1", "https://pago")

            def consultar_pago(self, id_transaccion):
                return ResultadoPago(id_transaccion, "OC-1", Decimal("1000"), EstadoPago.APROBADO)

        gateway = Fake()
        self.assertEqual(gateway.iniciar_pago("OC-1", Decimal("1000"), "Pedido", "https://r").url_pago, "https://pago")
        self.assertEqual(gateway.consultar_pago("99").estado, EstadoPago.APROBADO)
