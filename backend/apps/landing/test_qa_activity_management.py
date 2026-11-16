from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from apps.core.models import Pedido
from apps.landing.models import ReservaActividadPagada
from apps.landing.paid_availability import availability
from apps.landing.unified_activity_orders import resolve_unified_qa
from apps.landing.qa_activity_management import change_record, ledger
from apps.landing import test_unified_activity_orders as helpers

@override_settings(DEBUG=True)
class ManagementQATests(TestCase):
    setUp=helpers.UnifiedOrderDBTests.setUp
    payload=helpers.UnifiedOrderDBTests.payload
    post=helpers.UnifiedOrderDBTests.post
    def confirmed(self):
        result=self.post(self.payload());self.assertEqual(result.status_code,201,result.data)
        order=Pedido.objects.get(tienda=self.store)
        buyer=get_user_model().objects.create_user(username='refund-buyer',password='qa-only')
        with transaction.atomic():
            order=Pedido.objects.select_for_update().get(pk=order.pk)
            resolve_unified_qa(order,approve=True);order.estado='pagado';order.comprador=buyer;order.save(update_fields=['estado','comprador'])
        return order,ReservaActividadPagada.objects.get(clave_checkout=order.clave_checkout),buyer
    def test_request_refund_idempotent_and_release(self):
        order,row,buyer=self.confirmed();owner=self.store.id_usuario_propietario
        self.assertEqual(change_record(self.store,order.pk,row.pk,buyer,'solicitar','No puedo asistir')['devolucion']['estado'],'solicitada')
        change_record(self.store,order.pk,row.pk,buyer,'solicitar','No puedo asistir')
        self.assertEqual(availability(self.store,self.section)['cupos_disponibles'],1)
        result=change_record(self.store,order.pk,row.pk,owner,'simular_devolucion','Aprobada',True)
        self.assertEqual(result['devolucion']['monto'],30000)
        self.assertEqual(availability(self.store,self.section)['cupos_disponibles'],3)
        change_record(self.store,order.pk,row.pk,owner,'simular_devolucion','Otra vez',True)
        order.refresh_from_db();self.assertEqual(len(ledger(order)),1);self.assertEqual(order.estado,'pagado')
        self.assertEqual(availability(self.store,self.section)['cupos_disponibles'],3)
    def test_another_buyer_and_unauthorized_action(self):
        order,row,buyer=self.confirmed();other=get_user_model().objects.create_user(username='refund-other',password='qa-only')
        with self.assertRaises(NotFound):change_record(self.store,order.pk,row.pk,other,'solicitar','No')
        with self.assertRaises(PermissionDenied):change_record(self.store,order.pk,row.pk,buyer,'simular_devolucion','No')
        self.assertEqual(availability(self.store,self.section)['cupos_disponibles'],1)
    def test_reject_does_not_release(self):
        order,row,buyer=self.confirmed();owner=self.store.id_usuario_propietario
        change_record(self.store,order.pk,row.pk,buyer,'solicitar','No puedo asistir')
        change_record(self.store,order.pk,row.pk,owner,'rechazar','Revisar caso',True)
        self.assertEqual(availability(self.store,self.section)['cupos_disponibles'],1)
        with self.assertRaises(ValidationError):change_record(self.store,order.pk,row.pk,buyer,'solicitar','Otra vez')
    def test_pending_not_refundable(self):
        result=self.post(self.payload());self.assertEqual(result.status_code,201,result.data)
        order=Pedido.objects.get(tienda=self.store);row=ReservaActividadPagada.objects.get(clave_checkout=order.clave_checkout)
        with self.assertRaises(ValidationError):change_record(self.store,order.pk,row.pk,self.store.id_usuario_propietario,'simular_devolucion','No',True)
