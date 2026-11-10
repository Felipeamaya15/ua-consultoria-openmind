import uuid
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from apps.core.models import Tienda
from apps.core.infrastructure.email_service import ResultadoEnvio
from apps.landing.models import SolicitudActividad, RespuestaActividad, IntentoRespuestaActividad


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class ActivityReplyTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='reply-owner')
        self.store = Tienda.objects.create(nombre='Tienda QA', correo_negocio='negocio@example.test', id_usuario_propietario=self.owner)
        self.record = self.make_request()
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.url = f'/api/landing/solicitudes-actividades/{self.record.pk}/respuestas/'
        self.payload = {'clave': str(uuid.uuid4()), 'asunto': 'Respuesta de la tienda', 'cuerpo': 'Texto <script>alert(1)</script> de prueba'}

    def make_request(self, **extra):
        values = dict(tienda=self.store, seccion_id=uuid.uuid4(), titulo_actividad='Taller QA', tipo_actividad='taller', tipo='consulta', nombre='Persona QA', email='persona@example.test', mensaje='Consulta de prueba', estado='nueva', solicitud_id=uuid.uuid4(), huella=uuid.uuid4().hex, consentimiento_version='qa', consentimiento_fecha=timezone.now())
        return SolicitudActividad.objects.create(**{**values, **extra})

    def draft(self):
        result = self.client.post(self.url, self.payload, format='json')
        self.assertEqual(result.status_code, 201, result.data)
        return result.data['data']

    def send(self, row):
        return self.client.post(self.url + row['id'] + '/enviar/', {}, format='json')

    def test_draft_detail_and_idempotence(self):
        row = self.draft()
        retry = self.client.post(self.url, self.payload, format='json')
        self.assertEqual(retry.data['data']['id'], row['id'])
        self.assertEqual(RespuestaActividad.objects.count(), 1)
        self.assertEqual(self.client.get(self.url).data['data']['respuestas'][0]['destinatario'], self.record.email)
        conflict = self.client.post(self.url, {**self.payload, 'cuerpo':'Otro texto'}, format='json')
        self.assertEqual(conflict.status_code, 409)

    def test_accepted_once_escaped_and_reply_to(self):
        row = self.draft()
        result = self.send(row)
        self.assertEqual(result.data['data']['estado'], 'aceptada')
        self.send(row)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['persona@example.test'])
        self.assertEqual(mail.outbox[0].reply_to, ['negocio@example.test'])
        self.assertIn('&lt;script&gt;', mail.outbox[0].alternatives[0][0])
        self.record.refresh_from_db()
        self.assertEqual(self.record.estado, 'respondida')
        self.assertEqual(IntentoRespuestaActividad.objects.count(), 1)

    def test_definitive_failure_preserves_state_and_retry_succeeds(self):
        row = self.draft()
        with patch('apps.landing.activity_replies.enviar_correo', return_value=ResultadoEnvio(False,'error_de_envio','SMTPRecipientsRefused')):
            self.assertEqual(self.send(row).data['data']['estado'], 'fallida')
        self.record.refresh_from_db()
        self.assertEqual(self.record.estado, 'nueva')
        self.assertEqual(self.send(row).data['data']['estado'], 'aceptada')
        self.assertEqual(IntentoRespuestaActividad.objects.count(), 2)

    def test_ambiguous_failure_never_blindly_retries(self):
        row = self.draft()
        with patch('apps.landing.activity_replies.enviar_correo', return_value=ResultadoEnvio(False,'error_de_envio','TimeoutError')) as sender:
            self.assertEqual(self.send(row).data['data']['estado'], 'indeterminada')
            self.send(row)
            self.assertEqual(sender.call_count, 1)
            self.assertEqual(self.client.post(self.url,{**self.payload,'clave':str(uuid.uuid4())},format='json').status_code,409)
        self.record.refresh_from_db()
        self.assertEqual(self.record.estado, 'nueva')

    @override_settings(EMAIL_BACKEND='django.core.mail.backends.smtp.EmailBackend', ACTIVITY_REPLIES_MAILPIT_ENABLED=False)
    def test_real_transport_is_disabled(self):
        row = self.draft()
        with patch('apps.landing.activity_replies.enviar_correo') as sender:
            self.assertFalse(self.client.get(self.url).data['data']['envio_habilitado'])
            self.assertEqual(self.send(row).status_code, 409)
            sender.assert_not_called()

    def test_permissions_and_foreign_request(self):
        row = self.draft()
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(self.url).status_code, (401,403))
        self.assertIn(self.client.post(self.url,self.payload,format='json').status_code,(401,403))
        self.assertIn(self.send(row).status_code,(401,403))
        other = get_user_model().objects.create_user(username='reply-other')
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(self.client.post(self.url,self.payload,format='json').status_code,403)
        self.assertEqual(self.send(row).status_code,403)
        self.client.force_authenticate(self.owner)
        foreign_store = Tienda.objects.create(nombre='Otra tienda', id_usuario_propietario=other)
        foreign = self.make_request(tienda=foreign_store)
        foreign_url = f'/api/landing/solicitudes-actividades/{foreign.pk}/respuestas/'
        with patch('apps.landing.activity_replies.resolver_tienda', return_value=self.store):
            self.assertEqual(self.client.get(foreign_url).status_code, 404)
            self.assertEqual(self.client.post(foreign_url,self.payload,format='json').status_code,404)

    def test_header_and_recipient_injection_rejected(self):
        self.assertEqual(self.client.post(self.url,{**self.payload,'asunto':'Asunto\nBcc:evil@example.test'},format='json').status_code,400)
        self.assertEqual(self.client.post(self.url,{**self.payload,'destinatario':'evil@example.test'},format='json').status_code,400)
        self.assertEqual(RespuestaActividad.objects.count(),0)

    def test_archiving_keeps_history_and_closing_is_independent(self):
        row = self.draft()
        self.record.archivada=True
        self.record.save()
        self.send(row)
        self.record.refresh_from_db()
        self.assertTrue(self.record.archivada)
        self.assertEqual(self.client.get(self.url).data['data']['total'],1)
        self.record.estado='cerrada';self.record.save()
        self.payload['clave']=str(uuid.uuid4())
        self.assertEqual(self.client.post(self.url,self.payload,format='json').status_code,400)

    def test_enrollments_have_no_reply_endpoint(self):
        self.record.tipo='inscripcion';self.record.estado='pendiente';self.record.save()
        self.assertEqual(self.client.get(self.url).status_code,404)

    def test_manual_respondida_requires_accepted_reply(self):
        self.assertEqual(self.client.patch(f'/api/landing/solicitudes-actividades/{self.record.pk}/',{'estado':'respondida'},format='json').status_code,400)

    def test_attempt_limit_and_pagination(self):
        row=self.draft()
        with patch('apps.landing.activity_replies.enviar_correo',return_value=ResultadoEnvio(False,'error_de_envio','SMTPRecipientsRefused')):
            for _ in range(3):self.send(row)
            self.assertEqual(self.send(row).status_code,429)
        self.assertEqual(self.client.get(self.url+'?pagina=0').status_code,400)


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class CampaignDraftTests(TestCase):
    def setUp(self):
        from apps.core.models import ConsentimientoComercial
        self.owner=get_user_model().objects.create_user(username='campaign-owner')
        self.store=Tienda.objects.create(nombre='Campaña QA',id_usuario_propietario=self.owner)
        self.client=APIClient();self.client.force_authenticate(self.owner)
        self.url='/api/tienda/campanas/'
        def consent(email, **extra):
            return ConsentimientoComercial.objects.create(tienda=self.store,email=email,estado='autorizado',verificado=True,
                fecha_autorizacion=timezone.now(),fecha_verificacion=timezone.now(),version_texto='correo-promocional-v1',referencia_evidencia='qa-evidence',**extra)
        self.allowed=consent('autorizado@example.test')
        self.pending=ConsentimientoComercial.objects.create(tienda=self.store,email='pendiente@example.test',estado='pendiente')
        self.unverified=consent('noverificado@example.test');self.unverified.verificado=False;self.unverified.save()
        self.payload={'clave':str(uuid.uuid4()),'nombre':'Campaña QA','asunto':'Novedades','cuerpo':'Texto <b>seguro</b>','destinatarios':[self.allowed.pk,self.allowed.pk],'producto_id':''}

    def create(self):
        result=self.client.post(self.url,self.payload,format='json');self.assertEqual(result.status_code,201,result.data);return result.data['data']

    def test_audience_only_verified_evidence_and_filter(self):
        data=self.client.get(self.url+'destinatarios/').data['data']
        self.assertEqual([r['id'] for r in data['resultados']],[self.allowed.pk])
        self.assertEqual(self.client.get(self.url+'destinatarios/?q=missing').data['data']['total'],0)

    def test_draft_idempotent_persistent_and_no_delivery(self):
        row=self.create();again=self.client.post(self.url,self.payload,format='json')
        self.assertEqual(row['id'],again.data['data']['id']);self.assertEqual(len(row['destinatarios']),1)
        self.assertFalse(row['envio_habilitado']);self.assertEqual(row['destinatarios'][0]['intentos'],0)
        self.assertEqual(self.client.get(self.url).data['data']['total'],1)
        self.assertEqual(self.client.post(self.url+row['id']+'/enviar/',{},format='json').status_code,404)
        self.assertFalse(getattr(mail,'outbox',[]))

    def test_revoked_after_selection_excluded_on_preview(self):
        row=self.create();self.allowed.estado='retirado';self.allowed.save()
        detail=self.client.get(self.url+row['id']+'/').data['data']
        self.assertEqual(detail['elegibles'],0);self.assertEqual(detail['excluidos'],1)
        self.assertEqual(self.client.get(self.url+'destinatarios/').data['data']['total'],0)

    def test_revision_conflicts_preserve_saved_text(self):
        row=self.create();body={**self.payload,'revision':row['revision'],'cuerpo':'Actualizado'}
        updated=self.client.put(self.url+row['id']+'/',body,format='json')
        self.assertEqual(updated.status_code,200)
        self.assertEqual(self.client.put(self.url+row['id']+'/',body,format='json').status_code,409)
        self.assertEqual(self.client.get(self.url+row['id']+'/').data['data']['cuerpo'],'Actualizado')
        self.assertEqual(self.client.post(self.url,{**self.payload,'cuerpo':'Otro'},format='json').status_code,409)

    def test_foreign_contact_and_campaign_are_not_accessible(self):
        from apps.core.models import ConsentimientoComercial
        other=get_user_model().objects.create_user(username='campaign-other')
        self.client.force_authenticate(other);self.assertEqual(self.client.get(self.url).status_code,403)
        self.client.force_authenticate(self.owner)
        foreign=Tienda.objects.create(nombre='Otra',id_usuario_propietario=other)
        evidence=ConsentimientoComercial.objects.create(tienda=foreign,email='ajeno@example.test',estado='pendiente')
        from apps.landing.models import CampanaPromocional
        foreign_campaign=CampanaPromocional.objects.create(tienda=foreign,autor=other,clave=uuid.uuid4(),nombre='Ajena',asunto='Privado',cuerpo='Privado')
        with patch('apps.landing.campaigns.resolver_tienda',return_value=self.store):
            self.assertEqual(self.client.get(self.url+str(foreign_campaign.pk)+'/').status_code,404)
            self.assertEqual(self.client.put(self.url+str(foreign_campaign.pk)+'/',self.payload,format='json').status_code,404)
            self.assertEqual(self.client.post(self.url,{**self.payload,'destinatarios':[evidence.pk]},format='json').status_code,400)

    def test_subject_injection_and_methods(self):
        self.assertEqual(self.client.post(self.url,{**self.payload,'asunto':'Hello\nBcc:person@example.test'},format='json').status_code,400)
        self.assertEqual(self.client.put(self.url,self.payload,format='json').status_code,405)
        self.assertEqual(self.client.post(self.url,{**self.payload,'enviar':True},format='json').status_code,400)

    def test_product_snapshot_checks_owner_and_active_status(self):
        with patch('apps.catalog.infrastructure.repositories.ProductRepository') as repository:
            repository.return_value.get_admin_product.return_value={'tienda_id':str(self.store.pk),'activo':True,'nombre':'Producto QA','imagenes':['javascript:alert(1)'],'variantes':[{'precio':12000,'precio_oferta':10000}]}
            self.payload['producto_id']='a'*24
            row=self.create();self.assertEqual(row['producto']['precio'],'10000');self.assertEqual(row['producto']['imagen'],'')
            repository.return_value.get_admin_product.assert_called_once_with(str(self.store.pk),'a'*24)
            repository.return_value.get_admin_product.return_value['tienda_id']='otro'
            self.payload['clave']=str(uuid.uuid4())
            self.assertEqual(self.client.post(self.url,self.payload,format='json').status_code,400)


