"""SCRUM-509: expiracion de pedidos de PayPal y Mercado Pago con conciliacion, y expirador como servicio."""
import os
import signal
import tempfile
from datetime import timedelta
from decimal import Decimal
from io import StringIO
from pathlib import Path
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import CommandError, call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.catalog.domain.exceptions import PagoGatewayException
from apps.catalog.domain.ports.payment_gateway import EstadoPago, ResultadoPago
from apps.catalog.infrastructure.adapters.mercadopago_adapter import MercadoPagoAdapter
from apps.catalog.infrastructure.adapters.tuu_adapter import firmar
from apps.core.infrastructure.expiracion_pedidos import (
    ejecutar_ciclo_de_expiracion, liberar_vencidos_de_tienda, pedido_expirado, plazo_vencido)
from apps.core.models import ConfiguracionMercadoPago, ConfiguracionPago, ConfiguracionPayPal, ItemPedido, Pedido, Tienda

MP = 'apps.core.presentation.pagos_externos.MercadoPagoAdapter'
PP = 'apps.core.presentation.pagos_externos.PayPalAdapter'
REPOSITORIO = 'apps.catalog.infrastructure.repositories.ProductRepository'
COMANDO = 'apps.core.management.commands.expirar_pedidos_pendientes'


def pago_mp(estado, monto='19000', orden='ORD-1', id_='555'):
    return ResultadoPago(id_transaccion=id_, orden_compra=orden, monto=Decimal(monto), estado=estado)


def orden_pp(estado_pasarela, monto='20.70', orden='ORD-1'):
    aprobado = EstadoPago.APROBADO if estado_pasarela == 'COMPLETED' else (
        EstadoPago.RECHAZADO if estado_pasarela == 'VOIDED' else EstadoPago.PENDIENTE)
    return ResultadoPago(id_transaccion='PP-1', orden_compra=orden, monto=Decimal(monto), estado=aprobado,
                         detalle_estado=estado_pasarela)


