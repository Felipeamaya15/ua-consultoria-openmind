"""Reconcilia 0021 conocidas sin cambiar sus fuentes ni los IDs existentes.

DATE significa día inclusivo America/Santiago. TIMESTAMPTZ conserva el instante.
No existe reversión automática que trunque instantes nuevos a fechas históricas.
"""
from django.db import migrations, models
from django.db.models.functions import Upper
from django.db.migrations.exceptions import IrreversibleError

KINDS = ('percentage', 'fixed', 'free_shipping', 'descuento_porcentual',
         'descuento_monto_fijo', 'envio_gratuito', 'precio_oferta')
CHOICES = [(k, label) for k, label in zip(KINDS, (
    'Descuento porcentual', 'Descuento por monto fijo', 'Envío gratuito',
    'Descuento porcentual', 'Descuento por monto fijo', 'Envío gratuito', 'Precio de oferta'))]
BASE_COLUMNS = {'nombre', 'tipo', 'codigo', 'valor', 'monto_minimo', 'maximo_usos',
                'usos', 'activa', 'fecha_inicio', 'fecha_fin', 'fecha_creacion',
                'fecha_actualizacion', 'tienda_id'}


def reconcile(apps, schema_editor):
    connection = schema_editor.connection
    if connection.vendor != 'postgresql':
        raise RuntimeError('La reconciliación de promociones requiere PostgreSQL.')
    with connection.cursor() as cursor:
        cursor.execute("SET LOCAL lock_timeout = '5s'")
        cursor.execute("SET LOCAL statement_timeout = '30s'")
        cursor.execute('SELECT current_schema()')
        schema = cursor.fetchone()[0]
        table = f'{schema_editor.quote_name(schema)}."promocion"'
        cursor.execute(f'LOCK TABLE {table} IN ACCESS EXCLUSIVE MODE')
        cursor.execute('''SELECT column_name, data_type, character_maximum_length,
                          numeric_precision, numeric_scale, is_nullable FROM information_schema.columns
                          WHERE table_schema=%s AND table_name='promocion' ''', [schema])
        columns = {row[0]: row[1:] for row in cursor.fetchall()}
        keys = set(columns) & {'id', 'id_promocion'}
        if len(keys) != 1 or set(columns) != BASE_COLUMNS | keys:
            raise RuntimeError('Esquema de promociones desconocido: columnas o PK ambiguas. No se modificó.')
        pk = next(iter(keys))
        expected = {'nombre': 'character varying', 'tipo': 'character varying', 'codigo': 'character varying',
                    pk: 'bigint', 'tienda_id': 'bigint', 'valor': 'numeric', 'monto_minimo': 'numeric',
                    'maximo_usos': 'integer', 'usos': 'integer', 'activa': 'boolean',
                    'fecha_creacion': 'timestamp with time zone', 'fecha_actualizacion': 'timestamp with time zone'}
        if any(columns[k][0] != typ for k, typ in expected.items()):
            raise RuntimeError('Esquema de promociones desconocido: tipos físicos incompatibles.')
        if columns['tipo'][1] not in (20, 30) or columns['codigo'][1] != 40 or columns['nombre'][1] != 150:
            raise RuntimeError('Tamaños de columnas históricos desconocidos.')
        if any(columns[k][2:4] != (12, 2) for k in ('valor', 'monto_minimo')):
            raise RuntimeError('Precisión monetaria desconocida; se requiere revisión.')
        date_type = columns['fecha_inicio'][0]
        if date_type not in ('date', 'timestamp with time zone') or columns['fecha_fin'][0] != date_type:
            raise RuntimeError('Vigencias ambiguas: no se infiere zona de timestamps sin zona ni de columnas mixtas.')
        required = set(columns) - {'fecha_inicio', 'fecha_fin', 'maximo_usos'}
        if any(columns[k][4] != 'NO' for k in required) or columns['maximo_usos'][4] != 'YES':
            raise RuntimeError('Nulabilidad histórica desconocida: se requiere revisión antes de transformar.')
        constraints = connection.introspection.get_constraints(cursor, 'promocion')
        if not any(v.get('columns') == ['tienda_id'] and v.get('foreign_key') == ('tienda', 'id_tienda') for v in constraints.values()):
            raise RuntimeError('La referencia a tienda no coincide con los esquemas históricos conocidos.')
        primary = [v['columns'] for v in constraints.values() if v.get('primary_key')]
        cursor.execute('SELECT pg_get_serial_sequence(%s, %s)', [f'{schema}.promocion', pk])
        if primary != [[pk]] or not cursor.fetchone()[0]:
            raise RuntimeError('PK o secuencia no reconocidas; se preserva el estado previo.')
        known_unique = {'uq_promocion_tienda_codigo', 'uq_promocion_codigo_por_tienda'}
        if any(v.get('unique') and not v.get('primary_key') and k not in known_unique for k, v in constraints.items()):
            raise RuntimeError('Restricción única desconocida: revisión previa necesaria.')
        # Todo preflight precede a ALTER/DROP/CREATE. Nunca se normalizan datos silenciosamente.
        cursor.execute(f'''SELECT count(*) FROM {table} WHERE tipo NOT IN %s OR tipo IS NULL
            OR valor IS NULL OR valor < 0 OR monto_minimo IS NULL OR monto_minimo < 0
            OR usos IS NULL OR usos < 0 OR maximo_usos < 0
            OR (tipo IN ('percentage','descuento_porcentual') AND (valor <= 0 OR valor > 100))
            OR (tipo IN ('fixed','descuento_monto_fijo') AND valor <= 0)
            OR codigo IS NULL OR (tipo <> 'precio_oferta' AND codigo = '')
            OR (codigo <> '' AND codigo !~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$')
            OR (fecha_inicio IS NOT NULL AND fecha_fin IS NOT NULL AND fecha_fin < fecha_inicio)''', [KINDS])
        if cursor.fetchone()[0]:
            raise RuntimeError('Promociones inválidas o ambiguas: corregir con revisión humana, sin pérdida de filas.')
        cursor.execute(f'''SELECT count(*) FROM (SELECT tienda_id, upper(codigo)
            FROM {table} WHERE codigo <> '' GROUP BY tienda_id, upper(codigo) HAVING count(*)>1) d''')
        if cursor.fetchone()[0]:
            raise RuntimeError('Códigos duplicados dentro de una tienda tras normalización; no se elige un ganador.')
        if pk == 'id':
            cursor.execute(f'ALTER TABLE {table} RENAME COLUMN id TO id_promocion')
        if date_type == 'date':
            cursor.execute(f'''ALTER TABLE {table}
                ALTER COLUMN fecha_inicio TYPE timestamptz USING (fecha_inicio::timestamp AT TIME ZONE 'America/Santiago'),
                ALTER COLUMN fecha_fin TYPE timestamptz USING
                  (((fecha_fin + 1)::timestamp AT TIME ZONE 'America/Santiago') - interval '1 microsecond')''')
        cursor.execute(f'''ALTER TABLE {table} ALTER COLUMN fecha_inicio DROP NOT NULL,
            ALTER COLUMN fecha_fin DROP NOT NULL, ALTER COLUMN tipo TYPE varchar(30)''')
        # Django defaults are application defaults, not persistent SQL defaults.
        for name in known_unique:
            detail = constraints.get(name)
            if detail and not detail.get('index'):
                cursor.execute(f'ALTER TABLE {table} DROP CONSTRAINT {schema_editor.quote_name(name)}')
            elif detail:
                cursor.execute(f'DROP INDEX {schema_editor.quote_name(schema)}.{schema_editor.quote_name(name)}')
        cursor.execute(f'''CREATE UNIQUE INDEX uq_promocion_codigo_por_tienda
                           ON {table} (upper(codigo), tienda_id) WHERE NOT (codigo = '')''')
        checks = {
            'chk_promocion_fechas_validas': '(fecha_inicio IS NULL OR fecha_fin IS NULL OR fecha_fin >= fecha_inicio)',
            'chk_promocion_valor_no_negativo': '(valor >= 0)',
            'chk_promocion_minimo_no_negativo': '(monto_minimo >= 0)',
            'chk_promocion_codigo_cupon': "(tipo = 'precio_oferta' OR codigo <> '')",
            'chk_promocion_tipo_valido': "(tipo IN ('percentage','fixed','free_shipping','descuento_porcentual','descuento_monto_fijo','envio_gratuito','precio_oferta'))",
            'chk_promocion_descuento_valido': "((tipo NOT IN ('percentage','descuento_porcentual') OR (valor > 0 AND valor <= 100)) AND (tipo NOT IN ('fixed','descuento_monto_fijo') OR valor > 0))",
        }
        for name, expression in checks.items():
            cursor.execute(f'ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {schema_editor.quote_name(name)}')
            cursor.execute(f'ALTER TABLE {table} ADD CONSTRAINT {schema_editor.quote_name(name)} CHECK {expression}')


