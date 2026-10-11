"""Estados del pedido (SCRUM-355 y 356): los estados de despacho no deben romper pagos ni avisos."""
import hashlib
import hmac
import json
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.catalog.application.use_cases import ConfirmarPagoTransbankUseCase
from apps.catalog.domain.exceptions import TransbankTransaccionException
from apps.core.models import ConfiguracionPago, Pedido, Tienda

CLAVE = 'clave-privada-qa'
LINKIFY = {'linkify': {'enabled': True, 'fields': {'idCuenta': 'CUENTA-QA', 'clavePrivada': CLAVE}}}
EN_DESPACHO = ('preparando', 'en_origen', 'enviado', 'en_reparto', 'entregado')


class GruposDeEstadosTests(TestCase):
    def test_cada_estado_esta_clasificado(self):
        estados = {valor for valor, _ in Pedido.ESTADO_CHOICES}
        self.assertIn('en_reparto', estados)
        for estado in estados - {'pendiente', 'cancelado'}:
            self.assertIn(estado, Pedido.ESTADOS_PAGADOS, f'{estado} falta en ESTADOS_PAGADOS')
        self.assertEqual(set(Pedido.ESTADOS_EN_DESPACHO), set(Pedido.ESTADOS_PAGADOS) - {'pagado'})
        self.assertEqual(set(Pedido.ESTADOS_EN_DESPACHO), set(EN_DESPACHO))
        self.assertTrue(set(Pedido.ESTADOS_PAGADOS) <= estados)

    def test_los_cambios_de_estados_tienen_migracion(self):
        # Falla si alguien cambia Pedido.ESTADO_CHOICES y olvida generar la migracion.
        call_command('makemigrations', 'core', check=True, dry_run=True, verbosity=0)


class EstadosDeDespachoTests(TestCase):
    def setUp(self):
        self.propietario = get_user_model().objects.create_user(username='estados-owner')
        self.tienda = Tienda.objects.create(nombre='Tienda estados', id_usuario_propietario=self.propietario)
        ConfiguracionPago.objects.create(tienda=self.tienda, datos=LINKIFY)

    def pedido(self, estado, medio_pago='Linkify', **extra):
        datos = dict(tienda=self.tienda, monto_total=Decimal('18990'), medio_pago=medio_pago, estado=estado,
                     correo_contacto='comprador@example.com', identificador='ORD-20261008-AB12')
        datos.update(extra)
        return Pedido.objects.create(**datos)

    def estado(self, pedido):
        return Pedido.objects.get(pk=pedido.pk).estado

    # ------------------------------------------------ avisos de Linkify
    def avisar(self, pedido, accion, monto=18990):
        cuerpo = json.dumps({'id_pago': pedido.pk, 'action': accion, 'monto': monto}).encode()
        firma = hmac.new(CLAVE.encode(), cuerpo, hashlib.sha256).hexdigest()
        return self.client.post('/api/pagos/linkify/notificacion/', data=cuerpo, content_type='application/json',
                                HTTP_X_LINKIFY_CONFIRMATION=firma)

    def test_aviso_repetido_de_un_pedido_ya_en_despacho_es_inofensivo(self):
        for estado in EN_DESPACHO:
            with self.subTest(estado=estado):
                pedido = self.pedido(estado)
                respuesta = self.avisar(pedido, 'notification')
                self.assertEqual(respuesta.status_code, 200, respuesta.content)
                self.assertEqual(self.estado(pedido), estado)

    def test_anulacion_de_un_pedido_en_despacho_exige_revision_manual(self):
        for estado in EN_DESPACHO:
            with self.subTest(estado=estado):
                pedido = self.pedido(estado)
                respuesta = self.avisar(pedido, 'cancellation')
                self.assertEqual(respuesta.status_code, 409, respuesta.content)
                self.assertEqual(respuesta.json()['error']['codigo'], 'PEDIDO_YA_ENVIADO')
                self.assertEqual(self.estado(pedido), estado)

    def test_anulacion_de_un_pedido_solo_pagado_sigue_volviendo_a_pendiente(self):
        pedido = self.pedido('pagado')
        self.assertEqual(self.avisar(pedido, 'cancellation').status_code, 200)
        self.assertEqual(self.estado(pedido), 'pendiente')

    def test_la_consulta_de_linkify_acepta_pedidos_ya_pagados_pero_no_cancelados(self):
        for estado, esperado in [('pendiente', 200), ('pagado', 200), ('preparando', 200), ('en_reparto', 200),
                                 ('entregado', 200), ('cancelado', 409)]:
            with self.subTest(estado=estado):
                pedido = self.pedido(estado)
                firma = hmac.new(CLAVE.encode(), b'', hashlib.sha256).hexdigest()
                respuesta = self.client.get(f'/api/pagos/linkify/notificacion/?id_pago={pedido.pk}',
                                            HTTP_X_LINKIFY_CONFIRMATION=firma)
                self.assertEqual(respuesta.status_code, esperado, respuesta.content)

    # ------------------------------------- verificacion manual de Linkify
    def test_la_verificacion_manual_no_retrocede_un_pedido_en_despacho(self):
        api = APIClient()
        api.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=self.propietario).key)
        for estado in EN_DESPACHO + ('cancelado',):
            with self.subTest(estado=estado):
                pedido = self.pedido(estado)
                respuesta = api.post('/api/pagos/linkify/verificar/', {'pedido_id': pedido.pk}, format='json')
                self.assertEqual(respuesta.status_code, 409, respuesta.content)
                self.assertEqual(respuesta.json()['error']['codigo'], 'ESTADO_PEDIDO_INVALIDO')
                self.assertEqual(self.estado(pedido), estado)

    # ------------------------------------------------------ Webpay
    def cobro(self, pedido):
        return {'orden_compra': pedido.identificador, 'monto': 18990}

    def test_webpay_concilia_un_pedido_pagado_aunque_ya_este_en_despacho(self):
        for estado in ('pagado',) + EN_DESPACHO:
            with self.subTest(estado=estado):
                pedido = self.pedido(estado, medio_pago='Transbank')
                ConfirmarPagoTransbankUseCase._registrar_pago_aprobado(self.tienda.pk, self.cobro(pedido))
                self.assertEqual(self.estado(pedido), estado)
                pedido.delete()

    def test_webpay_marca_pagado_un_pedido_pendiente_y_rechaza_uno_cancelado(self):
        pedido = self.pedido('pendiente', medio_pago='Transbank')
        ConfirmarPagoTransbankUseCase._registrar_pago_aprobado(self.tienda.pk, self.cobro(pedido))
        self.assertEqual(self.estado(pedido), 'pagado')
        cancelado = self.pedido('cancelado', medio_pago='Transbank', identificador='ORD-20261008-CD34')
        with self.assertRaises(TransbankTransaccionException):
            ConfirmarPagoTransbankUseCase._registrar_pago_aprobado(self.tienda.pk, self.cobro(cancelado))