class CommunicationMigrationTests(TransactionTestCase):
    def test_migrations_reverse_and_forward_preserve_existing_request(self):
        from django.db import connection
        from django.db.migrations.executor import MigrationExecutor
        owner=get_user_model().objects.create_user(username='migration-qa')
        store=Tienda.objects.create(nombre='Tienda histórica QA',id_usuario_propietario=owner)
        record=SolicitudActividad.objects.create(tienda=store,seccion_id=uuid.uuid4(),titulo_actividad='Histórico',tipo_actividad='servicio',tipo='consulta',nombre='Persona QA',email='persona@example.test',mensaje='Mensaje conservado',estado='nueva',solicitud_id=uuid.uuid4(),huella=uuid.uuid4().hex,consentimiento_version='qa',consentimiento_fecha=timezone.now())
        plan=MigrationExecutor(connection).loader.graph.forwards_plan(('landing','0009_borradores_campanas'))
        self.assertNotIn(('core','0034_cifrar_credenciales_configuracion_pago'),plan)
        MigrationExecutor(connection).migrate([('landing','0007_imagenes_carrusel_portada')])
        MigrationExecutor(connection).migrate([('landing','0009_borradores_campanas')])
        record.refresh_from_db();self.assertEqual(record.mensaje,'Mensaje conservado')
        self.assertEqual(RespuestaActividad.objects.count(),0)


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class ReplyConcurrencyTests(TransactionTestCase):
    def test_double_click_sends_once_while_first_attempt_is_running(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        from django.db import close_old_connections, connection
        if connection.vendor != 'postgresql':
            self.skipTest('La concurrencia requiere bloqueo de filas de PostgreSQL.')
        owner=get_user_model().objects.create_user(username='concurrent-owner')
        store=Tienda.objects.create(nombre='Tienda QA',id_usuario_propietario=owner)
        record=SolicitudActividad.objects.create(tienda=store,seccion_id=uuid.uuid4(),titulo_actividad='Taller',tipo_actividad='taller',tipo='consulta',nombre='Persona QA',email='persona@example.test',estado='nueva',solicitud_id=uuid.uuid4(),huella=uuid.uuid4().hex,consentimiento_version='qa',consentimiento_fecha=timezone.now())
        reply=RespuestaActividad.objects.create(solicitud=record,autor=owner,clave=uuid.uuid4(),destinatario=record.email,asunto='Respuesta QA',cuerpo='Contenido QA')
        barrier=Barrier(2)
        def send(_):
            close_old_connections()
            try:
                client=APIClient();client.force_authenticate(owner);barrier.wait(timeout=10)
                return client.post(f'/api/landing/solicitudes-actividades/{record.pk}/respuestas/{reply.pk}/enviar/',{},format='json').status_code
            finally:close_old_connections()
        with patch('apps.landing.activity_replies.enviar_correo',return_value=ResultadoEnvio(True,'enviado_local')) as sender:
            with ThreadPoolExecutor(max_workers=2) as pool:
                results=list(pool.map(send,[0,1]))
            self.assertEqual(results,[200,200]);self.assertEqual(sender.call_count,1)
        self.assertEqual(IntentoRespuestaActividad.objects.count(),1)


class LegalRestoreSafetyTests(TestCase):
    def test_all_four_bases_restore_only_draft_and_preserve_published_history(self):
        from apps.core.models import ConfiguracionLegal
        from apps.core.legal import get_default_legal_pages, LEGAL_META
        owner=get_user_model().objects.create_user(username='legal-qa')
        store=Tienda.objects.create(nombre='Legal QA',id_usuario_propietario=owner)
        pages=get_default_legal_pages()
        history=[{'version':3,'fecha_vigencia':'2026-01-01T00:00:00Z','content':'Publicación previa QA'}]
        for page in pages.values():
            page.update(draft='Borrador anterior',published='Publicación previa QA',version=3,lastPublished='2026-01-01T00:00:00Z',fecha_vigencia='2026-01-01T00:00:00Z',historial=history)
        ConfiguracionLegal.objects.create(tienda=store,datos=pages)
        client=APIClient();client.force_authenticate(owner)
        for kind in ('terms','privacy','refund','cookies'):
            with self.subTest(kind=kind):
                response=client.put('/api/legal/configuracion/',{'tipo':kind,'accion':'restore'},format='json')
                self.assertEqual(response.status_code,200,response.data)
                page=response.data['data'][kind]
                self.assertEqual(page['draft'],LEGAL_META[kind]['content'])
                self.assertEqual(page['published'],'Publicación previa QA')
                self.assertEqual(page['version'],3)
                self.assertEqual(page['historial'],history)
                self.assertEqual(page['lastPublished'],'2026-01-01T00:00:00Z')