def refuse_reverse(apps, schema_editor):
    raise IrreversibleError('No se truncan instantes a DATE. Restaurar respaldo verificado y aplicación compatible.')


class Migration(migrations.Migration):
    atomic = True
    dependencies = [('core', '0022_merge_0021_configuracionlegal_0021_promocion')]
    operations = [migrations.SeparateDatabaseAndState(
        database_operations=[migrations.RunPython(reconcile, refuse_reverse)],
        state_operations=[
            migrations.AlterField('promocion', 'fecha_inicio', models.DateTimeField(null=True, blank=True)),
            migrations.AlterField('promocion', 'fecha_fin', models.DateTimeField(null=True, blank=True)),
            migrations.AlterField('promocion', 'tipo', models.CharField(max_length=30, choices=CHOICES)),
            migrations.RemoveConstraint('promocion', 'uq_promocion_codigo_por_tienda'),
            migrations.AddConstraint('promocion', models.UniqueConstraint(Upper('codigo'), 'tienda', condition=~models.Q(codigo=''), name='uq_promocion_codigo_por_tienda')),
            migrations.AddConstraint('promocion', models.CheckConstraint(condition=models.Q(tipo='precio_oferta') | ~models.Q(codigo=''), name='chk_promocion_codigo_cupon')),
            migrations.AddConstraint('promocion', models.CheckConstraint(condition=models.Q(tipo__in=KINDS), name='chk_promocion_tipo_valido')),
            migrations.AddConstraint('promocion', models.CheckConstraint(condition=(~models.Q(tipo__in=('percentage','descuento_porcentual')) | models.Q(valor__gt=0,valor__lte=100)) & (~models.Q(tipo__in=('fixed','descuento_monto_fijo')) | models.Q(valor__gt=0)), name='chk_promocion_descuento_valido')),
        ],
    )]