class BaseConciliacion(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        owner = get_user_model().objects.create_user(username='conc-owner')
        self.tienda = Tienda.objects.create(nombre='Tienda', id_usuario_propietario=owner)
        ConfiguracionMercadoPago.objects.create(id_tienda=self.tienda, activo=True, public_key='pk', access_token='tok')
        ConfiguracionPayPal.objects.create(id_tienda=self.tienda, activo=True, client_id='cid', client_secret='sec')
        self.repositorio = MagicMock()
        self.repositorio.restore_stock.return_value = True
        self.repositorio.get_by_id.return_value = {'variantes': []}
        self.n = 0

    def pedido(self, medio, horas=3, estado='pendiente', paypal_order_id='PP-1'):
        self.n += 1
        fx = {'paypal_order_id': paypal_order_id, 'monto_usd': '20.70'} if paypal_order_id and medio == 'PayPal' else {}
        pedido = Pedido.objects.create(
            tienda=self.tienda, monto_total=Decimal('19000'), estado=estado, correo_contacto='a@b.cl', medio_pago=medio,
            identificador='ORD-1' if self.n == 1 else f'ORD-{self.n}', pago_fx=fx, entrega={'metodo': 'Retiro'})
        ItemPedido.objects.create(id_pedido=pedido, producto_mongo_id='a' * 24, sku='SKU-1', cantidad=2,
                                  precio_unitario=Decimal('9500'), nombre_producto='Polera')
        Pedido.objects.filter(pk=pedido.pk).update(fecha_creacion=timezone.now() - timedelta(hours=horas))
        pedido.refresh_from_db()
        return pedido

    def ciclo(self):
        with patch(REPOSITORIO, return_value=self.repositorio), self.captureOnCommitCallbacks(execute=True):
            return ejecutar_ciclo_de_expiracion()

    def estado(self, pedido):
        return Pedido.objects.get(pk=pedido.pk).estado


class MercadoPagoExpiracionTests(BaseConciliacion):
    @patch(MP)
    def test_sin_pagos_en_mercado_pago_se_cancela_sin_tocar_el_stock(self, adaptador):
        adaptador.return_value.buscar_pagos_por_referencia.return_value = []
        pedido = self.pedido('MercadoPago')
        self.assertEqual(self.ciclo()['cancelado'], 1)
        self.assertEqual(self.estado(pedido), 'cancelado')
        self.assertFalse(Pedido.objects.get(pk=pedido.pk).stock_devuelto)  # RN-03: nunca descontó stock
        self.repositorio.restore_stock.assert_not_called()
        adaptador.return_value.buscar_pagos_por_referencia.assert_called_once_with('ORD-1')

    @patch(MP)
    def test_si_el_comprador_pago_y_no_volvio_el_pedido_queda_pagado_no_cancelado(self, adaptador):
        adaptador.return_value.buscar_pagos_por_referencia.return_value = [
            pago_mp(EstadoPago.RECHAZADO, id_='1'), pago_mp(EstadoPago.APROBADO, id_='2')]
        pedido = self.pedido('MercadoPago')
        self.assertEqual(self.ciclo()['pagado'], 1)
        self.assertEqual(self.estado(pedido), 'pagado')
        self.repositorio.restore_stock.assert_not_called()

    @patch(MP)
    def test_un_pago_pendiente_o_en_proceso_hace_esperar(self, adaptador):
        adaptador.return_value.buscar_pagos_por_referencia.return_value = [pago_mp(EstadoPago.PENDIENTE)]
        pedido = self.pedido('MercadoPago')
        self.assertEqual(self.ciclo()['espera'], 1)
        self.assertEqual(self.estado(pedido), 'pendiente')
        self.repositorio.restore_stock.assert_not_called()

    @patch(MP)
    def test_pagos_rechazados_cancelados_o_devueltos_permiten_cancelar(self, adaptador):
        adaptador.return_value.buscar_pagos_por_referencia.return_value = [
            pago_mp(EstadoPago.RECHAZADO, id_='1'), pago_mp(EstadoPago.RECHAZADO, id_='2')]
        pedido = self.pedido('MercadoPago')
        self.ciclo()
        self.assertEqual(self.estado(pedido), 'cancelado')

    @patch(MP)
    def test_monto_distinto_no_se_da_por_pagado_ni_se_cancela(self, adaptador):
        adaptador.return_value.buscar_pagos_por_referencia.return_value = [pago_mp(EstadoPago.APROBADO, monto='100')]
        pedido = self.pedido('MercadoPago')
        with self.assertLogs('apps.core.infrastructure.conciliacion_pagos', level='ERROR'):
            self.assertEqual(self.ciclo()['indeterminado'], 1)
        self.assertEqual(self.estado(pedido), 'pendiente')

    @patch(MP)
    def test_pagos_de_otra_referencia_se_ignoran(self, adaptador):
        adaptador.return_value.buscar_pagos_por_referencia.return_value = [pago_mp(EstadoPago.APROBADO, orden='OTRO')]
        pedido = self.pedido('MercadoPago')
        self.ciclo()
        self.assertEqual(self.estado(pedido), 'cancelado')

    @patch(MP)
    def test_si_mercado_pago_no_responde_no_se_cancela(self, adaptador):
        adaptador.return_value.buscar_pagos_por_referencia.side_effect = PagoGatewayException('caido')
        pedido = self.pedido('MercadoPago')
        with self.assertLogs('apps.core.infrastructure.conciliacion_pagos', level='WARNING'):
            self.assertEqual(self.ciclo()['indeterminado'], 1)
        self.assertEqual(self.estado(pedido), 'pendiente')
        self.repositorio.restore_stock.assert_not_called()
        # Cuando la pasarela vuelve, en la siguiente pasada se resuelve.
        adaptador.return_value.buscar_pagos_por_referencia.side_effect = None
        adaptador.return_value.buscar_pagos_por_referencia.return_value = []
        self.ciclo()
        self.assertEqual(self.estado(pedido), 'cancelado')

    def test_sin_credenciales_de_mercado_pago_no_se_puede_verificar_y_no_se_cancela(self):
        ConfiguracionMercadoPago.objects.filter(id_tienda=self.tienda).update(activo=False)
        pedido = self.pedido('MercadoPago')
        with self.assertLogs('apps.core.infrastructure.conciliacion_pagos', level='WARNING'):
            self.assertEqual(self.ciclo()['indeterminado'], 1)
        self.assertEqual(self.estado(pedido), 'pendiente')

    @patch(MP)
    def test_dentro_del_margen_posterior_al_plazo_no_se_consulta_ni_se_cancela(self, adaptador):
        # Plazo en linea 2 h + margen de 10 min: a las 2 h 5 min ya vencio para el comprador pero aun no se concilia.
        pedido = self.pedido('MercadoPago', horas=2)
        Pedido.objects.filter(pk=pedido.pk).update(fecha_creacion=timezone.now() - timedelta(hours=2, minutes=5))
        pedido.refresh_from_db()
        self.assertTrue(plazo_vencido(pedido))
        self.assertFalse(pedido_expirado(pedido))
        self.ciclo()
        adaptador.return_value.buscar_pagos_por_referencia.assert_not_called()
        self.assertEqual(self.estado(pedido), 'pendiente')

    @patch(MP)
    def test_pedido_vigente_no_consulta_a_la_pasarela(self, adaptador):
        self.pedido('MercadoPago', horas=1)
        self.ciclo()
        adaptador.return_value.buscar_pagos_por_referencia.assert_not_called()


class PayPalExpiracionTests(BaseConciliacion):
    @patch(PP)
    def test_sin_orden_en_paypal_se_cancela_sin_consultar(self, adaptador):
        pedido = self.pedido('PayPal', paypal_order_id='')
        self.ciclo()
        self.assertEqual(self.estado(pedido), 'cancelado')
        adaptador.return_value.consultar_pago.assert_not_called()

    @patch(PP)
    def test_orden_creada_y_nunca_aprobada_se_cancela(self, adaptador):
        adaptador.return_value.consultar_pago.return_value = orden_pp('CREATED')
        pedido = self.pedido('PayPal')
        self.ciclo()
        self.assertEqual(self.estado(pedido), 'cancelado')
        adaptador.return_value.consultar_pago.assert_called_once_with('PP-1')
        self.repositorio.restore_stock.assert_not_called()  # RN-03: nunca descontó stock

    @patch(PP)
    def test_orden_completada_deja_el_pedido_pagado(self, adaptador):
        adaptador.return_value.consultar_pago.return_value = orden_pp('COMPLETED')
        pedido = self.pedido('PayPal')
        self.assertEqual(self.ciclo()['pagado'], 1)
        self.assertEqual(self.estado(pedido), 'pagado')
        self.repositorio.restore_stock.assert_not_called()

    @patch(PP)
    def test_orden_completada_con_monto_distinto_no_se_toca(self, adaptador):
        adaptador.return_value.consultar_pago.return_value = orden_pp('COMPLETED', monto='1.00')
        pedido = self.pedido('PayPal')
        with self.assertLogs('apps.core.infrastructure.conciliacion_pagos', level='ERROR'):
            self.assertEqual(self.ciclo()['indeterminado'], 1)
        self.assertEqual(self.estado(pedido), 'pendiente')

    @patch(PP)
    def test_orden_aprobada_sin_capturar_espera_y_pasado_un_dia_se_abandona(self, adaptador):
        adaptador.return_value.consultar_pago.return_value = orden_pp('APPROVED')
        reciente = self.pedido('PayPal', horas=5)
        self.assertEqual(self.ciclo()['espera'], 1)
        self.assertEqual(self.estado(reciente), 'pendiente')
        Pedido.objects.filter(pk=reciente.pk).update(fecha_creacion=timezone.now() - timedelta(hours=30))
        self.ciclo()
        self.assertEqual(self.estado(reciente), 'cancelado')  # sin captura, PayPal no cobra

    @patch(PP)
    def test_si_paypal_no_responde_no_se_cancela(self, adaptador):
        adaptador.return_value.consultar_pago.side_effect = PagoGatewayException('caido')
        pedido = self.pedido('PayPal')
        with self.assertLogs('apps.core.infrastructure.conciliacion_pagos', level='WARNING'):
            self.assertEqual(self.ciclo()['indeterminado'], 1)
        self.assertEqual(self.estado(pedido), 'pendiente')

    def test_sin_credenciales_de_paypal_la_orden_no_puede_capturarse_y_se_cancela(self):
        ConfiguracionPayPal.objects.filter(id_tienda=self.tienda).update(activo=False)
        pedido = self.pedido('PayPal')
        self.ciclo()
        self.assertEqual(self.estado(pedido), 'cancelado')


class TuuExpiracionTests(BaseConciliacion):
    def test_un_pedido_de_tuu_vencido_se_cancela_sin_tocar_el_stock(self):
        pedido = self.pedido('TUU')
        self.assertEqual(self.ciclo()['cancelado'], 1)
        self.assertEqual(self.estado(pedido), 'cancelado')
        self.assertFalse(Pedido.objects.get(pk=pedido.pk).stock_devuelto)  # RN-03: nunca descontó stock
        self.repositorio.restore_stock.assert_not_called()

    def test_dentro_del_margen_posterior_al_plazo_no_se_cancela(self):
        pedido = self.pedido('TUU')
        Pedido.objects.filter(pk=pedido.pk).update(fecha_creacion=timezone.now() - timedelta(hours=2, minutes=5))
        self.ciclo()
        self.assertEqual(self.estado(pedido), 'pendiente')

    def test_un_pedido_de_tuu_vigente_no_se_toca(self):
        pedido = self.pedido('TUU', horas=1)
        self.ciclo()
        self.assertEqual(self.estado(pedido), 'pendiente')

    def test_un_aviso_de_pago_sobre_un_pedido_ya_cancelado_queda_en_el_log_y_no_lo_reabre(self):
        ConfiguracionPago.objects.create(tienda=self.tienda, datos={'tuu': {
            'enabled': True, 'fields': {'accountId': '62224230', 'secretKey': 'clave-tuu'}}})
        pedido = self.pedido('TUU', estado='cancelado')
        datos = {'x_account_id': '62224230', 'x_reference': pedido.identificador, 'x_amount': '19000',
                 'x_currency': 'CLP', 'x_result': 'completed'}
        datos['x_signature'] = firmar(datos, 'clave-tuu')
        with self.assertLogs('apps.core.presentation.tuu_callback', level='CRITICAL') as log:
            r = APIClient().post(f'/api/pagos/tuu/callback/?tienda={self.tienda.pk}', datos)
        self.assertEqual(r.status_code, 200)
        self.assertIn('PAGO_SOBRE_PEDIDO_CANCELADO', log.output[0])
        self.assertEqual(self.estado(pedido), 'cancelado')

class RutasWebNoLlamanALasPasarelasTests(BaseConciliacion):
    @patch(PP)
    @patch(MP)
    def test_liberar_vencidos_de_la_tienda_deja_los_pedidos_externos_al_proceso_programado(self, mp, pp):
        mercadopago, paypal = self.pedido('MercadoPago', horas=60), self.pedido('PayPal', horas=60)
        transferencia = self.pedido('Transferencia', horas=60)
        with patch(REPOSITORIO, return_value=self.repositorio), self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(liberar_vencidos_de_tienda(self.tienda.pk), 1)
        self.assertEqual(self.estado(transferencia), 'cancelado')
        self.assertEqual((self.estado(mercadopago), self.estado(paypal)), ('pendiente', 'pendiente'))
        mp.return_value.buscar_pagos_por_referencia.assert_not_called()
        pp.return_value.consultar_pago.assert_not_called()

    @patch(MP)
    def test_pagar_ahora_con_el_plazo_vencido_concilia_antes_de_decir_que_expiro(self, adaptador):
        adaptador.return_value.buscar_pagos_por_referencia.return_value = [pago_mp(EstadoPago.APROBADO)]
        pedido = self.pedido('MercadoPago', horas=3)
        api = APIClient()
        with patch(REPOSITORIO, return_value=self.repositorio), self.captureOnCommitCallbacks(execute=True):
            r = api.post('/api/pagos/pedido/pagar/', {
                'tienda_id': self.tienda.pk, 'order_number': pedido.identificador, 'email': 'a@b.cl',
                'return_url': 'http://localhost:5173/plantilla/1/pedido-confirmado'}, format='json')
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.data['error']['codigo'], 'PEDIDO_NO_DISPONIBLE')
        self.assertEqual(self.estado(pedido), 'pagado')


