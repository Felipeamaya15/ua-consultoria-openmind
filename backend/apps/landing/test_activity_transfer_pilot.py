from unittest.mock import patch
from datetime import timedelta
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from apps.core.models import Pedido
from apps.core.infrastructure.expiracion_pedidos import vence_en, _candidatos
from apps.landing.models import ReservaActividadPagada
from apps.landing.paid_availability import availability
from apps.landing.transfer_activity_orders import TRANSFER_MARKER, change_transfer, records
from apps.landing import test_unified_activity_orders as helpers

@override_settings(DEBUG=True)
class TransferPilotTests(TestCase):
    setUp=helpers.UnifiedOrderDBTests.setUp
    payload=helpers.UnifiedOrderDBTests.payload
    post=helpers.UnifiedOrderDBTests.post
    def configure(self):
        self.store.correo_negocio='owner@example.org';self.store.save(update_fields=['correo_negocio'])
    def transfer(self, data=None):
        data=data or self.payload();data['contacto']['email']='customer@example.edu'
        with patch.dict('os.environ',{'PAID_ACTIVITY_TRANSFER_ENABLED':'1'}):
            return self.post(data,False)
    def test_transfer_disabled_default(self):
        self.configure();data=self.payload();data['contacto']['email']='customer@example.edu'
        with patch.dict('os.environ',{'PAID_ACTIVITY_TRANSFER_ENABLED':'0'}):
            self.assertEqual(self.post(data,False).status_code,403)
    def test_no_mixed_or_other_methods_in_pilot(self):
        self.configure();data=self.payload();data['medio_pago']='Transbank'
        self.assertEqual(self.transfer(data).status_code,400)
        data=self.payload();data['items']=[{'producto_id':'a'*24,'sku':'QA-SKU','cantidad':1}];data['metodo_entrega']='Retiro'
        self.assertEqual(self.transfer(data).status_code,400)
        self.assertFalse(Pedido.objects.exists())
    def test_transfer_payment_and_refund_once(self):
        self.configure();response=self.transfer();self.assertEqual(response.status_code,201,response.data)
        order=Pedido.objects.get(tienda=self.store);row=ReservaActividadPagada.objects.get(clave_checkout=order.clave_checkout)
        self.assertEqual(order.entrega['origen'],TRANSFER_MARKER)
        self.assertEqual(availability(self.store,self.section)['cupos_disponibles'],1)
        ReservaActividadPagada.objects.filter(pk=row.pk).update(vence=timezone.now()-timedelta(minutes=1))
        self.assertIsNone(vence_en(order));self.assertNotIn(order.pk,list(_candidatos()))
        owner=self.store.id_usuario_propietario
        change_transfer(self.store,order.pk,row.pk,owner,'registrar_pago','Abono revisado','PAGO1',True)
        change_transfer(self.store,order.pk,row.pk,owner,'registrar_pago','Reintento','PAGO1',True)
        row.refresh_from_db();self.assertEqual(row.estado,'confirmada')
        buyer=get_user_model().objects.create_user(username='transfer-pilot-buyer',password='qa-only')
        order.refresh_from_db();order.comprador=buyer;order.save(update_fields=['comprador'])
        change_transfer(self.store,order.pk,row.pk,buyer,'solicitar','No puedo asistir')
        with self.assertRaises(ValidationError):change_transfer(self.store,order.pk,row.pk,owner,'registrar_devolucion','Aún sin autorizar','REF1',True)
        change_transfer(self.store,order.pk,row.pk,owner,'autorizar_devolucion','Aprobada','',True)
        self.assertEqual(availability(self.store,self.section)['cupos_disponibles'],1)
        change_transfer(self.store,order.pk,row.pk,owner,'registrar_devolucion','Transferencia comprobada','REF1',True)
        change_transfer(self.store,order.pk,row.pk,owner,'registrar_devolucion','Reintento','REF1',True)
        order.refresh_from_db();self.assertEqual(len(records(order)),1)
        self.assertEqual(records(order)[str(row.pk)]['monto'],30000)
        self.assertEqual(availability(self.store,self.section)['cupos_disponibles'],3)
