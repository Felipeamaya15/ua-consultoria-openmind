"""Pruebas con proveedor simulado: nunca emiten despachos reales."""
import base64
from datetime import timedelta
from unittest.mock import patch, MagicMock
from django.contrib.auth import get_user_model
from django.test import TestCase, SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate
from apps.core.models import Tienda, Pedido, OrigenDespachoBlue
from apps.shipping.models import BlueShipment
from apps.shipping.application import blue_dispatch as service
from apps.shipping.infrastructure.blue_express.operations import BlueOperationsClient, physical_packages, parse_tracking, pdf_content
from apps.shipping.infrastructure.blue_express.client import BlueExpressAPIError
from apps.shipping.infrastructure.blue_express.config import BlueExpressConfigurationError
from apps.shipping.presentation.blue_dispatch import BlueDispatchView, BlueLabelView

CONFIG = dict(ENABLED=True, ENVIRONMENT='qa', TOKEN='test-only', USERCODE='test', CLIENT_ACCOUNT='test-account', USERNAME='test',
    EMISSION_URL='https://qa-bx-tracking.bluex.cl/bx-emission/v1', LABEL_URL='https://qa-bx-tracking.bluex.cl/bx-label/v1',
    TRACKING_URL='https://qaapigw.bluex.cl/bx-tracking/v1/tracking-pull', CONNECT_TIMEOUT=3, READ_TIMEOUT=10)
PDF = base64.b64encode(b'%PDF-1.4\n%%EOF').decode()
EMISSION = {'status':True,'data':{'trackingNumber':12345,'labels':[{'contenido':PDF}]}}
TRACKING = {'status':True,'data':{'nroOS':'12345','numeroReferencia':'BX1-PSE-20261111','macroEstadoActual':'En reparto',
    'direccion':'PRIVATE', 'cuenta':'PRIVATE','pinchazos':[{'fechaHora':'2026-11-11T12:00:00','tipoMovimiento':{'codigo':'ER','descripcion':'En reparto'}}]}}
PACKAGES = [{'weight':'2','length':'20','width':'15','height':'10'}]
CLIENT = 'apps.shipping.application.blue_dispatch.BlueOperationsClient.request'

