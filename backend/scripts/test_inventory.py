"""Pruebas SQL aisladas y Mongo real en bases temporales; no usa la tienda local.

Ejecutar desde backend: python scripts/test_inventory.py
Requiere acceso al Mongo configurado y permisos para crear/borrar bases de prueba.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

from django.conf import settings

# No usa la historia de migraciones SQL de la instalación, ni escribe en PostgreSQL.
settings.DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}}
settings.MIGRATION_MODULES = {
    label: None for label in (
        'admin', 'auth', 'contenttypes', 'sessions', 'authtoken', 'core',
        'authentication', 'catalog', 'visual_config', 'landing',
    )
}

import django
django.setup()
from django.test.runner import DiscoverRunner

raise SystemExit(DiscoverRunner(verbosity=1, interactive=False).run_tests([
    'apps.catalog.test_inventory',
    'apps.catalog.test_creation',
    'apps.catalog.test_editing',
    'apps.catalog.test_tenant.MongoTenantTests',
    'apps.catalog.test_stock.MongoStockTests',
]))