class PagoSobrePedidoCanceladoTests(BaseConciliacion):
    @patch(MP)
    def test_un_pago_aprobado_sobre_un_pedido_ya_cancelado_se_informa_y_queda_en_el_log(self, adaptador):
        adaptador.return_value.consultar_pago.return_value = pago_mp(EstadoPago.APROBADO)
        pedido = self.pedido('MercadoPago', estado='cancelado')
        with self.assertLogs('apps.core.presentation.pagos_externos', level='CRITICAL') as log:
            r = APIClient().post('/api/pagos/mercadopago/confirmar/', {
                'tienda_id': self.tienda.pk, 'order_number': pedido.identificador, 'payment_id': '555'}, format='json')
        self.assertEqual(r.status_code, 409)
        self.assertIn('PAGO_SOBRE_PEDIDO_CANCELADO', log.output[0])
        self.assertEqual(self.estado(pedido), 'cancelado')


class MercadoPagoAdapterTests(TestCase):
    def respuesta(self, datos, status=200):
        r = MagicMock()
        r.status_code, r.json.return_value = status, datos
        return r

    @patch('apps.catalog.infrastructure.adapters.mercadopago_adapter.requests.request')
    def test_la_preferencia_vence_con_el_pedido(self, request):
        request.return_value = self.respuesta({'id': 'pref', 'init_point': 'https://mp.test/x',
                                               'sandbox_init_point': 'https://mp.test/s'}, 201)
        limite = timezone.now() + timedelta(hours=2)
        MercadoPagoAdapter('tok', 'PRODUCCION').iniciar_pago('ORD-1', Decimal('19000'), 'Pedido', 'http://x/r', expira_en=limite)
        carga = request.call_args.kwargs['json']
        self.assertTrue(carga['expires'])
        formato = r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+00:00$'
        self.assertRegex(carga['expiration_date_from'], formato)
        self.assertRegex(carga['expiration_date_to'], formato)
        self.assertGreater(carga['expiration_date_to'], carga['expiration_date_from'])

    @patch('apps.catalog.infrastructure.adapters.mercadopago_adapter.requests.request')
    def test_sin_fecha_limite_la_preferencia_no_vence(self, request):
        request.return_value = self.respuesta({'id': 'pref', 'init_point': 'https://mp.test/x'}, 201)
        MercadoPagoAdapter('tok', 'PRODUCCION').iniciar_pago('ORD-1', Decimal('19000'), 'Pedido', 'http://x/r')
        self.assertNotIn('expires', request.call_args.kwargs['json'])

    @patch('apps.catalog.infrastructure.adapters.mercadopago_adapter.requests.request')
    def test_busca_los_pagos_por_referencia_externa(self, request):
        request.return_value = self.respuesta({'results': [
            {'id': 1, 'status': 'approved', 'external_reference': 'ORD-1', 'transaction_amount': 19000},
            {'id': 2, 'status': 'in_process', 'external_reference': 'ORD-1', 'transaction_amount': 19000},
            {'id': 3, 'status': 'rejected', 'external_reference': 'ORD-1', 'transaction_amount': 19000}]})
        pagos = MercadoPagoAdapter('tok').buscar_pagos_por_referencia('ORD-1')
        self.assertEqual([p.estado for p in pagos], [EstadoPago.APROBADO, EstadoPago.PENDIENTE, EstadoPago.RECHAZADO])
        self.assertEqual(request.call_args.kwargs['params']['external_reference'], 'ORD-1')
        self.assertEqual(pagos[0].monto, Decimal('19000'))

    @patch('apps.catalog.infrastructure.adapters.mercadopago_adapter.requests.request')
    def test_respuesta_invalida_se_informa_como_falla_de_la_pasarela(self, request):
        request.return_value = self.respuesta({'results': 'no es una lista'})
        with self.assertRaises(PagoGatewayException):
            MercadoPagoAdapter('tok').buscar_pagos_por_referencia('ORD-1')


