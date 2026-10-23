from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.core.delivery import delivery_defaults
from apps.core.models import ConfiguracionEntrega, ConfiguracionPago, Pedido, Promocion, Tienda
from apps.core.payments import TRANSFER_PUBLIC_FIELDS
from apps.core.promotions import PromotionError, calculate_promotion, validar_monto_minimo_envio_gratis
from apps.shipping.domain.services import ShippingDomainService


class PromocionesAdminTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='promo-owner', password='secret')
        self.store = Tienda.objects.create(id_usuario_propietario=self.owner, nombre='Tienda promociones')
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=self.owner).key}')

    def test_crea_descuento_porcentual_y_calcula_descuento(self):
        response = self.client.post('/api/promociones/', {
            'name': 'Descuento Verano', 'code': ' verano-20 ', 'type': 'percentage', 'value': '20.00',
            'minAmount': '10000.00', 'startsAt': date.today(), 'endsAt': date.today() + timedelta(days=15),
            'maxUses': 50, 'active': True,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        promotion = Promocion.objects.get(codigo='VERANO-20')
        self.assertEqual(promotion.tipo, Promocion.TIPO_PORCENTAJE)
        self.assertEqual(str(promotion.valor), '20.00')
        self.assertEqual(response.data['data']['type'], 'percentage')

        amounts = calculate_promotion(self.store, 'verano-20', 25000, 3500)
        self.assertEqual(amounts.discount, Decimal('5000'))
        self.assertEqual(amounts.shipping, 3500)

    def test_valida_endpoint_descuento_porcentual_con_redondeo_half_up(self):
        Promocion.objects.create(
            tienda=self.store, nombre='Quince por ciento', codigo='QUINCE15',
            tipo='percentage', valor=Decimal('15.00'), monto_minimo=1000,
            fecha_inicio=date.today() - timedelta(days=1),
            fecha_fin=date.today() + timedelta(days=1), activa=True,
        )
        self.client.credentials()
        response = self.client.post('/api/promociones/validar/', {
            'code': ' quince15 ', 'subtotal': '1990.00', 'shipping': '3000.00',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['type'], 'percentage')
        self.assertEqual(response.data['data']['discount'], '299.00')
        self.assertEqual(response.data['data']['shipping'], '3000.00')

    def test_rechaza_descuento_porcentual_fuera_de_rango(self):
        for invalid_value in (0, -10, 101, 150):
            response = self.client.post('/api/promociones/', {
                'name': 'Porcentaje invalido', 'code': f'PCT-{abs(invalid_value)}',
                'type': 'percentage', 'value': invalid_value, 'startsAt': date.today(),
            }, format='json')
            self.assertEqual(response.status_code, 400, (invalid_value, response.data))

    def test_crea_descuento_de_monto_fijo_normalizando_codigo(self):
        response = self.client.post('/api/promociones/', {
            'name': 'Bienvenida', 'code': ' nuevo-5000 ', 'type': 'fixed', 'value': '5000.00',
            'minAmount': '15000.00', 'startsAt': date.today(), 'endsAt': date.today() + timedelta(days=30),
            'maxUses': 20, 'active': True,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        promotion = Promocion.objects.get()
        self.assertEqual(promotion.codigo, 'NUEVO-5000')
        self.assertEqual(str(promotion.valor), '5000.00')
        self.assertEqual(response.data['data']['type'], 'fixed')

        amounts = calculate_promotion(self.store, 'nuevo-5000', Decimal('20000'), Decimal('3500'))
        self.assertEqual(amounts.discount, Decimal('5000.00'))
        self.assertEqual(amounts.shipping, Decimal('3500'))

    def test_descuento_monto_fijo_no_supera_el_subtotal(self):
        Promocion.objects.create(
            tienda=self.store, nombre='Diez mil', codigo='FIJO10000',
            tipo='fixed', valor=Decimal('10000.00'), monto_minimo=0,
            fecha_inicio=date.today() - timedelta(days=1), activa=True,
        )
        amounts = calculate_promotion(self.store, 'FIJO10000', Decimal('6500.00'), Decimal('2500.00'))
        self.assertEqual(amounts.discount, Decimal('6500.00'))
        self.assertEqual(amounts.shipping, Decimal('2500.00'))

    def test_rechaza_monto_fijo_no_positivo_y_codigo_duplicado(self):
        base = {'name': 'Promo', 'code': 'FIJO', 'type': 'fixed', 'value': 0, 'startsAt': date.today()}
        self.assertEqual(self.client.post('/api/promociones/', base, format='json').status_code, 400)
        base['value'] = 1000
        self.assertEqual(self.client.post('/api/promociones/', base, format='json').status_code, 201)
        self.assertEqual(self.client.post('/api/promociones/', base, format='json').status_code, 409)

    def test_solo_propietario_puede_administrar_promociones(self):
        self.client.credentials()
        self.assertEqual(self.client.get('/api/promociones/').status_code, 401)

    def test_crea_promocion_de_envio_gratuito_y_elimina_el_costo(self):
        response = self.client.post('/api/promociones/', {
            'name': 'Despacho gratis', 'code': 'ENVIO-GRATIS', 'type': 'free_shipping',
            'value': 9999, 'minAmount': 20000, 'startsAt': date.today(), 'active': True,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        promotion = Promocion.objects.get(codigo='ENVIO-GRATIS')
        self.assertEqual(promotion.valor, 0)
        amounts = calculate_promotion(self.store, ' envio-gratis ', 25000, 3990)
        self.assertEqual(amounts.discount, 0)
        self.assertEqual(amounts.shipping, 0)

    def test_envio_gratuito_valida_aliases_de_monto_minimo(self):
        base = {
            'name': 'Despacho QA', 'code': 'ENVIO-QA', 'type': 'free_shipping',
            'value': 0, 'startsAt': date.today(), 'active': True,
        }

        for alias in ('minAmount', 'monto_minimo', 'montoMinimo', 'minimumAmount', 'minimum_amount'):
            for invalid in (-1000, -0.01, True, 'invalido'):
                response = self.client.post('/api/promociones/', {
                    **base, alias: invalid,
                }, format='json')
                self.assertEqual(response.status_code, 400, (alias, invalid, response.data))

        self.assertFalse(Promocion.objects.filter(codigo='ENVIO-QA').exists())

        required_fields = ('name', 'code', 'type', 'value')
        for field in required_fields:
            payload = {**base, 'minAmount': 15000}
            payload.pop(field)
            response = self.client.post('/api/promociones/', payload, format='json')
            self.assertEqual(response.status_code, 400, (field, response.data))

        duplicate_amount = self.client.post('/api/promociones/', {
            **base, 'minAmount': 15000, 'monto_minimo': 15000,
        }, format='json')
        self.assertEqual(duplicate_amount.status_code, 400, duplicate_amount.data)
        self.assertFalse(Promocion.objects.filter(codigo='ENVIO-QA').exists())

        response = self.client.post('/api/promociones/', {
            **base, 'monto_minimo': 15000,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Promocion.objects.get(codigo='ENVIO-QA').monto_minimo, Decimal('15000.00'))

    def test_envio_gratuito_valida_monto_minimo_en_calculo_y_endpoint_validar(self):
        Promocion.objects.create(
            tienda=self.store, nombre='Envío gratis sobre 25 mil', codigo='GRATIS25',
            tipo='free_shipping', valor=0, monto_minimo=Decimal('25000.00'),
            fecha_inicio=date.today() - timedelta(days=1), activa=True,
        )
        self.client.credentials()

        # Subtotal menor al mínimo -> rechaza con mensaje claro y código PROMOCION_INVALIDA
        below = self.client.post('/api/promociones/validar/', {
            'code': 'GRATIS25', 'subtotal': '24999.00', 'shipping': '4500.00',
        }, format='json')
        self.assertEqual(below.status_code, 400, below.data)
        self.assertEqual(below.data['error']['codigo'], 'PROMOCION_INVALIDA')
        self.assertIn('25000', below.data['mensaje'])

        # Subtotal exactamente igual al mínimo -> aplica envío gratis ($0.00)
        exact = self.client.post('/api/promociones/validar/', {
            'code': ' gratis25 ', 'subtotal': '25000.00', 'shipping': '4500.00',
        }, format='json')
        self.assertEqual(exact.status_code, 200, exact.data)
        self.assertEqual(exact.data['data']['type'], 'free_shipping')
        self.assertEqual(exact.data['data']['discount'], '0.00')
        self.assertEqual(exact.data['data']['shipping'], '0.00')

        # Subtotal superior al mínimo -> aplica envío gratis ($0.00)
        above = self.client.post('/api/promociones/validar/', {
            'code': 'GRATIS25', 'subtotal': '40000.00', 'shipping': '4500.00',
        }, format='json')
        self.assertEqual(above.status_code, 200, above.data)
        self.assertEqual(above.data['data']['shipping'], '0.00')

    def test_checkout_valida_monto_minimo_de_envio_gratuito_antes_de_crear_pedido(self):
        Promocion.objects.create(
            tienda=self.store, nombre='Envío gratis sobre 30 mil', codigo='ENVIO30K',
            tipo='free_shipping', valor=0, monto_minimo=Decimal('30000.00'),
            fecha_inicio=date.today() - timedelta(days=1), activa=True,
        )
        delivery_data = delivery_defaults()
        delivery_data['chilexpress'].update(enabled=True, tarifas=[
            {'region': 'Metropolitana de Santiago', 'comuna': 'Providencia', 'monto': 4500, 'plazo_dias': 2},
        ])
        ConfiguracionEntrega.objects.create(tienda=self.store, datos=delivery_data)
        ConfiguracionPago.objects.create(tienda=self.store, datos={
            'transfer': {'enabled': True, 'fields': {field: 'qa' for field in TRANSFER_PUBLIC_FIELDS}},
        })

        self.client.credentials()
        quote_res = self.client.post('/api/entregas/cotizacion/', {
            'operador': 'Chilexpress', 'region': 'Metropolitana', 'comuna': 'Providencia',
        }, format='json')
        self.assertEqual(quote_res.status_code, 200, quote_res.data)
        token_cotizacion = quote_res.data['data']['tarifas'][0]['cotizacion']

        with patch('apps.core.presentation.checkout.ProductRepository') as repo_mock:
            repo = repo_mock.return_value
            repo.get_by_id.return_value = {
                '_id': 'prod-1', 'nombre': 'Producto', 'activo': True,
                'variantes': [{'sku': 'SKU-1', 'precio': 15000, 'stock': 10}],
            }
            repo.decrease_stock.return_value = True

            # 1 unidad ($15.000 < $30.000) -> Checkout rechaza y no descuenta stock ni crea pedido
            under_min = self.client.post('/api/checkout/pedidos/', {
                'clave_checkout': str(uuid4()),
                'items': [{'producto_id': 'prod-1', 'sku': 'SKU-1', 'cantidad': 1}],
                'contacto': {'nombre': 'Comprador', 'email': 'buyer@example.com'},
                'medio_pago': 'Transferencia', 'metodo_entrega': 'Chilexpress',
                'cotizacion': token_cotizacion, 'codigo_promocional': 'ENVIO30K',
                'direccion': {'street': 'Av. Providencia', 'number': '123', 'apt': '', 'city': 'Providencia', 'region': 'Metropolitana'},
            }, format='json')
            self.assertEqual(under_min.status_code, 400, under_min.data)
            self.assertFalse(Pedido.objects.exists())
            repo.decrease_stock.assert_not_called()

            # 2 unidades ($30.000 == $30.000) -> Checkout aprueba y deja costo_envio en 0.00
            meets_min = self.client.post('/api/checkout/pedidos/', {
                'clave_checkout': str(uuid4()),
                'items': [{'producto_id': 'prod-1', 'sku': 'SKU-1', 'cantidad': 2}],
                'contacto': {'nombre': 'Comprador', 'email': 'buyer@example.com'},
                'medio_pago': 'Transferencia', 'metodo_entrega': 'Chilexpress',
                'cotizacion': token_cotizacion, 'codigo_promocional': 'ENVIO30K',
                'direccion': {'street': 'Av. Providencia', 'number': '123', 'apt': '', 'city': 'Providencia', 'region': 'Metropolitana'},
            }, format='json')
            self.assertEqual(meets_min.status_code, 201, meets_min.data)
            pedido = Pedido.objects.get()
            self.assertEqual(pedido.costo_envio, Decimal('0.00'))
            self.assertEqual(pedido.monto_total, Decimal('30000.00'))

    def test_funciones_dominio_validan_monto_minimo_envio_gratis(self):
        self.assertEqual(validar_monto_minimo_envio_gratis(Decimal('20000'), Decimal('20000')), Decimal('20000'))
        with self.assertRaises(PromotionError):
            validar_monto_minimo_envio_gratis(Decimal('19999.99'), Decimal('20000'))
        for invalido in (-1, True, 'abc'):
            with self.assertRaises(PromotionError):
                validar_monto_minimo_envio_gratis(invalido, Decimal('10000'))

        self.assertTrue(ShippingDomainService.cumple_monto_minimo_envio_gratis(Decimal('30000'), Decimal('30000')))
        self.assertFalse(ShippingDomainService.cumple_monto_minimo_envio_gratis(Decimal('29999'), Decimal('30000')))
        for invalido in (-100, True, 'no-numero'):
            with self.assertRaises(ValueError):
                ShippingDomainService.cumple_monto_minimo_envio_gratis(invalido, Decimal('30000'))

    def test_valida_codigo_vigente_y_calcula_descuento_fijo(self):
        Promocion.objects.create(
            tienda=self.store, nombre='Cinco mil', codigo='FIJO5000', tipo='fixed', valor=5000,
            monto_minimo=10000, fecha_inicio=date.today() - timedelta(days=1),
            fecha_fin=date.today() + timedelta(days=1), activa=True,
        )
        self.client.credentials()
        response = self.client.post('/api/promociones/validar/', {
            'code': ' fijo5000 ', 'subtotal': '12000.00', 'shipping': '3500.00',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['type'], 'fixed')
        self.assertEqual(response.data['data']['discount'], '5000.00')
        self.assertEqual(response.data['data']['shipping'], '3500.00')

    def test_rechaza_codigo_inexistente_inactivo_expirado_sin_minimo_o_sin_cupos(self):
        cases = [
            ('INACTIVA', {'activa': False}, 20000),
            ('EXPIRADA', {'fecha_inicio': date.today() - timedelta(days=5), 'fecha_fin': date.today() - timedelta(days=1)}, 20000),
            ('FUTURA', {'fecha_inicio': date.today() + timedelta(days=1)}, 20000),
            ('MINIMO', {'monto_minimo': 30000}, 20000),
            ('MINIMO-ENVIO', {'tipo': 'free_shipping', 'valor': 0, 'monto_minimo': 30000}, 20000),
            ('AGOTADA', {'maximo_usos': 1, 'usos': 1}, 20000),
        ]
        for code, changes, subtotal in cases:
            values = dict(tienda=self.store, nombre=code, codigo=code, tipo='fixed', valor=1000,
                          fecha_inicio=date.today(), activa=True)
            values.update(changes)
            Promocion.objects.create(**values)
            response = self.client.post('/api/promociones/validar/', {
                'code': code, 'subtotal': subtotal, 'shipping': 3000,
            }, format='json')
            self.assertEqual(response.status_code, 400, (code, response.data))
            self.assertEqual(response.data['error']['codigo'], 'PROMOCION_INVALIDA')

        missing = self.client.post('/api/promociones/validar/', {
            'code': 'NO-EXISTE', 'subtotal': 20000,
        }, format='json')
        self.assertEqual(missing.status_code, 400)