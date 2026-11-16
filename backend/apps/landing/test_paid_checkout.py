from unittest.mock import patch
from datetime import datetime, timedelta, timezone as utc
from uuid import uuid4
from django.test import SimpleTestCase, TestCase, override_settings
from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework.exceptions import ValidationError
from apps.landing.paid_checkout import PaidCartSerializer, quote_cart, local_test_enabled, create_test_order, resolve_test_order
from apps.landing.paid_availability import availability
from apps.landing.models import ConfiguracionLanding, ReservaActividadPagada
from apps.core.models import Pedido, Tienda
from types import SimpleNamespace

class PaidCheckoutTests(SimpleTestCase):
    def line(self, **overrides):
        return {'seccion_id':str(uuid4()), 'cantidad':2, 'version':'a'*64, **overrides}

    def test_strict_payload(self):
        for qty in (True,0,1.5,'2',10001):
            self.assertFalse(PaidCartSerializer(data={'actividades':[self.line(cantidad=qty)]}).is_valid())
        a=self.line()
        self.assertFalse(PaidCartSerializer(data={'actividades':[a,a]}).is_valid())
        self.assertFalse(PaidCartSerializer(data={'actividades':[self.line(precio=1)]}).is_valid())

    @patch('apps.landing.paid_checkout.availability')
    def test_total_server_side(self, availability):
        availability.return_value={'version':'a'*64,'estado':'disponible','cupos_disponibles':3,
            'titulo':'Taller','precio':15000,'inicio':'2030-12-01T12:00:00+00:00','zona_horaria':'America/Santiago'}
        result=quote_cart(object(),[self.line()])
        self.assertEqual(result['total'],30000)
        self.assertEqual(result['costo_envio'],0)
        for line in (self.line(cantidad=4),self.line(version='b'*64)):
            with self.assertRaises(ValidationError):quote_cart(object(),[line])
        availability.return_value['estado']='cerrada'
        with self.assertRaises(ValidationError):quote_cart(object(),[self.line()])

    @override_settings(DEBUG=False)
    def test_disabled_in_production(self):
        self.assertFalse(local_test_enabled(SimpleNamespace(get_host=lambda:'localhost:8000')))

    @override_settings(DEBUG=True)
    @patch.dict('os.environ', {'PAID_ACTIVITY_TEST_CHECKOUT':'1'})
    def test_only_loopback(self):
        self.assertTrue(local_test_enabled(SimpleNamespace(get_host=lambda:'127.0.0.1:8000')))
        self.assertFalse(local_test_enabled(SimpleNamespace(get_host=lambda:'tienda.example.com')))

@override_settings(DEBUG=True)
class PaidCheckoutDatabaseTests(TestCase):
    def setUp(self):
        user=get_user_model().objects.create_user(username='owner-activity-test',password='only-test')
        self.store=Tienda.objects.create(id_usuario_propietario=user,nombre='Prueba de actividades')
        self.section=str(uuid4())
        self.other=str(uuid4())
        def block(id):
            return {'id':id,'tipo':'personalizada','visible':True,'titulo':'Taller de prueba',
                'actividad':{'tipo':'taller','estado':'activa','zona_horaria':'America/Santiago','cupos':3,
                    'gratuito':False,'inscripciones':False,'venta':{'cierre_minutos':60,'tolerancia_minutos':15,
                        'cancelacion':'evaluacion','cancelacion_horas':48}},
                'componentes':[{'tipo':'precio','visible':True,'importe':'15000'},
                    {'tipo':'fecha','visible':True,'fecha':'2037-12-12'},
                    {'tipo':'horario','visible':True,'inicio':'15:00','termino':'17:00'}]}
        ConfiguracionLanding.objects.create(tienda=self.store,titulo='Prueba',texto_boton='Ver',contenido={'bloques':[block(self.section),block(self.other)]})

    def payload(self, qty=2):
        q=availability(self.store,self.section)
        return {'clave_checkout':uuid4(),'acepta_prueba':True,'contacto':{'nombre':'Comprador ficticio','email':'prueba@example.com'},
                'actividades':[{'seccion_id':self.section,'cantidad':qty,'version':q['version']}]}

    def test_order_reservation_and_idempotency(self):
        data=self.payload()
        order,created=create_test_order(self.store,None,data)
        self.assertTrue(created)
        self.assertEqual(order.monto_total,30000)
        self.assertEqual(order.costo_envio,0)
        self.assertEqual(order.itempedido_set.count(),1)
        self.assertEqual(availability(self.store,self.section)['cupos_disponibles'],1)
        again,created=create_test_order(self.store,None,data)
        self.assertFalse(created)
        self.assertEqual(order.pk,again.pk)
        self.assertEqual(ReservaActividadPagada.objects.count(),1)
        with self.assertRaises(ValidationError):create_test_order(self.store,None,self.payload())
        with transaction.atomic():
            locked=Pedido.objects.select_for_update().get(pk=order.pk)
            self.assertTrue(resolve_test_order(locked,approve=False))
            locked.estado='cancelado';locked.save(update_fields=['estado'])
        self.assertEqual(availability(self.store,self.section)['cupos_disponibles'],3)

    def test_atomic_rollback_if_second_line_invalid(self):
        data=self.payload()
        data['actividades'].append({'seccion_id':self.other,'cantidad':2,'version':'f'*64})
        with self.assertRaises(ValidationError):create_test_order(self.store,None,data)
        self.assertEqual(ReservaActividadPagada.objects.count(),0)
        self.assertFalse(Pedido.objects.filter(tienda=self.store).exists())

    def test_approval_preserves_occupied_seats(self):
        order,_=create_test_order(self.store,None,self.payload())
        with transaction.atomic():
            locked=Pedido.objects.select_for_update().get(pk=order.pk)
            self.assertTrue(resolve_test_order(locked,approve=True))
            locked.estado='pagado';locked.save(update_fields=['estado'])
        self.assertEqual(ReservaActividadPagada.objects.get().estado,'confirmada')
        self.assertEqual(availability(self.store,self.section)['cupos_disponibles'],1)
