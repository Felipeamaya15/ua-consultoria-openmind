from datetime import date, datetime, timedelta, timezone as dt_timezone
from decimal import Decimal
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase, SimpleTestCase
from django.utils import timezone
from rest_framework.test import APIClient
from apps.core.models import Promocion, Tienda, ConfiguracionLegal
from apps.core.promotion_dates import promotion_instant
from apps.core.promotions import calculate_promotion, PromotionError


class PromotionContractTests(TestCase):
    def setUp(self):
        self.a=get_user_model().objects.create_user(username='bloqueos-a')
        self.b=get_user_model().objects.create_user(username='bloqueos-b')
        self.store=Tienda.objects.create(nombre='A',id_usuario_propietario=self.a)
        self.api=APIClient();self.api.force_authenticate(self.a)
        self.payload={'name':'Real','code':'CODIGO','type':'percentage','value':'12.50','startsAt':'2026-09-05T22:45:12.123456-04:00','endsAt':'2026-09-07T03:20:43.654321-03:00'}

    def create(self,**changes):
        response=self.api.post('/api/promociones/',self.payload|changes,format='json')
        self.assertEqual(response.status_code,201,response.data)
        return response.data['data']

    def test_full_instants_survive_name_and_status_patch(self):
        data=self.create();p=Promocion.objects.get(pk=data['id'])
        start,end=p.fecha_inicio,p.fecha_fin
        self.assertEqual(start,datetime.fromisoformat(self.payload['startsAt']))
        self.assertEqual(end.microsecond,654321)
        self.assertEqual(data['startsAt'],'2026-09-06T02:45:12.123456Z')
        for values in [{'name':'Otro nombre'},{'active':False}]:
            response=self.api.patch(f"/api/promociones/{p.pk}/",values,format='json')
            self.assertEqual(response.status_code,200,response.data)
            p.refresh_from_db();self.assertEqual((p.fecha_inicio,p.fecha_fin),(start,end))

    def test_legacy_dates_include_santiago_dst_day(self):
        data=self.create(startsAt='2026-09-06',endsAt='2026-09-06')
        p=Promocion.objects.get(pk=data['id'])
        self.assertEqual(p.fecha_inicio,promotion_instant(date(2026,9,6)))
        self.assertEqual(p.fecha_fin,promotion_instant(date(2026,9,6),end=True))
        self.assertEqual(p.fecha_fin-p.fecha_inicio+timedelta(microseconds=1),timedelta(hours=23))
        self.assertEqual(calculate_promotion(self.store,'CODIGO',Decimal(10000),Decimal(3000),today=p.fecha_fin).discount,1250)
        with self.assertRaises(PromotionError):calculate_promotion(self.store,'CODIGO',Decimal(10000),Decimal(3000),today=p.fecha_fin+timedelta(microseconds=1))

    def test_nulls_and_legacy_aliases_and_three_discounts(self):
        for i,(kind,discount,shipping) in enumerate([('descuento_porcentual',1250,3000),('descuento_monto_fijo',12.5,3000),('envio_gratuito',0,0)]):
            row=self.create(code='COD-'+str(i),type=kind,startsAt=None,endsAt=None)
            amounts=calculate_promotion(self.store,row['code'],Decimal(10000),Decimal(3000))
            self.assertEqual(amounts.discount,Decimal(str(discount)));self.assertEqual(amounts.shipping,shipping)

    def test_offer_is_preserved_and_never_zero_coupon(self):
        row=self.create(type='precio_oferta',code='',startsAt=None,endsAt=None)
        self.assertEqual(row['type'],'precio_oferta');self.assertEqual(Promocion.objects.count(),1)
        other=self.create(type='precio_oferta',code='OFERTA',startsAt=None)
        result=self.api.post('/api/promociones/validar/',{'code':'OFERTA','subtotal':10000},format='json')
        self.assertEqual(result.status_code,400);self.assertNotIn('data',result.data)

    def test_duplicates_scoped_and_forbidden_other_store(self):
        row=self.create()
        self.assertEqual(self.api.post('/api/promociones/',self.payload,format='json').status_code,409)
        self.api.force_authenticate(self.b)
        self.assertEqual(self.api.patch(f"/api/promociones/{row['id']}/",{'active':False},format='json').status_code,403)
        other=Tienda.objects.create(nombre='B',id_usuario_propietario=self.b)
        copy=Promocion.objects.create(tienda=other,nombre='Otro',codigo='CODIGO',tipo='fixed',valor=10)
        self.assertNotEqual(row['id'],copy.pk)
        # La arquitectura resuelve una tienda por instalación: dos tiendas físicas no eligen un tenant automáticamente.
        self.assertEqual(self.api.get('/api/promociones/').status_code,503)

    def test_negative_contract_400_and_no_naive_or_bad_ranges(self):
        for changes in [{'code':''},{'value':101},{'value':0},{'minAmount':-1},{'type':'otro'},{'startsAt':'2026-09-05T22:45:12'},{'endsAt':'2025-01-01'},{'startsAt':'2026-02-30'}]:
            self.assertEqual(self.api.post('/api/promociones/',self.payload|changes,format='json').status_code,400,changes)
        self.assertEqual(Promocion.objects.count(),0)

    def test_expired_inactive_used_limits_and_future(self):
        now=timezone.now()
        for i,changes in enumerate([{'fecha_fin':now-timedelta(seconds=1)},{'fecha_inicio':now+timedelta(seconds=1)},{'activa':False},{'maximo_usos':1,'usos':1},{'monto_minimo':20000}]):
            p=Promocion.objects.create(tienda=self.store,nombre='Prueba',codigo='C-'+str(i),tipo='fixed',valor=100,**changes)
            with self.assertRaises(PromotionError):calculate_promotion(self.store,p.codigo,Decimal(10000),Decimal(3000))

    def test_server_failure_preserves_existing_data(self):
        row=self.create();self.api.raise_request_exception=False
        with patch.object(Promocion,'save',side_effect=RuntimeError('Fallo artificial')):
            response=self.api.patch(f"/api/promociones/{row['id']}/",{'name':'No guardar'},format='json')
        self.assertEqual(response.status_code,500)
        self.assertEqual(Promocion.objects.get(pk=row['id']).nombre,'Real')


