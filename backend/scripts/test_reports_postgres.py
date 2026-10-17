"""Prueba PostgreSQL con base test_* única; no escribe en la base comercial.

Usa DB_* de entorno o los valores locales predeterminados de settings.
Requiere permiso de CREATE DATABASE. Mongo no se consulta en estos casos.
"""
import os
import sys
from pathlib import Path
from uuid import uuid4
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
load_dotenv(Path(__file__).resolve().parents[2] / '.env')
for target, source in [('DB_NAME', 'POSTGRES_DB'), ('DB_USER', 'POSTGRES_USER'), ('DB_PASSWORD', 'POSTGRES_PASSWORD'), ('DB_PORT', 'POSTGRES_PORT')]:
    if source in os.environ:
        os.environ.setdefault(target, os.environ[source])
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
os.environ.setdefault('DB_HOST', 'localhost')
import django
from django.conf import settings
settings.DATABASES['default']['TEST'] = {'NAME': 'test_openmind_reports_' + uuid4().hex}
settings.DATABASES['default']['OPTIONS'] = {'connect_timeout': 5}
django.setup()
from django.core.management import call_command
call_command('test', *(sys.argv[1:] or [
    'apps.core.test_reports', 'apps.core.test_store_configuration',
    'apps.core.test_dashboard', 'apps.core.test_ultimas_ordenes', 'apps.core.test_estados_pedido',
]), verbosity=1, interactive=False)
