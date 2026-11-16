"""Regression checks for mixed legacy/commercial expiration and worker locks."""
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TransactionTestCase
from django.utils import timezone

from apps.core.infrastructure.expiracion_pedidos import _candidatos, expirar_pedido_pendiente
from apps.core.models import Pedido, Tienda
from apps.landing.external_activity_orders import MARKER, reconcile


class ActivityExpirationRegressionTests(TransactionTestCase):
    def setUp(self):
        owner = get_user_model().objects.create_user(username='expiry-regression-owner')
        self.store = Tienda.objects.create(nombre='Expiry test', id_usuario_propietario=owner)

    def order(self, delivery, method='Transbank', hours=3):
        order = Pedido.objects.create(tienda=self.store, monto_total=Decimal('15000'),
            estado='pendiente', medio_pago=method, entrega=delivery, correo_contacto='expiry@example.test',
            identificador='TEST-' + uuid4().hex[:12], clave_checkout=uuid4())
        Pedido.objects.filter(pk=order.pk).update(fecha_creacion=timezone.now()-timedelta(hours=hours))
        return order

    def test_old_orders_without_origin_are_not_excluded(self):
        orders = [self.order({}), self.order({'metodo': 'Retiro'}), self.order({'origen': 'otro'})]
        protected = [self.order({'origen': marker}) for marker in (
            'actividad_prueba_v1', 'actividad_transferencia_v1', 'actividad_unificada_qa_v1',
            'actividad_webpay_v1', MARKER)]
        candidates = set(_candidatos())
        self.assertTrue({o.pk for o in orders}.issubset(candidates))
        self.assertFalse({o.pk for o in protected}.intersection(candidates))
        with patch('apps.core.infrastructure.expiracion_pedidos._avisar_cancelacion'):
            for order in orders:
                self.assertTrue(expirar_pedido_pendiente(order.pk))
                order.refresh_from_db()
                self.assertEqual(order.estado, 'cancelado')

    def test_worker_reconciles_outside_testcase_atomic_block(self):
        self.assertFalse(connection.in_atomic_block)
        normal = self.order({})
        self.assertIsNone(reconcile(normal.pk))
        external = self.order({'origen': MARKER}, method='MercadoPago')
        # No reservation in this fixture; no provider operation should occur.
        self.assertEqual(reconcile(external.pk), 'espera')
        external.refresh_from_db()
        self.assertEqual(external.estado, 'pendiente')
