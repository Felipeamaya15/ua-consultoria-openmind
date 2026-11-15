"""Prueba las migraciones SOLO en una copia restaurada y verifica todas las filas previas."""
import json
from collections import Counter
from pathlib import Path
from django.conf import settings
from django.db import connection
from django.core.management import call_command

if not settings.DATABASES['default']['NAME'].startswith('scrum522_restore_cont_'):
    raise RuntimeError('Este verificador solo admite la copia restaurada scrum522_restore_cont_*.')
tables = {}
quote = connection.ops.quote_name
with connection.cursor() as cursor:
    for table in connection.introspection.table_names(cursor):
        if table == 'django_migrations':
            continue
        cursor.execute('SELECT * FROM ' + quote(table))
        columns = [column[0] for column in cursor.description]
        previous = Counter(json.dumps(row, default=str, sort_keys=True) for row in cursor.fetchall())
        tables[table] = (columns, previous)
call_command('migrate', interactive=False)
report = []
with connection.cursor() as cursor:
    for table, (columns, previous) in tables.items():
        cursor.execute('SELECT ' + ','.join(quote(column) for column in columns) + ' FROM ' + quote(table))
        current = Counter(json.dumps(row, default=str, sort_keys=True) for row in cursor.fetchall())
        if previous - current:
            raise RuntimeError('La comprobación detectó diferencias en filas previas de ' + table)
        report.append({'tabla': table, 'filas_previas': sum(previous.values()),
            'filas_posteriores': sum(current.values()), 'filas_previas_conservadas': True})
target = Path('/app/.env.scrum522.migration-verification.json')
target.write_text(json.dumps({'base': settings.DATABASES['default']['NAME'], 'tablas': report,
    'datos_previos_conservados': True}, indent=2), encoding='utf-8')
print(f'Migraciones verificadas: {len(report)} tablas; todas las filas previas se conservan.')
