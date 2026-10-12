"""Auditoría local: SQLite en memoria y Mongo temporal; nunca ejecuta migraciones.

Desde backend: venv/Scripts/python.exe scripts/test_develop_integration.py
No conecta PostgreSQL ni modifica colecciones de la tienda. Los tests Mongo usan
bases/colecciones test_*; se necesita Mongo local en localhost:27017.
"""
import os
import sys
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
os.environ.setdefault('MONGO_HOST', 'localhost')
os.environ['MONGO_DB_NAME'] = 'test_develop_integration_' + uuid4().hex

from django.conf import settings
settings.DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}}
import django
django.setup()
from django.apps import apps
from django.db import connection
from django.test.runner import DiscoverRunner
from apps.core.infrastructure.mongo_client import get_mongo_client

runner = DiscoverRunner(verbosity=1, interactive=False)
runner.setup_test_environment()
mongo_available = False
try:
    get_mongo_client().admin.command('ping')
    mongo_available = True
    # Esquema efímero creado directamente, sin manage.py migrate ni historial SQL.
    with connection.schema_editor() as schema:
        for model in apps.get_models():
            if model._meta.managed and not model._meta.proxy:
                schema.create_model(model)
    suite = runner.build_suite(sys.argv[1:] or [
        'apps.catalog.test_creation', 'apps.catalog.test_editing',
        'apps.catalog.test_inventory', 'apps.catalog.test_tenant', 'apps.catalog.test_stock',
        'apps.catalog.test_cart', 'apps.core.test_checkout', 'apps.core.test_customer_orders',
        'apps.core.test_tenant', 'apps.core.test_tenant_sql', 'apps.core.test_stock',
        'apps.core.test_order_tracking', 'apps.core.test_shipping', 'apps.core.test_shipping_errores',
        'apps.core.test_pending_transfers', 'apps.core.test_transfer_configuration',
        'apps.catalog.test_product_flow_regressions', 'apps.visual_config.test_store_identity',
        'apps.core.test_variante_atributos', 'apps.core.test_delivery', 'apps.core.test_estados_pedido',
        'apps.shipping.tests', 'apps.shipping.test_cotizacion_errores',
    ])
    # Este caso llama explícitamente código de una migración histórica. No ejecutar
    # ni siquiera esa función de datos durante esta auditoría sin migraciones.
    import unittest
    def without_migration_cases(tests):
        result = unittest.TestSuite()
        for test in tests:
            if isinstance(test, unittest.TestSuite):
                result.addTests(without_migration_cases(test))
            elif not test.id().endswith('test_guest_migration_recovers_existing_checkout_snapshots'):
                result.addTest(test)
        return result
    result = runner.run_suite(without_migration_cases(suite))
    exit_code = runner.suite_result(suite, result)
finally:
    # Solo la base temporal elegida por este proceso, jamás la base de negocio.
    if mongo_available:
        get_mongo_client().drop_database(settings.MONGO_DB_NAME)
    runner.teardown_test_environment()
raise SystemExit(exit_code)