@override_settings(BLUE_EXPRESS=CONFIG, BLUE_EXPRESS_EMISSION_ENABLED=True)
class BlueDispatchTests(TestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.owner=get_user_model().objects.create_user(username='blue-owner')
        self.other=get_user_model().objects.create_user(username='blue-other')
        self.store=Tienda.objects.create(nombre='Prueba',id_usuario_propietario=self.owner)
        self.order=Pedido.objects.create(tienda=self.store,estado='pagado',monto_total=13990,nombre_contacto='Cliente Prueba',
            correo_contacto='test@example.com',telefono_contacto='+56900000000',entrega={'metodo':'Blue Express',
            'direccion':{'street':'Calle','number':'123','apt':''},'cotizacion':{'destino_blue':{'region_code':13,'commune_code':13123,'district_code':'PRO'}}})
        OrigenDespachoBlue.objects.create(tienda=self.store,region_code=13,commune_code=13123,district_code='PRO',direccion='Origen 123',nombre_remitente='Tienda',telefono='+56900000001')
    def emit(self):
        return service.emit(order_id=self.order.pk,store_id=self.store.pk,packages=PACKAGES)
    def api(self, data=None, user='owner', label=None):
        factory=APIRequestFactory()
        request=factory.get('/') if data is None else factory.post('/',data,format='json')
        if user is not None: force_authenticate(request,user=getattr(self,user))
        return (BlueLabelView.as_view()(request,order_id=self.order.pk,index=label) if label is not None
                else BlueDispatchView.as_view()(request,order_id=self.order.pk))
    @patch(CLIENT,return_value=EMISSION)
    def test_emit_persists_tracking_and_pdf_without_exposing_payload(self, client):
        shipment=self.emit()
        self.assertEqual(shipment.state,'emitted')
        self.assertEqual(shipment.labels,[PDF])
        self.order.refresh_from_db()
        self.assertEqual(self.order.entrega['blue_express']['tracking'],'12345')
        self.assertNotIn('payload',self.api().data['data'])
        self.assertNotIn(PDF,str(self.order.entrega))
        payload=client.call_args.kwargs['payload']
        self.assertEqual(payload['packages'][0]['weight'],2)
        self.assertEqual(payload['printFormatCode'],4)
        self.assertRegex(payload['orderNumber'],r'^BX[0-9a-f]{18}$')
    @patch(CLIENT,return_value=EMISSION)
    def test_double_submit_emits_once(self, client):
        first=self.emit(); second=self.emit()
        self.assertEqual(first.pk,second.pk); client.assert_called_once()
    @patch(CLIENT,side_effect=BlueExpressAPIError('timeout'))
    def test_timeout_stays_unknown_and_blocks_retry(self, client):
        with self.assertRaises(BlueExpressAPIError): self.emit()
        self.assertEqual(BlueShipment.objects.get().state,'unknown')
        with self.assertRaises(service.DispatchConflict): self.emit()
        client.assert_called_once()
    @patch(CLIENT,return_value={'status':True,'data':{'trackingNumber':12345,'labels':[{'contenido':'invalid'}]}})
    def test_bad_label_keeps_tracking_and_does_not_reemit(self, client):
        self.assertEqual(self.emit().labels,[])
        self.emit(); client.assert_called_once()
    @patch(CLIENT)
    def test_unpaid_never_emits(self, client):
        self.order.estado='pendiente'; self.order.save()
        self.assertEqual(self.api({'accion':'emitir','bultos':PACKAGES}).status_code,409)
        client.assert_not_called()
    @patch(CLIENT)
    def test_invalid_packages_never_emit(self, client):
        self.assertEqual(self.api({'accion':'emitir','bultos':[{'weight':0}]}).status_code,400)
        client.assert_not_called(); self.assertFalse(BlueShipment.objects.exists())
    @patch(CLIENT)
    def test_owner_required(self, client):
        self.assertEqual(self.api({'accion':'emitir','bultos':PACKAGES},user='other').status_code,403)
        self.assertEqual(self.api(user=None).status_code,401)
        client.assert_not_called()
    @patch(CLIENT,return_value=EMISSION)
    def test_private_label_download(self, client):
        self.emit()
        response=self.api(label=0)
        self.assertEqual(response['Content-Type'],'application/pdf')
        self.assertEqual(response['Cache-Control'],'no-store')
        self.assertEqual(response.content,base64.b64decode(PDF))
        self.assertEqual(self.api(user='other',label=0).status_code,403)
        self.assertEqual(self.api(label=1).status_code,404)
    @patch(CLIENT,return_value=EMISSION)
    def test_tracking_publishes_only_safe_fields(self, client):
        shipment=self.emit(); client.return_value=TRACKING
        service.refresh(shipment=shipment); self.order.refresh_from_db()
        result=self.order.entrega['blue_express']['seguimiento']
        self.assertEqual(result['estado'],'En reparto'); self.assertNotIn('PRIVATE',str(result))
        self.assertEqual(self.order.estado,'pagado')  # No inventar mapeos de estados del proveedor.
    @patch(CLIENT,return_value=EMISSION)
    def test_account_change_rejected(self, client):
        shipment=self.emit()
        with override_settings(BLUE_EXPRESS={**CONFIG,'CLIENT_ACCOUNT':'other'}):
            with self.assertRaises(service.DispatchConflict): service.refresh(shipment=shipment)
            with self.assertRaises(service.DispatchConflict): self.emit()
        client.assert_called_once()
    @patch(CLIENT,return_value=EMISSION)
    def test_retrieve_missing_labels(self, client):
        shipment=self.emit(); client.return_value={'status':True,'data':[{'base64':PDF}]}
        shipment.labels=[]; shipment.save()
        self.assertEqual(service.retrieve_labels(shipment=shipment).labels,[PDF])
    @patch(CLIENT,side_effect=BlueExpressAPIError('timeout'))
    def test_reconcile_checks_reference_and_waits(self, client):
        with self.assertRaises(BlueExpressAPIError): self.emit()
        shipment=BlueShipment.objects.get()
        client.side_effect=None; client.return_value={**TRACKING,'data':{**TRACKING['data'],'numeroReferencia':shipment.payload['orderNumber']+'-PSE-20261111'}}
        with self.assertRaises(service.DispatchConflict): service.reconcile(shipment=shipment,number='12345')
        BlueShipment.objects.filter(pk=shipment.pk).update(updated_at=timezone.now()-timedelta(minutes=3))
        client.return_value['data']['numeroReferencia']='OTHER'
        with self.assertRaises(service.DispatchConflict): service.reconcile(shipment=shipment,number='12345')
        client.return_value['data']['numeroReferencia']=shipment.payload['orderNumber']+'-PSE-20261111'
        result=service.reconcile(shipment=shipment,number='12345')
        self.assertEqual(result.state,'emitted'); self.assertEqual(result.tracking_number,'12345')
    @patch(CLIENT,return_value=EMISSION)
    def test_buyer_tracking_requires_matching_email_and_excludes_labels(self,client):
        from apps.core.presentation.order_tracking import OrderTrackingAPIView
        self.order.identificador='ORD-20261111-ABCD'; self.order.save()
        self.emit()
        def lookup(email):
            request=APIRequestFactory().post('/',{'identificador':self.order.identificador,'email':email},format='json')
            return OrderTrackingAPIView.as_view()(request)
        self.assertEqual(lookup('wrong@example.com').status_code,404)
        response=lookup(self.order.correo_contacto)
        self.assertEqual(response.status_code,200)
        delivery=response.data['data']['entrega']
        self.assertEqual(delivery['blue_express']['tracking'],'12345')
        self.assertNotIn('direccion',delivery)
        self.assertNotIn(PDF,str(response.data))
    @override_settings(BLUE_EXPRESS_EMISSION_ENABLED=False)
    @patch(CLIENT)
    def test_emission_disabled_by_default(self,client):
        self.assertEqual(self.api({'accion':'emitir','bultos':PACKAGES}).status_code,503)
        client.assert_not_called()

@override_settings(BLUE_EXPRESS=CONFIG,BLUE_EXPRESS_EMISSION_ENABLED=True)
class BlueOperationsTests(SimpleTestCase):
    def test_invalid_measures_rejected(self):
        for value in (True,0,-1,'NaN','Infinity',None):
            with self.subTest(value=value),self.assertRaises(ValueError): physical_packages([{**PACKAGES[0],'weight':value}])
    def test_multiple_physical_packages(self):
        self.assertEqual(len(physical_packages(PACKAGES*2)),2)
    def test_html_is_not_pdf(self):
        with self.assertRaises(BlueExpressAPIError): pdf_content(base64.b64encode(b'<html>error</html>').decode())
    def test_tracking_identity_checked(self):
        with self.assertRaises(BlueExpressAPIError): parse_tracking(TRACKING,'99999')
    @patch('apps.shipping.infrastructure.blue_express.operations.requests.request')
    def test_headers_and_no_redirects(self,request):
        response=MagicMock(status_code=200); response.iter_content.return_value=[b'{"status":true,"data":{}}']
        request.return_value.__enter__.return_value=response
        BlueOperationsClient().request('tracking',tracking='12345')
        self.assertEqual(request.call_args.args,('GET',CONFIG['TRACKING_URL']+'/12345'))
        self.assertFalse(request.call_args.kwargs['allow_redirects'])
        self.assertEqual(request.call_args.kwargs['headers']['BX-CLIENT-ACCOUNT'],'test-account')
    @patch('apps.shipping.infrastructure.blue_express.operations.requests.request')
    def test_production_url_rejected_in_qa(self,request):
        with override_settings(BLUE_EXPRESS={**CONFIG,'EMISSION_URL':'https://bx-tracking.bluex.cl/bx-emission/v1'}):
            with self.assertRaises(BlueExpressConfigurationError): BlueOperationsClient().request('emission',payload={})
        request.assert_not_called()

class BlueActivationTests(SimpleTestCase):
    @override_settings(BLUE_EXPRESS_CHECKOUT_TOTAL_CONFIRMED=False)
    def test_activation_requires_commercial_validation(self):
        from apps.core.presentation.serializers import BlueExpressConfigurationSerializer
        self.assertFalse(BlueExpressConfigurationSerializer(data={'enabled':True}).is_valid())
    @override_settings(BLUE_EXPRESS_CHECKOUT_TOTAL_CONFIRMED=True, BLUE_EXPRESS={**CONFIG,
        'GEO_URL':'https://qa-bx-tracking.bluex.cl/bx-geo/state/all',
        'PRICING_URL':'https://qa-bx-tracking.bluex.cl/bx-pricing/v1'})
    def test_activation_after_explicit_configuration(self):
        from apps.core.presentation.serializers import BlueExpressConfigurationSerializer
        serializer=BlueExpressConfigurationSerializer(data={'enabled':True})
        self.assertTrue(serializer.is_valid(),serializer.errors)
    @override_settings(BLUE_EXPRESS_CHECKOUT_TOTAL_CONFIRMED=False,BLUE_EXPRESS={})
    def test_deactivation_always_available(self):
        from apps.core.presentation.serializers import BlueExpressConfigurationSerializer
        self.assertTrue(BlueExpressConfigurationSerializer(data={'enabled':False}).is_valid())