class LegalHistoryTests(TestCase):
    def setUp(self):
        self.user=get_user_model().objects.create_user(username='legal-bloqueo')
        self.store=Tienda.objects.create(nombre='Legal',id_usuario_propietario=self.user)
        self.api=APIClient();self.api.force_authenticate(self.user)

    def test_history_survives_draft_and_restore_without_changing_published(self):
        for text in ['Primera real','Segunda real']:
            response=self.api.post('/api/legal/configuracion/publicar/',{'tipo':'terms','content':text},format='json')
            self.assertEqual(response.status_code,200,response.data)
        before=response.data['data']['terms']
        self.assertEqual(len(before['historial']),2)
        for payload in [{'tipo':'terms','draft':'Edición sin publicar','accion':'draft'},{'tipo':'terms','accion':'restore'}]:
            response=self.api.put('/api/legal/configuracion/',payload,format='json');self.assertEqual(response.status_code,200,response.data)
            current=response.data['data']['terms']
            for key in ['version','historial','published','lastPublished']:self.assertEqual(before[key],current[key])
        response=self.api.put('/api/legal/configuracion/',{'tipo':'terms','draft':before['historial'][0]['content'],'accion':'draft'},format='json')
        self.assertEqual(response.data['data']['terms']['draft'],'Primera real')
        self.assertEqual(response.data['data']['terms']['published'],'Segunda real')

    def test_failed_publish_and_other_owner_cannot_replace_content(self):
        self.api.post('/api/legal/configuracion/publicar/',{'tipo':'terms','content':'Vigente'},format='json')
        before=ConfiguracionLegal.objects.get(tienda=self.store).datos
        self.assertEqual(self.api.post('/api/legal/configuracion/publicar/',{'tipo':'terms','content':' '},format='json').status_code,400)
        self.assertEqual(ConfiguracionLegal.objects.get(tienda=self.store).datos,before)
        other=get_user_model().objects.create_user(username='legal-otra')
        Tienda.objects.create(nombre='Otra',id_usuario_propietario=other)
        self.api.force_authenticate(other)
        self.assertEqual(self.api.post('/api/legal/configuracion/publicar/',{'tipo':'terms','content':'Ajena'},format='json').status_code,503)
        self.assertEqual(ConfiguracionLegal.objects.get(tienda=self.store).datos,before)


class PromotionPartialValidationTests(SimpleTestCase):
    def test_patch_preserves_unused_historic_amounts_and_instants_without_database(self):
        from apps.core.presentation.promotions import PromocionSerializer
        for kind in ['free_shipping', 'envio_gratuito']:
            start = datetime.fromisoformat('2026-09-05T22:45:12.123456-04:00')
            p = Promocion(nombre='Histórica', codigo='ENVIO', tipo=kind, valor=Decimal('999.25'), fecha_inicio=start)
            for changes in [{'name':'Nombre nuevo'},{'active':False}]:
                serializer = PromocionSerializer(p, data=changes, partial=True)
                self.assertTrue(serializer.is_valid(), serializer.errors)
                self.assertNotIn('valor', serializer.validated_data)
                self.assertNotIn('fecha_inicio', serializer.validated_data)
                self.assertNotIn('fecha_fin', serializer.validated_data)
                self.assertEqual(p.fecha_inicio, start)
            serializer = PromocionSerializer(p, data={'value':999}, partial=True)
            self.assertTrue(serializer.is_valid(), serializer.errors)
            self.assertEqual(serializer.validated_data['valor'], 0)
