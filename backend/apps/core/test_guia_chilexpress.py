import base64
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.delivery import merge_carrier_credentials
from apps.core.models import ConfiguracionEntrega, Pedido, Tienda
from apps.shipping.infrastructure.carrier_clients import ChilexpressClient

PNG = b'\x89PNG\r\n\x1a\n' + b'0' * 8
RESPUESTA_OT = {'statusCode': 0, 'data': {
    'header': {'certificateNumber': 77},
    'detail': [{'transportOrderNumber': 99726299584, 'barcode': '0099',
                'label': {'labelData': base64.b64encode(PNG).decode(), 'labelType': 2}}]}}
RESPUESTA_TRACKING = {'statusCode': 0, 'data': {
    'transportOrderData': {'status': 'EN REPARTO', 'locationStatus': 'Providencia'},
    'trackingEvents': [{'eventDate': '10/11/2026', 'eventHour': '09:00', 'description': 'Admitido',
                        'location': 'Origen', 'code': {'clientEventDescription': 'Admisión'}}]}}
ENTREGA = {'metodo': 'Chilexpress', 'cotizacion': {'servicio_codigo': '5', 'monto': '4990'},
           'direccion': {'street': 'Av. Manuel Montt', 'number': '427', 'apt': '', 'city': 'Providencia',
                         'region': 'Metropolitana de Santiago'}}


