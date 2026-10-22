"""Test current models in memory. Never connects to the installation's databases.

Production migrations include PostgreSQL reconciliation, so this disposable
SQLite schema is built from models without executing those migrations.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
from django.conf import settings
settings.DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}}
settings.MIGRATION_MODULES = {name.rsplit('.', 1)[-1]: None for name in settings.INSTALLED_APPS}
settings.PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
import django
django.setup()
from django.core.management import call_command
call_command('test', *(sys.argv[1:] or ['apps.landing.test_bloques', 'apps.landing.test_contenido', 'apps.landing.test_guardar_configuracion']), verbosity=1, interactive=False)
