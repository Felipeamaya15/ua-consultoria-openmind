"""Fixture manual exclusiva de la BD de pruebas SCRUM-522; ejecutar desde manage.py shell."""
import os
import uuid
import json
from pathlib import Path
from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.authtoken.models import Token
from apps.core.models import Tienda, ConsentimientoComercial
from apps.landing.models import SolicitudActividad

if not settings.DATABASES['default']['NAME'].startswith('scrum522_qa_'):
    raise RuntimeError('Esta fixture solo admite una base manual aislada scrum522_qa_*, separada de las pruebas automáticas.')
password = os.environ.get('SCRUM522_QA_PASSWORD')
if not password:
    raise RuntimeError('Define SCRUM522_QA_PASSWORD con una contraseña temporal de pruebas.')
if Tienda.objects.exclude(id_usuario_propietario__username='scrum522-browser-qa').exists():
    raise RuntimeError('La base de QA tiene otra tienda: no se modificará.')
owner, _ = get_user_model().objects.get_or_create(username='scrum522-browser-qa',
    defaults={'email': 'owner-browser@example.test', 'is_staff': True})
owner.set_password(password); owner.save()
store, _ = Tienda.objects.get_or_create(id_usuario_propietario=owner,
    defaults={'nombre': 'Emprendimiento QA SCRUM-522', 'correo_negocio': 'owner-browser@example.test'})
ConsentimientoComercial.objects.get_or_create(tienda=store, email='cliente-sintetico@example.test', defaults={
    'estado': 'autorizado', 'verificado': True, 'fecha_autorizacion': timezone.now(),
    'fecha_verificacion': timezone.now(), 'version_texto': 'fixture-qa', 'referencia_evidencia': 'fixture-qa-aislada'})
if not SolicitudActividad.objects.filter(tienda=store).exists():
    SolicitudActividad.objects.create(tienda=store, seccion_id=uuid.uuid4(), titulo_actividad='Taller de prueba',
        tipo_actividad='taller', tipo='consulta', nombre='Cliente sintético', email='cliente-sintetico@example.test',
        mensaje='¿Qué materiales necesito para el taller?', estado='nueva', solicitud_id=uuid.uuid4(),
        huella=uuid.uuid4().hex, consentimiento_version='qa-operacional', consentimiento_fecha=timezone.now())
token, _ = Token.objects.get_or_create(user=owner)
Path(settings.BASE_DIR / '.env.scrum522.postman.json').write_text(json.dumps({
    'name': 'SCRUM522 isolated QA', 'values': [
        {'key': 'qaBaseUrl', 'value': 'http://localhost:8001', 'enabled': True},
        {'key': 'ownerToken', 'value': token.key, 'enabled': True}]}), encoding='utf-8')
print('Fixture QA y entorno privado Postman preparados. No se han enviado correos.')