class ComandoExpiradorTests(BaseConciliacion):
    def ejecutar(self, *args):
        salida = StringIO()
        call_command('expirar_pedidos_pendientes', *args, stdout=salida)
        return salida.getvalue()

    def test_una_pasada_informa_el_resumen(self):
        self.pedido('Transferencia', horas=60)
        with patch(REPOSITORIO, return_value=self.repositorio), self.captureOnCommitCallbacks(execute=True):
            self.assertIn('cancelado=1', self.ejecutar())

    def test_una_pasada_que_falla_termina_con_error_para_que_cron_avise(self):
        with patch(f'{COMANDO}.ejecutar_ciclo_de_expiracion', side_effect=RuntimeError('boom')), \
                self.assertLogs(COMANDO, level='ERROR'), self.assertRaises(CommandError):
            self.ejecutar()

    def test_si_otra_pasada_esta_en_curso_se_omite(self):
        from contextlib import contextmanager

        @contextmanager
        def ocupado():
            yield False

        with patch(f'{COMANDO}.exclusion_mutua', ocupado), patch(f'{COMANDO}.ejecutar_ciclo_de_expiracion') as ciclo:
            self.assertIn('omitida', self.ejecutar())
        ciclo.assert_not_called()

    def test_valida_los_argumentos(self):
        with self.assertRaises(CommandError):
            self.ejecutar('--daemon', '--intervalo', '5')
        with self.assertRaises(CommandError):
            self.ejecutar('--lote', '0')

    def test_el_servicio_repite_las_pasadas_late_y_se_detiene_con_sigterm(self):
        from apps.core.management.commands.expirar_pedidos_pendientes import Command

        previos = {s: signal.getsignal(s) for s in (signal.SIGTERM, signal.SIGINT)}
        for numero, manejador in previos.items():
            self.addCleanup(signal.signal, numero, manejador)
        latido = Path(tempfile.mkdtemp()) / 'latido'
        llamadas = []

        def pasada(self_, lote):
            llamadas.append(lote)
            if len(llamadas) == 3:
                os.kill(os.getpid(), signal.SIGTERM)  # como `docker stop`
            return {}

        # Intervalo 0 solo en la prueba (en produccion el minimo es de 30 s) para no esperar entre pasadas.
        with patch.object(Command, '_pasada', pasada), patch(f'{COMANDO}.INTERVALO_MINIMO', 0):
            salida = self.ejecutar('--daemon', '--intervalo', '0', '--lote', '7', '--latido', str(latido))
        self.assertEqual(llamadas, [7, 7, 7])
        self.assertTrue(latido.exists())
        self.assertIn('detenido', salida)

    def test_el_servicio_sobrevive_a_una_pasada_fallida_y_no_late_con_ella(self):
        from apps.core.management.commands.expirar_pedidos_pendientes import Command

        previos = {s: signal.getsignal(s) for s in (signal.SIGTERM, signal.SIGINT)}
        for numero, manejador in previos.items():
            self.addCleanup(signal.signal, numero, manejador)
        latido = Path(tempfile.mkdtemp()) / 'latido'
        llamadas = []

        def pasada(self_, lote):
            llamadas.append(lote)
            if len(llamadas) == 2:
                os.kill(os.getpid(), signal.SIGTERM)
            return None  # la pasada fallo

        with patch.object(Command, '_pasada', pasada), patch(f'{COMANDO}.INTERVALO_MINIMO', 0):
            self.ejecutar('--daemon', '--intervalo', '0', '--latido', str(latido))
        self.assertEqual(len(llamadas), 2)  # la primera pasada fallo y el servicio siguio con la segunda
        self.assertFalse(latido.exists())  # ninguna pasada termino bien: el healthcheck lo detectaria