class GuiaChilexpressTests(TestCase):
    def setUp(self):
        owner = get_user_model().objects.create_user(username='guia-owner', email='dueno@example.com')
        self.tienda = Tienda.objects.create(nombre='Tienda Guía', id_usuario_propietario=owner)
        datos = {'chilexpress': {'enabled': True, 'ambiente': 'SANDBOX'}}
        datos['credenciales_transportistas'] = merge_carrier_credentials(datos, 'chilexpress', {
            'envios': 'ENVIOS-1234567890', 'tcc': '18578680', 'rut': '96756430', 'origen': 'PUDA',
            'origen_calle': 'Sarmiento', 'origen_numero': '120', 'telefono': '987654321'})
        ConfiguracionEntrega.objects.create(tienda=self.tienda, datos=datos)
        self.api = APIClient()
        self.api.force_authenticate(owner)
        self.pedido = Pedido.objects.create(
            tienda=self.tienda, monto_total=Decimal('24990'), costo_envio=Decimal('4990'), estado='pagado',
            nombre_contacto='Ana', correo_contacto='ana@example.com', telefono_contacto='+56911112222',
            entrega=dict(ENTREGA))
        self.base = f'/api/tienda/pedidos/{self.pedido.id_pedido}'

    def _cliente(self, respuestas):
        session = MagicMock()
        session.request.side_effect = [MagicMock(status_code=200, json=MagicMock(return_value=r)) for r in respuestas]
        cliente = ChilexpressClient(api_keys={'envios': 'ENVIOS-1234567890', 'coberturas': 'COB'}, origin_county_code='PUDA',
                                    tcc='18578680', rut='96756430', session=session)
        return cliente, session

    def _emitir(self, respuestas=None):
        cliente, session = self._cliente(respuestas or [
            {'data': {'coverageAreas': [{'countyName': 'Providencia', 'countyCode': 'PROV'}]}}, RESPUESTA_OT])
        with patch('apps.shipping.infrastructure.live.get_shipping_client', return_value=cliente):
            return self.api.post(f'{self.base}/guia-chilexpress/'), session

    def test_emite_la_guia_y_guarda_el_numero_sin_cambiar_el_estado(self):
        with patch('apps.core.presentation.guia_envio.live.get_shipping_client') as fake:
            fake.return_value = self._cliente([
                {'data': {'coverageAreas': [{'countyName': 'Providencia', 'countyCode': 'PROV'}]}}, RESPUESTA_OT])[0]
            response = self.api.post(f'{self.base}/guia-chilexpress/')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['data']['numero_ot'], '99726299584')
        self.assertNotIn('etiqueta', response.data['data'])
        pedido = Pedido.objects.get(pk=self.pedido.pk)
        self.assertEqual(pedido.estado, 'pagado')
        self.assertEqual(pedido.entrega['codigo_seguimiento'], '99726299584')
        self.assertEqual(pedido.entrega['guia']['certificado'], '77')

    def test_usa_el_codigo_de_servicio_de_la_cotizacion_firmada(self):
        cliente, session = self._cliente([
            {'data': {'coverageAreas': [{'countyName': 'Providencia', 'countyCode': 'PROV'}]}}, RESPUESTA_OT])
        with patch('apps.core.presentation.guia_envio.live.get_shipping_client', return_value=cliente), \
                patch('apps.shipping.infrastructure.live.get_shipping_client', return_value=cliente):
            self.api.post(f'{self.base}/guia-chilexpress/')
        body = session.request.call_args_list[-1].kwargs['json']
        self.assertEqual(body['details'][0]['packages'][0]['serviceDeliveryCode'], '5')
        self.assertEqual(body['details'][0]['packages'][0]['declaredValue'], '20000')

    def test_es_idempotente_no_emite_dos_guias(self):
        cliente, session = self._cliente([
            {'data': {'coverageAreas': [{'countyName': 'Providencia', 'countyCode': 'PROV'}]}}, RESPUESTA_OT])
        with patch('apps.core.presentation.guia_envio.live.get_shipping_client', return_value=cliente), \
                patch('apps.shipping.infrastructure.live.get_shipping_client', return_value=cliente):
            primera = self.api.post(f'{self.base}/guia-chilexpress/')
            llamadas = session.request.call_count
            segunda = self.api.post(f'{self.base}/guia-chilexpress/')
        self.assertEqual((primera.status_code, segunda.status_code), (201, 200))
        self.assertEqual(session.request.call_count, llamadas)

    def test_rechaza_pedidos_no_pagados_o_de_otro_transportista(self):
        Pedido.objects.filter(pk=self.pedido.pk).update(estado='pendiente')
        self.assertEqual(self.api.post(f'{self.base}/guia-chilexpress/').status_code, 409)
        Pedido.objects.filter(pk=self.pedido.pk).update(estado='pagado', entrega={'metodo': 'Starken'})
        self.assertEqual(self.api.post(f'{self.base}/guia-chilexpress/').data['error']['codigo'], 'METODO_NO_CHILEXPRESS')

    def test_sin_clave_de_envios_pide_configurarla(self):
        with patch('apps.core.presentation.guia_envio.live.get_shipping_client', return_value=None):
            response = self.api.post(f'{self.base}/guia-chilexpress/')
        self.assertEqual(response.data['error']['codigo'], 'CHILEXPRESS_NO_CONFIGURADO')

    def test_error_del_transportista_no_guarda_nada(self):
        cliente, _ = self._cliente([
            {'data': {'coverageAreas': [{'countyName': 'Providencia', 'countyCode': 'PROV'}]}},
            {'statusCode': 8, 'statusDescription': 'Tarjeta inválida'}])
        with patch('apps.core.presentation.guia_envio.live.get_shipping_client', return_value=cliente), \
                patch('apps.shipping.infrastructure.live.get_shipping_client', return_value=cliente):
            response = self.api.post(f'{self.base}/guia-chilexpress/')
        self.assertEqual(response.status_code, 502)
        self.assertNotIn('guia', Pedido.objects.get(pk=self.pedido.pk).entrega)

    def test_solo_el_propietario_de_la_tienda(self):
        otro = get_user_model().objects.create_user(username='intruso')
        api = APIClient()
        api.force_authenticate(otro)
        self.assertIn(api.post(f'{self.base}/guia-chilexpress/').status_code, (403, 404))
        self.assertIn(APIClient().post(f'{self.base}/guia-chilexpress/').status_code, (401, 403))

    def test_etiqueta_se_descarga_y_el_comprador_no_la_ve(self):
        self._emitir()
        etiqueta = self.api.get(f'{self.base}/guia-chilexpress/etiqueta/')
        self.assertEqual((etiqueta.status_code, etiqueta['Content-Type']), (200, 'image/png'))
        self.assertEqual(etiqueta.content, PNG)
        from apps.core.presentation.customer_orders import OrderDetailSerializer
        pedido = Pedido.objects.get(pk=self.pedido.pk)
        Pedido.objects.filter(pk=pedido.pk).update(clave_checkout='11111111-1111-1111-1111-111111111111')
        data = OrderDetailSerializer(Pedido.objects.get(pk=pedido.pk)).data
        self.assertNotIn('etiqueta', data['entrega']['guia'])
        self.assertEqual(data['entrega']['guia']['numero_ot'], '99726299584')

    def test_sin_etiqueta_responde_404(self):
        self.assertEqual(self.api.get(f'{self.base}/guia-chilexpress/etiqueta/').status_code, 404)

    def test_seguimiento_real_del_pedido(self):
        Pedido.objects.filter(pk=self.pedido.pk).update(entrega={**ENTREGA, 'codigo_seguimiento': '99726299584'})
        cliente, session = self._cliente([RESPUESTA_TRACKING])
        with patch('apps.shipping.infrastructure.live.get_shipping_client', return_value=cliente):
            response = self.api.get(f'{self.base}/seguimiento/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['estado_actual'], 'EN REPARTO')
        self.assertEqual(session.request.call_args.kwargs['json']['transportOrderNumber'], 99726299584)

    def test_seguimiento_sin_guia_responde_404(self):
        self.assertEqual(self.api.get(f'{self.base}/seguimiento/').data['error']['codigo'], 'SIN_GUIA')
