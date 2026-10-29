from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import Tienda, ConfiguracionCorreo, Pedido
from apps.core.domain.plantillas_correo import construir_correo, VARIABLES_PERMITIDAS


class AutomaticFieldsTests(TestCase):
    def setUp(self):
        self.owner=get_user_model().objects.create_user(username='fields-owner')
        self.store=Tienda.objects.create(nombre='Tienda ejemplo',id_usuario_propietario=self.owner)
        self.api=APIClient();self.api.force_authenticate(self.owner)

    def save(self, body, subject='Gracias', enabled=True):
        return self.api.put('/api/tienda/correos/',{'plantillas':{'order_received':{'subject':subject,'preheader':'','body':body,'enabled':enabled}}},format='json')

    def test_catalog_is_the_actual_order_context_and_explains_every_key(self):
        data=self.api.get('/api/tienda/correos/').data['data']
        self.assertEqual([field['key'] for field in data['variables']],list(VARIABLES_PERMITIDAS))
        for field in data['variables']:
            self.assertTrue(field['description']);self.assertTrue(field['label']);self.assertTrue(field['example'])
        self.assertEqual(set(data['obligatorias']),set(data['plantillas']))
        self.assertTrue(all(fields==['orderNumber'] for fields in data['obligatorias'].values()))

    def test_required_number_may_be_in_any_field_and_optional_fields_can_be_deleted(self):
        self.assertEqual(self.save('Texto sin variables').status_code,400)
        self.assertEqual(self.save('Texto libre','Compra {{orderNumber}}').status_code,200)
        self.assertEqual(self.save('Texto {{orderNumber}}').status_code,200)
        self.assertEqual(self.save('Borrador desactivado',enabled=False).status_code,200)

    def test_unknown_and_corrupted_markers_rejected_but_normal_braces_allowed(self):
        for invalid in ['{{cliente_nombreX}}','{{orderNumber}','{orderNumber}}','{{orderNumberX}}']:
            self.assertEqual(self.save('Pedido {{orderNumber}} '+invalid).status_code,400,invalid)
        text='Texto [normal] {libre} {{ texto entre llaves }}. Pedido {{orderNumber}}'
        self.assertEqual(self.save(text).status_code,200)

    def test_saved_syntax_reload_and_real_render_without_external_email(self):
        text='¡Gracias {{customerName}}! Tu compra {{orderNumber}}: {{orderTotal}}. [Texto normal]'
        self.assertEqual(self.save(text).status_code,200)
        fresh=APIClient();fresh.force_authenticate(self.owner)
        self.assertEqual(fresh.get('/api/tienda/correos/').data['data']['plantillas']['order_received']['body'],text)
        order=Pedido.objects.create(tienda=self.store,monto_total=25990,estado='pendiente',nombre_contacto='María',correo_contacto='cliente@example.test')
        rendered=construir_correo('order_received',order)
        self.assertIn('¡Gracias María!',rendered.cuerpo);self.assertIn(order.identificador,rendered.cuerpo)
        self.assertNotIn('{{',rendered.cuerpo)

    def test_legacy_saved_templates_are_not_rewritten_or_blocked_on_read_or_render(self):
        legacy={'enabled':True,'subject':'Mensaje anterior','preheader':'','body':'Hola {{customerName}}'}
        ConfiguracionCorreo.objects.create(tienda=self.store,plantillas={'order_received':legacy})
        self.assertEqual(self.api.get('/api/tienda/correos/').data['data']['plantillas']['order_received'],legacy)
        order=Pedido.objects.create(tienda=self.store,monto_total=100,estado='pendiente',nombre_contacto='Ana',correo_contacto='cliente@example.test')
        self.assertEqual(construir_correo('order_received',order).cuerpo,'Hola Ana')
