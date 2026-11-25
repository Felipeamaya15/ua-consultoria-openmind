"""Migración y conservación de filas exclusivamente en una base sintética QA."""
import json
from collections import Counter
from pathlib import Path
from django.conf import settings
from django.db import connection
from django.core.management import call_command
from django.db.migrations.executor import MigrationExecutor

if not settings.DATABASES['default']['NAME'].startswith('scrum522_qa_'):
    raise RuntimeError('Solo se permite una base aislada scrum522_qa_*.')
executor = MigrationExecutor(connection)
plan = executor.migration_plan(executor.loader.graph.leaf_nodes())
if any(backwards or migration.app_label != 'core' or migration.name != '0036_autorizacion_correo_y_verificacion'
       for migration, backwards in plan):
    raise RuntimeError('El plan tiene operaciones distintas a la migración autorizada en QA.')
snapshot = {}
with connection.cursor() as cursor:
    for table in connection.introspection.table_names():
        if table == 'django_migrations':
            continue
        columns = [column.name for column in connection.introspection.get_table_description(cursor, table)]
        cursor.execute('SELECT ' + ','.join(connection.ops.quote_name(c) for c in columns)
            + ' FROM ' + connection.ops.quote_name(table))
        snapshot[table] = (columns, Counter(json.dumps(row, default=str, sort_keys=True) for row in cursor.fetchall()))
call_command('migrate', interactive=False)
with connection.cursor() as cursor:
    for table, (columns, previous) in snapshot.items():
        cursor.execute('SELECT ' + ','.join(connection.ops.quote_name(c) for c in columns)
            + ' FROM ' + connection.ops.quote_name(table))
        current = Counter(json.dumps(row, default=str, sort_keys=True) for row in cursor.fetchall())
        if previous - current:
            raise RuntimeError('No se conservaron filas originales: ' + table)
result = {'database': settings.DATABASES['default']['NAME'], 'tables_preserved': len(snapshot),
    'migration': 'core.0036_autorizacion_correo_y_verificacion', 'usual_database_modified': False}
output = Path(settings.BASE_DIR) / '.pytest_cache' / 'scrum522-final-migration.json'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result))
