"""Servidor E2E aislado. Solo crea y elimina DBs test_sprint6_*; nunca usa la BD comercial.

Con --from-docker lee configuración de conexión sin imprimir credenciales. El servidor
se cierra por POST /__qa_shutdown y elimina únicamente sus propias bases temporales.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
from uuid import uuid4
from datetime import timedelta
from wsgiref.simple_server import make_server, WSGIRequestHandler, WSGIServer
from socketserver import ThreadingMixIn

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
parser = argparse.ArgumentParser()
parser.add_argument('--from-docker', action='store_true')
parser.add_argument('--port', type=int, default=8005)
parser.add_argument('--in-container', action='store_true')
parser.add_argument('--commercial', action='store_true', help='Añadir datos ficticios para históricos y contactos')
args = parser.parse_args()
if args.from_docker:
    # Se reutilizan imagen, red y fuentes; las conexiones permanecen dentro de Docker.
    # Variables sensibles pasan por entorno, sin incluir valores en comandos o archivos.
    spec = json.loads(subprocess.check_output(['docker', 'inspect', 'django_backend']))[0]
    environment = dict(item.split('=', 1) for item in spec['Config']['Env'])
    network = next(iter(spec['NetworkSettings']['Networks']))
    command = ['docker', 'run', '--rm', '--name', 'openmind_qa_' + uuid4().hex[:8],
               '--network', network, '--volumes-from', 'django_backend', '--workdir', '/app',
               '-p', f'127.0.0.1:{args.port}:{args.port}']
    for key in ('DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_PORT', 'MONGO_USER', 'MONGO_PASSWORD'):
        command += ['-e', key]
    command += [spec['Config']['Image'], 'python', 'scripts/serve_sprint6_qa.py', '--in-container', '--port', str(args.port)]
    if args.commercial:
        command.append('--commercial')
    raise SystemExit(subprocess.call(command, env={**os.environ, **environment}))
os.environ.update(DJANGO_SETTINGS_MODULE='config.settings', DB_HOST='db' if args.in_container else '127.0.0.1', MONGO_HOST='mongodb' if args.in_container else '127.0.0.1',
                  MONGO_DB_NAME='test_sprint6_' + uuid4().hex, PICKUP_GEOCODING_PROVIDER='', PICKUP_GOOGLE_GEOCODING_KEY='')
import django
django.setup()
from django.conf import settings
from django.db import connection, connections
from django.contrib.auth import get_user_model
from django.core.wsgi import get_wsgi_application
from django.utils import timezone
from rest_framework.authtoken.models import Token
from apps.catalog.infrastructure.repositories import ProductRepository
from apps.core.infrastructure.mongo_client import get_mongo_client
from apps.core.models import Tienda, ConfiguracionEntrega, ConfiguracionPago, Promocion, Pedido
from apps.core.pickup import DAYS, prepare_pickup_for_save
from apps.core.payments import TRANSFER_PUBLIC_FIELDS

name = 'test_sprint6_' + uuid4().hex
connection.settings_dict['TEST']['NAME'] = name
settings.ALLOWED_HOSTS = ['127.0.0.1', 'localhost']
settings.CORS_ALLOW_ALL_ORIGINS = True
settings.DEBUG = False
original = connection.settings_dict['NAME']
created = False
mongo_created = False
server = None
try:
    connection.creation.create_test_db(verbosity=0, autoclobber=False, serialize=False)
    created = True
    owner = get_user_model().objects.create_user(username='qa-fixture-owner')
    owner_token = Token.objects.create(user=owner).key
    store = Tienda.objects.create(nombre='OpenMind QA temporal', id_usuario_propietario=owner)
    hours = {day: {'enabled': day not in ('sat', 'sun'), 'start': '09:15', 'end': '18:10'} for day, _ in DAYS}
    pickup = prepare_pickup_for_save({'enabled': True, 'version': 2, 'hours': hours, 'location': {
        'region': 'Metropolitana de Santiago', 'comuna': 'Providencia', 'street': 'Calle QA', 'number': '123', 'reference': 'Local de prueba', 'verification': ''}}, store.pk)
    rate = {'region': 'Metropolitana de Santiago', 'comuna': 'Providencia', 'monto': 4500, 'plazo_dias': 2}
    ConfiguracionEntrega.objects.create(tienda=store, datos={'pickup': pickup, 'chilexpress': {'enabled': True, 'tarifas': [rate]}, 'starken': {'enabled': False}})
    ConfiguracionPago.objects.create(tienda=store, datos={'transfer': {'enabled': True, 'fields': {
        field: 'qa@example.test' if 'email' in field else 'Dato ficticio QA' for field in TRANSFER_PUBLIC_FIELDS}}})
    for code, kind, amount, minimum in [('QA20', 'percentage', 20, 0), ('QA300', 'fixed', 300, 0), ('QAFREE', 'free_shipping', 0, 15000)]:
        Promocion.objects.create(tienda=store, nombre=code, codigo=code, tipo=kind, valor=amount, monto_minimo=minimum)
    Promocion.objects.create(tienda=store, nombre='Expirada', codigo='QAEXPIRED', tipo='fixed', valor=10,
        fecha_inicio=timezone.now() - timedelta(days=3), fecha_fin=timezone.now() - timedelta(days=1))
    repo = ProductRepository()
    product = repo.create(str(store.pk), {'nombre': 'Producto QA', 'activo': True, 'categoria': 'Pruebas', 'variantes': [
        {'sku': 'QA-E2E', 'precio': 10000, 'stock': 200, 'atributos_variante': []}]})
    mongo_created = True
    # Una venta confirmada para verificar montos, decimales y PDF de históricos.
    Pedido.objects.create(tienda=store, nombre_contacto='Cliente QA', correo_contacto='qa@example.test', monto_total='12500.50', estado='pagado')
    date = timezone.localdate() + timedelta(days=7)
    date += timedelta(days=(0 - date.weekday()) % 7)
    fixture = {'api': f'http://127.0.0.1:{args.port}', 'storeId': str(store.pk), 'productId': str(product),
               'ownerToken': owner_token, 'pickupDate': date.isoformat(), 'closedDate': (date + timedelta(days=6)).isoformat()}
    if args.commercial:
        from commercial_fixture import seed_commercial
        fixture['commercial'] = seed_commercial(store)
    application = get_wsgi_application()
    class Quiet(WSGIRequestHandler):
        def log_message(self, *args): pass
    class Threaded(ThreadingMixIn, WSGIServer):
        daemon_threads = True
    def app(environ, start):
        if environ['PATH_INFO'] == '/__qa_fixture':
            start('200 OK', [('Content-Type', 'application/json')]); return [json.dumps(fixture).encode()]
        if environ['PATH_INFO'] == '/__qa_shutdown' and environ['REQUEST_METHOD'] == 'POST':
            threading.Thread(target=server.shutdown, daemon=True).start()
            start('200 OK', [('Content-Type', 'application/json')]); return [b'{}']
        return application(environ, start)
    server = make_server('0.0.0.0' if args.in_container else '127.0.0.1', args.port, app, server_class=Threaded, handler_class=Quiet)
    print('QA_READY', flush=True)
    server.serve_forever()
finally:
    if server: server.server_close()
    connections.close_all()
    if mongo_created and settings.MONGO_DB_NAME.startswith('test_sprint6_'):
        get_mongo_client().drop_database(settings.MONGO_DB_NAME)
    if created and name.startswith('test_sprint6_'):
        connection.creation.destroy_test_db(original, verbosity=0)
    print('QA_CLEANED', flush=True)
