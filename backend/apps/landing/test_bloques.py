import base64
import copy
import io
import json
import tempfile
import uuid
from pathlib import Path

from PIL import Image
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from apps.core.models import Tienda
from apps.landing.models import ConfiguracionLanding


class BloquesLandingTests(TestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(username='blocks-owner')
        self.store = Tienda.objects.create(nombre='Tienda de bloques', id_usuario_propietario=self.owner)
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.url = '/api/landing/configuracion/'
        self.appearance = '/api/landing/apariencia/'
        self.block = {'id':str(uuid.uuid4()),'tipo':'historia','visible':True,'titulo':'Hecho en Chile','subtitulo':'Desde 2020','texto':'Nuestro origen.\n\nNuestro futuro.','imagenes':[]}
        self.payload = {'titulo':'Mi tienda','descripcion':'Portada existente','texto_boton':'Ver catálogo','secciones':{'Beneficios':True},'contenido':{'bloques':[self.block], 'contacto':{'correo':'hola@example.test'}}}
        self.media = tempfile.TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        self.settings_override = override_settings(MEDIA_ROOT=self.media.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)

    def put(self, payload=None):
        return self.client.put(self.url, self.payload if payload is None else payload, format='json')

    def styles(self, template='editorial', fields=None):
        return self.client.patch(self.appearance, {'plantilla':template,'bloques':{self.block['id']:{'base':fields or {'titleSize':48,'layout':'right','background':'#f2f1ef'},'mobile':{'titleSize':28}}}}, format='json')

    def test_content_persists_and_public_get_shares_it(self):
        response = self.put()
        self.assertEqual(response.status_code,201,response.data)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.url).data['data']['contenido']['bloques'],[self.block])

    def test_all_block_types_and_unicode(self):
        self.payload['contenido']['bloques'] = [{**self.block,'id':str(uuid.uuid4()),'tipo':kind,'texto':'Autónoma · Diseño <script>alert(1)</script>'} for kind in ['historia','imagen_texto','texto','galeria','cita']]
        self.assertEqual(self.put().status_code,201)
        self.assertEqual(len(ConfiguracionLanding.objects.get().contenido['bloques']),5)

    def test_reorder_hide_remove_and_explicit_empty(self):
        second={**self.block,'id':str(uuid.uuid4()),'visible':False}
        self.payload['contenido']['bloques']=[second,self.block]
        self.put()
        stored=ConfiguracionLanding.objects.get().contenido['bloques']
        self.assertEqual(stored[0]['id'],second['id'])
        self.assertFalse(stored[0]['visible'])
        self.payload['contenido']['bloques']=[]
        self.assertEqual(self.put().data['data']['contenido']['bloques'],[])

    def test_legacy_clients_preserve_new_blocks_and_appearance(self):
        self.put(); self.styles()
        self.payload['contenido']={'contacto':{'correo':'nuevo@example.test'}}
        data=self.put().data['data']['contenido']
        self.assertEqual(data['bloques'],[self.block])
        self.assertIn('editorial',data['apariencia_bloques'])

    def test_appearance_is_template_scoped_and_does_not_replace_content(self):
        self.put()
        for template in ['editorial','minimal','visual','catalog']:
            self.assertEqual(self.styles(template).status_code,200)
        content=ConfiguracionLanding.objects.get().contenido
        self.assertEqual(content['bloques'],[self.block])
        self.assertEqual(set(content['apariencia_bloques']),{'editorial','minimal','visual','catalog'})
        self.assertEqual(content['apariencia_bloques']['catalog'][self.block['id']]['mobile']['titleSize'],28)

    def test_content_client_cannot_write_appearance(self):
        self.put(); self.styles()
        self.payload['contenido']['apariencia_bloques']={'editorial':{}}
        self.assertTrue(self.put().data['data']['contenido']['apariencia_bloques']['editorial'])

    def test_owner_authorization_and_store_identity(self):
        self.put()
        other=get_user_model().objects.create_user(username='other-owner')
        self.client.force_authenticate(other)
        self.assertEqual(self.put().status_code,403)
        self.assertEqual(self.styles().status_code,403)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.patch(self.appearance,{'tienda_id':999,'plantilla':'editorial','bloques':{}},format='json').status_code,400)
        self.assertNotIn('apariencia_bloques',ConfiguracionLanding.objects.get().contenido)

    def test_ambiguous_installation_fails_closed(self):
        Tienda.objects.create(nombre='Segunda tienda',id_usuario_propietario=self.owner)
        self.assertEqual(self.put().status_code,503)
        self.assertEqual(self.styles().status_code,503)

    def test_unauthenticated_write_denied(self):
        self.put();self.client.force_authenticate(None)
        self.assertIn(self.styles().status_code,[401,403])

    def test_invalid_blocks_rejected_without_writes(self):
        for patch in [{'tipo':'hero'},{'id':'unsafe-selector'},{'titulo':'x'*256},{'texto':'x'*10001}]:
            self.payload['contenido']['bloques']=[{**self.block,**patch}]
            self.assertEqual(self.put().status_code,400,patch)
        self.assertFalse(ConfiguracionLanding.objects.exists())

    def test_duplicates_and_limits(self):
        self.payload['contenido']['bloques']=[self.block,self.block]
        self.assertEqual(self.put().status_code,400)
        self.payload['contenido']['bloques']=[{**self.block,'id':str(uuid.uuid4())} for _ in range(21)]
        self.assertEqual(self.put().status_code,400)

    def test_unsafe_css_and_out_of_range_rejected(self):
        self.put()
        for fields in [{'titleColor':'url(javascript:alert(1))'},{'titleSize':10000},{'layout':'fixed'},{'position':'absolute'},{'background':'#ffff'},{'titleSize':True}]:
            self.assertEqual(self.styles(fields=fields).status_code,400,fields)

    def test_appearance_requires_existing_content(self):
        self.assertEqual(self.styles().status_code,400)

    def test_valid_image_saved_as_file_and_removal_keeps_original(self):
        output=io.BytesIO();Image.new('RGB',(20,12),'#879a7b').save(output,format='PNG')
        src='data:image/png;base64,'+base64.b64encode(output.getvalue()).decode()
        self.block['imagenes']=[{'id':str(uuid.uuid4()),'src':src,'alt':'Taller artesanal'}]
        response=self.put()
        self.assertEqual(response.status_code,201,response.data)
        image=response.data['data']['contenido']['bloques'][0]['imagenes'][0]
        self.assertTrue(image['src'].startswith(f'/media/landing/blocks/{self.store.pk}/'))
        files=list(Path(self.media.name).rglob('*.png'))
        self.assertEqual(len(files),1)
        self.assertEqual(files[0].read_bytes(),output.getvalue())
        self.payload['contenido']['bloques']=[];self.put()
        self.assertTrue(files[0].exists())

    def test_invalid_image_mime_payload_and_urls_rejected(self):
        for src in ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,YmFk', 'javascript:alert(1)', '//evil.test/a.png','/etc/passwd','/media/landing/blocks/../secret']:
            self.block['imagenes']=[{'id':str(uuid.uuid4()),'src':src,'alt':''}]
            self.assertEqual(self.put().status_code,400,src)
        self.assertEqual(list(Path(self.media.name).rglob('*')),[])

    def test_gallery_limit_and_image_identity(self):
        self.block['tipo']='galeria'
        image={'id':str(uuid.uuid4()),'src':'https://example.test/photo.png','alt':''}
        self.block['imagenes']=[image,image]
        self.assertEqual(self.put().status_code,400)
        self.block['imagenes']=[{**image,'id':str(uuid.uuid4())} for _ in range(9)]
        self.assertEqual(self.put().status_code,400)

    def test_multipart_content_uses_same_validation(self):
        payload=copy.deepcopy(self.payload)
        payload['contenido']=json.dumps(payload['contenido'])
        payload['secciones']=json.dumps(payload['secciones'])
        response=self.client.put(self.url,payload,format='multipart')
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(response.data['data']['contenido']['bloques'][0]['titulo'],'Hecho en Chile')
