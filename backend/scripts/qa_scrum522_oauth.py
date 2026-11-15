"""Proveedor OAuth simulado para E2E. Nunca es una ruta o bypass del servidor."""
import os
from unittest.mock import patch
from django.conf import settings
from rest_framework.test import APIClient
from apps.core.models import Tienda

if (not settings.DATABASES['default']['NAME'].startswith('scrum522_qa_')
        or not settings.MONGO_DB_NAME.startswith('scrum522_qa_')
        or settings.STORE_MAIL_EXTERNAL_ENABLED):
    raise RuntimeError('La transición simulada solo admite bases QA y envíos externos bloqueados.')
store = Tienda.objects.get()
if store.id_usuario_propietario.username != 'scrum522-browser-qa':
    raise RuntimeError('Solo se permite el propietario sintético.')
with patch('apps.core.presentation.gmail_oauth_views.intercambiar_codigo', return_value={
        'correo':store.correo_negocio, 'refresh_token':'synthetic-browser-refresh-not-a-real-google-token'}):
    response = APIClient().get('/api/tienda/correo/google/callback/',
        {'state':os.environ['SCRUM522_QA_OAUTH_STATE'], 'code':'synthetic-provider-code'})
    if response.status_code != 302 or not response.url.endswith('?ok=1'):
        raise RuntimeError('La transición OAuth sintética fue rechazada.')
print('Callback de producción, cifrado y autorización persistidos con proveedor simulado en QA.')
