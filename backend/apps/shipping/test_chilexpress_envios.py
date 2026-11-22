import base64
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from apps.shipping.domain.dtos import DireccionDespachoDTO, PaqueteDTO
from apps.shipping.domain.exceptions import (
    FormatoSeguimientoInvalidoException, ProveedorLogisticoError, RespuestaLogisticaInvalidaException,
)
from apps.shipping.infrastructure import live
from apps.shipping.infrastructure.adapters import ChilexpressAdapter
from apps.shipping.infrastructure.carrier_clients import ChilexpressClient
from apps.shipping.infrastructure.chilexpress_envios import (
    procesar_orden_transporte, procesar_seguimiento, tipo_contenido_etiqueta,
)

PNG = b'\x89PNG\r\n\x1a\n' + b'0' * 8
RESPUESTA_OT = {'statusCode': 0, 'statusDescription': 'OK', 'data': {
    'header': {'certificateNumber': 4455},
    'detail': [{'transportOrderNumber': 99726299584, 'barcode': '0099726299584',
                'label': {'labelData': base64.b64encode(PNG).decode(), 'labelType': 2}}]}}
RESPUESTA_TRACKING = {'statusCode': 0, 'data': {
    'transportOrderData': {'status': 'ENTREGADO', 'locationStatus': 'Providencia'},
    'deliveryData': {'receptorRut': '11111111-1', 'receptorName': 'Ana Pérez', 'deliveryDateTime': '2026-11-12 15:30'},
    'trackingEvents': [
        {'eventDate': '10/11/2026', 'eventHour': '09:00', 'description': 'Admitido', 'location': 'Origen',
         'code': {'clientEventDescription': 'Admisión'}},
        {'eventDate': '12/11/2026', 'eventHour': '15:30', 'description': 'Entregado', 'location': 'Providencia',
         'certificadoEntrega': 'https://cert.test/a.pdf', 'code': {'clientEventDescription': 'Entrega'}}]}}


def cliente(session):
    return ChilexpressClient(
        api_keys={'cotizador': 'K-COT', 'coberturas': 'K-COB', 'envios': 'K-ENV'}, origin_county_code='PUDA',
        ambiente='SANDBOX', tcc='18578680', rut='96756430', session=session)


def respuesta(body, status=200):
    r = MagicMock(status_code=status)
    r.json.return_value = body
    return r


class GuiaAutomaticaClienteTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

    def test_orden_de_transporte_cumple_la_especificacion(self):
        session = MagicMock()
        session.request.side_effect = [
            respuesta({'data': {'coverageAreas': [{'countyName': 'Providencia', 'countyCode': 'PROV'}]}}),
            respuesta(RESPUESTA_OT),
        ]
        cliente(session).crear_orden_transporte(
            referencia='ORD-1', destino={'region': 'Metropolitana', 'comuna': 'Providencia', 'calle': 'AV MANUEL MONTT',
                                         'numero': '427', 'contacto': {'nombre': 'Ana', 'telefono': '1', 'correo': 'a@b.cl'}},
            origen={'calle': 'SARMIENTO', 'numero': '120'}, remitente={'nombre': 'Tienda', 'telefono': '2', 'correo': 't@b.cl'},
            paquete={'peso_kg': Decimal('1'), 'alto_cm': 10, 'ancho_cm': 10, 'largo_cm': 10,
                     'valor_declarado': Decimal('1000'), 'servicio': '3'})
        llamada = session.request.call_args_list[1]
        self.assertEqual(llamada.args[:2], ('POST', 'https://testservices.wschilexpress.com/transport-orders/api/v1.0/transport-orders'))
        headers = llamada.kwargs['headers']
        self.assertEqual(headers['Ocp-Apim-Subscription-Key'], 'K-ENV')
        self.assertEqual(headers['Content-Type'], 'application/json')
        body = llamada.kwargs['json']
        self.assertEqual(body['header'], {
            'certificateNumber': 0, 'customerCardNumber': '18578680', 'countyOfOriginCoverageCode': 'PUDA',
            'labelType': 2, 'marketplaceRut': '96756430', 'sellerRut': 'DEFAULT'})
        dest, dev = body['details'][0]['addresses']
        self.assertEqual((dest['addressType'], dest['countyCoverageCode'], dest['streetNumber']), ('DEST', 'PROV', '427'))
        self.assertEqual((dev['addressType'], dev['countyCoverageCode']), ('DEV', 'PUDA'))
        self.assertEqual([c['contactType'] for c in body['details'][0]['contacts']], ['R', 'D'])
        paquete = body['details'][0]['packages'][0]
        self.assertEqual((paquete['weight'], paquete['height'], paquete['declaredValue'], paquete['productCode'],
                          paquete['serviceDeliveryCode'], paquete['declaredContent']), ('1', '10', '1000', '3', '3', '5'))
        self.assertTrue(all(isinstance(paquete[k], str) for k in ('weight', 'height', 'width', 'length', 'declaredValue')))

    def test_status_code_distinto_de_cero_es_error(self):
        session = MagicMock()
        session.request.return_value = respuesta({'statusCode': 8, 'statusDescription': 'Tarjeta inválida'})
        with self.assertRaises(ProveedorLogisticoError) as ctx:
            cliente(session).seguimiento('99726299584')
        self.assertIn('Tarjeta inválida', str(ctx.exception))

    def test_seguimiento_cumple_la_especificacion(self):
        session = MagicMock()
        session.request.return_value = respuesta(RESPUESTA_TRACKING)
        cliente(session).seguimiento('99726299584', referencia='PEDIDO-123')
        llamada = session.request.call_args
        self.assertEqual(llamada.args[:2], ('POST', 'https://testservices.wschilexpress.com/transport-orders/api/v1.0/tracking'))
        self.assertEqual(llamada.kwargs['json'], {'reference': 'PEDIDO-123', 'transportOrderNumber': 99726299584,
                                                  'rut': 96756430, 'showTrackingEvents': 1})
        self.assertEqual(llamada.kwargs['headers']['Ocp-Apim-Subscription-Key'], 'K-ENV')

    def test_orden_sin_credenciales_de_envios_no_se_envia(self):
        session = MagicMock()
        incompleto = ChilexpressClient(api_keys={'cotizador': 'a', 'coberturas': 'b'}, origin_county_code='PUDA',
                                       tcc='1', rut='2', session=session)
        with self.assertRaises(ProveedorLogisticoError):
            incompleto.crear_orden_transporte(referencia='x', destino={}, origen={}, remitente={}, paquete={})
        session.request.assert_not_called()


class ParsersTests(SimpleTestCase):
    def test_orden_de_transporte(self):
        guia = procesar_orden_transporte(RESPUESTA_OT)
        self.assertEqual((guia['numero_ot'], guia['certificado'], guia['codigo_barras'], guia['tipo_etiqueta']),
                         ('99726299584', '4455', '0099726299584', '2'))
        raw, tipo = tipo_contenido_etiqueta(guia['etiqueta'])
        self.assertEqual((raw, tipo), (PNG, 'image/png'))

    def test_orden_invalida(self):
        for malo in ({}, {'data': {}}, {'data': {'detail': []}}, {'data': {'detail': [{'barcode': 'x'}]}}):
            with self.assertRaises(ValueError):
                procesar_orden_transporte(malo)
        self.assertIsNone(tipo_contenido_etiqueta('no es base64!!'))

    def test_seguimiento(self):
        detalle = procesar_seguimiento(RESPUESTA_TRACKING)
        self.assertEqual((detalle['estado'], detalle['ubicacion_estado']), ('ENTREGADO', 'Providencia'))
        self.assertEqual(detalle['entrega']['receptor_nombre'], 'Ana Pérez')
        self.assertEqual(detalle['eventos'][1]['certificado_entrega'], 'https://cert.test/a.pdf')
        self.assertEqual(detalle['eventos'][0]['fecha'], '10/11/2026 09:00')
        self.assertEqual(detalle['eventos'][0]['estado'], 'Admisión')

    def test_seguimiento_invalido(self):
        for malo in ({}, {'data': {}}, {'data': {'transportOrderData': {}, 'trackingEvents': 'x'}},
                     {'data': {'transportOrderData': {}}}):
            with self.assertRaises(ValueError):
                procesar_seguimiento(malo)


class AdaptadorChilexpressEnVivoTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

    def _dir(self):
        return DireccionDespachoDTO(calle='Av. Manuel Montt', numero='427', comuna='Providencia', region='Metropolitana',
                                    depto_casa='501')

    def _paquete(self):
        return PaqueteDTO(peso_kg=Decimal('1'), alto_cm=Decimal('10'), ancho_cm=Decimal('10'),
                          largo_cm=Decimal('10'), valor_declarado=Decimal('1000'))

    @override_settings(SHIPPING_ALLOW_SIMULATED=False)
    def test_generar_despacho_real(self):
        client = MagicMock()
        client.crear_orden_transporte.return_value = RESPUESTA_OT
        with patch.object(live, 'get_shipping_client', return_value=client):
            guia = ChilexpressAdapter().generar_despacho(
                'ORD-1', self._dir(), self._dir(), [self._paquete()],
                contacto_destino={'nombre': 'Ana'}, remitente={'nombre': 'Tienda'}, servicio='5')
        self.assertEqual((guia.numero_seguimiento, guia.certificado, guia.codigo_barras), ('99726299584', '4455', '0099726299584'))
        self.assertTrue(guia.etiqueta)
        kwargs = client.crear_orden_transporte.call_args.kwargs
        self.assertEqual(kwargs['referencia'], 'ORD-1')
        self.assertEqual(kwargs['paquete']['servicio'], '5')
        self.assertEqual(kwargs['destino']['contacto'], {'nombre': 'Ana'})

    @override_settings(SHIPPING_ALLOW_SIMULATED=False)
    def test_generar_despacho_respuesta_invalida(self):
        client = MagicMock()
        client.crear_orden_transporte.return_value = {'statusCode': 0, 'data': {}}
        with patch.object(live, 'get_shipping_client', return_value=client):
            with self.assertRaises(RespuestaLogisticaInvalidaException):
                ChilexpressAdapter().generar_despacho('1', self._dir(), self._dir(), [self._paquete()])

    @override_settings(SHIPPING_ALLOW_SIMULATED=False)
    def test_seguimiento_real_normaliza_entrega_y_eventos(self):
        client = MagicMock()
        client.seguimiento.return_value = RESPUESTA_TRACKING
        with patch.object(live, 'get_shipping_client', return_value=client):
            detalle = ChilexpressAdapter().consultar_seguimiento('99726299584')
        self.assertEqual(detalle.estado_actual, 'ENTREGADO')
        self.assertEqual((detalle.receptor_nombre, detalle.fecha_entrega), ('Ana Pérez', '2026-11-12 15:30'))
        self.assertEqual(detalle.fecha_estimada_entrega, '')

    @override_settings(SHIPPING_ALLOW_SIMULATED=False)
    def test_seguimiento_real_rechaza_codigos_no_numericos(self):
        with patch.object(live, 'get_shipping_client', return_value=MagicMock()):
            with self.assertRaises(FormatoSeguimientoInvalidoException):
                ChilexpressAdapter().consultar_seguimiento('CHILEX-ABC')

    @override_settings(CHILEXPRESS_API_KEY='k', CHILEXPRESS_ENVIOS_API_KEY='k')
    def test_sin_tienda_no_hay_cliente_de_envios(self):
        self.assertIsNone(live.get_shipping_client())
