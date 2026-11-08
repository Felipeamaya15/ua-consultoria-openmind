"""API real de Django con SQLite en memoria para la prueba UI SCRUM-510.

No modifica settings, migraciones ni bases de la aplicación. Ejecutar desde la raíz:
.venv/Scripts/python.exe frontend/tests/payment-configuration-api.py
"""
import json
import os
import secrets
import sys
from pathlib import Path
from wsgiref.simple_server import make_server, WSGIRequestHandler

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
os.environ['SECRET_KEY'] = secrets.token_urlsafe(48)
os.environ['DEBUG'] = '1'
from django.conf import settings

settings.DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}}
settings.ALLOWED_HOSTS = ['localhost', '127.0.0.1', 'testserver']
settings.CORS_ALLOW_ALL_ORIGINS = True
import django

django.setup()
from django.apps import apps
from django.contrib.auth import get_user_model
from django.core.wsgi import get_wsgi_application
from django.db import connection
from rest_framework.authtoken.models import Token
from apps.core.models import Tienda, ConfiguracionPago, ConfiguracionTransbank

with connection.schema_editor() as schema:
    for model in apps.get_models():
        if model._meta.managed and not model._meta.proxy:
            schema.create_model(model)

owner = get_user_model().objects.create_user(username='scrum510-owner', email='qa@example.test')
store = Tienda.objects.create(nombre='Tienda de prueba SCRUM-510', id_usuario_propietario=owner)
token = Token.objects.create(user=owner).key
ConfiguracionTransbank.objects.create(id_tienda=store, activo=True, codigo_comercio='597055555532',
                                     api_key='clave-ficticia-scrum510', ambiente='INTEGRACION')
application = get_wsgi_application()


def app(environ, start):
    if environ['PATH_INFO'] == '/__qa_fixture/':
        start('200 OK', [('Content-Type', 'application/json')])
        return [json.dumps({'storeId': store.pk, 'token': token}).encode()]
    if environ['PATH_INFO'] == '/__qa_transfer/' and environ['REQUEST_METHOD'] == 'POST':
        # Solo existe en este servidor efímero, permite cargar una configuración histórica.
        body = json.loads(environ['wsgi.input'].read(int(environ.get('CONTENT_LENGTH') or 0)))
        ConfiguracionPago.objects.update_or_create(tienda=store, defaults={'datos': body})
        start('200 OK', [('Content-Type', 'application/json')])
        return [b'{}']
    # La identidad visual usa Mongo en producción; esta prueba de pagos solo necesita su ID SQL.
    if environ['PATH_INFO'] == '/api/visual-config/plantilla-seleccionada/':
        start('200 OK', [('Content-Type', 'application/json'), ('Access-Control-Allow-Origin', '*')])
        return [json.dumps({'exito': True, 'data': {'tienda_id': store.pk, 'plantilla_id': 1}}).encode()]
    return application(environ, start)


class Quiet(WSGIRequestHandler):
    def log_message(self, *args):
        pass


port = int(os.environ.get('PAYMENTS_QA_PORT', '8006'))
print(f'SCRUM510_QA_READY http://127.0.0.1:{port}', flush=True)
with make_server('127.0.0.1', port, app, handler_class=Quiet) as server:
    server.serve_forever()
