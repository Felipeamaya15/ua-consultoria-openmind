"""Ejecuta pruebas aisladas con SQLite en memoria, sin tocar la BD local."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
from django.conf import settings
settings.DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}}
import django
django.setup()
from django.core.management import call_command
call_command('test', *(sys.argv[1:] or [
    'apps.core.test_dashboard', 'apps.core.test_ultimas_ordenes', 'apps.core.test_estados_pedido',
]), verbosity=1, interactive=False)
