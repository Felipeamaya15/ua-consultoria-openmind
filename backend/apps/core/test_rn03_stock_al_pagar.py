"""RN-03: el stock se descuenta al confirmarse un pago exitoso, no al crear el pedido."""
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.core.infrastructure.conciliacion_pagos import marcar_pedido_pagado
from apps.core.infrastructure.expiracion_pedidos import devolver_stock_de_pedido_cancelado
from apps.core.infrastructure.stock_pedidos import cantidad_apartada, descontar_stock_de_pedido
from apps.core.models import ItemPedido, Pedido, Tienda

REPOSITORIO = 'apps.catalog.infrastructure.repositories.ProductRepository'


class StockAlConfirmarPagoTests(TestCase):
    def setUp(self):
        propietario = get_user_model().objects.create_user(username='rn03-owner')
        self.tienda = Tienda.objects.create(nombre='Tienda RN03', id_usuario_propietario=propietario)
        self.pedido = Pedido.objects.create(
            tienda=self.tienda, monto_total=Decimal('9990'), estado='pendiente', nombre_contacto='Ana',
            correo_contacto='ana@example.com', medio_pago='Transferencia', entrega={'metodo': 'Retiro'})
        ItemPedido.objects.create(id_pedido=self.pedido, producto_mongo_id='c' * 24, sku='SKU-R3', cantidad=2,
                                  precio_unitario=Decimal('4995'), nombre_producto='Polera')
        self.repositorio = MagicMock()
        self.repositorio.decrease_stock.return_value = True
        self.repositorio.restore_stock.return_value = True
        self.repositorio.get_by_id.return_value = {'variantes': [{'stock': 3}]}

    def test_un_pedido_pendiente_no_descuenta_stock(self):
        with patch(REPOSITORIO, return_value=self.repositorio):
            self.assertFalse(descontar_stock_de_pedido(self.pedido.pk))
        self.repositorio.decrease_stock.assert_not_called()

    def test_al_confirmar_el_pago_se_descuenta_una_sola_vez(self):
        with patch(REPOSITORIO, return_value=self.repositorio):
            marcar_pedido_pagado(self.pedido.pk)
            marcar_pedido_pagado(self.pedido.pk)
            self.assertFalse(descontar_stock_de_pedido(self.pedido.pk))
        self.repositorio.decrease_stock.assert_called_once_with(str(self.tienda.pk), 'SKU-R3', 2)
        self.assertTrue(Pedido.objects.get(pk=self.pedido.pk).stock_descontado)

    def test_sin_stock_al_pagar_restituye_lo_descontado_y_deja_el_aviso(self):
        ItemPedido.objects.create(id_pedido=self.pedido, producto_mongo_id='d' * 24, sku='SKU-R4', cantidad=1,
                                  precio_unitario=Decimal('1'), nombre_producto='Gorro')
        self.repositorio.decrease_stock.side_effect = [True, False]
        with patch(REPOSITORIO, return_value=self.repositorio), self.assertLogs(
                'apps.core.infrastructure.stock_pedidos', 'CRITICAL'):
            marcar_pedido_pagado(self.pedido.pk)
        pedido = Pedido.objects.get(pk=self.pedido.pk)
        self.assertEqual(pedido.estado, 'pagado')
        self.assertFalse(pedido.stock_descontado)
        self.repositorio.restore_stock.assert_called_once_with(str(self.tienda.pk), 'c' * 24, 'SKU-R3', 2)

    def test_cancelar_un_pedido_solo_devuelve_stock_si_se_habia_descontado(self):
        with patch(REPOSITORIO, return_value=self.repositorio), self.captureOnCommitCallbacks(execute=True):
            Pedido.objects.filter(pk=self.pedido.pk).update(estado='cancelado')
            self.assertFalse(devolver_stock_de_pedido_cancelado(self.pedido))
        self.repositorio.restore_stock.assert_not_called()
        Pedido.objects.filter(pk=self.pedido.pk).update(stock_descontado=True)
        with patch(REPOSITORIO, return_value=self.repositorio), self.captureOnCommitCallbacks(execute=True):
            self.assertTrue(devolver_stock_de_pedido_cancelado(self.pedido))
        self.repositorio.restore_stock.assert_called_once_with(str(self.tienda.pk), 'c' * 24, 'SKU-R3', 2)

    def test_los_pendientes_se_restan_de_lo_disponible_sin_tocar_el_stock(self):
        self.assertEqual(cantidad_apartada(self.tienda.pk, 'c' * 24, 'SKU-R3'), 2)
        Pedido.objects.filter(pk=self.pedido.pk).update(estado='pagado')
        self.assertEqual(cantidad_apartada(self.tienda.pk, 'c' * 24, 'SKU-R3'), 0)
        Pedido.objects.filter(pk=self.pedido.pk).update(estado='cancelado')
        self.assertEqual(cantidad_apartada(self.tienda.pk, 'c' * 24, 'SKU-R3'), 0)
