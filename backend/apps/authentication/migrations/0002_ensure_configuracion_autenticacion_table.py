from django.db import migrations


def crear_tabla_si_no_existe(apps, schema_editor):
    ConfiguracionAutenticacion = apps.get_model(
        "authentication",
        "ConfiguracionAutenticacion",
    )

    tablas_existentes = schema_editor.connection.introspection.table_names()

    if ConfiguracionAutenticacion._meta.db_table not in tablas_existentes:
        schema_editor.create_model(ConfiguracionAutenticacion)


def eliminar_tabla_si_existe(apps, schema_editor):
    ConfiguracionAutenticacion = apps.get_model(
        "authentication",
        "ConfiguracionAutenticacion",
    )

    tablas_existentes = schema_editor.connection.introspection.table_names()

    if ConfiguracionAutenticacion._meta.db_table in tablas_existentes:
        schema_editor.delete_model(ConfiguracionAutenticacion)


class Migration(migrations.Migration):

    dependencies = [
        ("authentication", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(
            crear_tabla_si_no_existe,
            eliminar_tabla_si_existe,
        ),
    ]