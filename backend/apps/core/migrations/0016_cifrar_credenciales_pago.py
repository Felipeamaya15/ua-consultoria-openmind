from django.db import migrations

import apps.core.infrastructure.encryption as encryption

CAMPOS = [
    ("configuracion_transbank", "id_configuracion", "api_key"),
    ("configuracion_paypal", "id_tienda", "client_secret"),
    ("configuracion_mercadopago", "id_tienda", "access_token"),
]
MODELOS = [
    ("ConfiguracionTransbank", "api_key"),
    ("ConfiguracionPayPal", "client_secret"),
    ("ConfiguracionMercadoPago", "access_token"),
]


def cifrar_existentes(apps, schema_editor):
    for nombre, campo in MODELOS:
        Modelo = apps.get_model("core", nombre)
        for obj in Modelo.objects.all():
            obj.save(update_fields=[campo])


def descifrar_existentes(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        for tabla, pk, columna in CAMPOS:
            cursor.execute(f"SELECT {pk}, {columna} FROM {tabla}")
            for fila_id, valor in cursor.fetchall():
                cursor.execute(
                    f"UPDATE {tabla} SET {columna} = %s WHERE {pk} = %s",
                    [encryption.descifrar(valor), fila_id],
                )


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0015_itemcarrito_sku"),
    ]

    operations = [
        migrations.AlterField(
            model_name="configuraciontransbank",
            name="api_key",
            field=encryption.EncryptedTextField(),
        ),
        migrations.AlterField(
            model_name="configuracionpaypal",
            name="client_secret",
            field=encryption.EncryptedTextField(blank=True, default=""),
        ),
        migrations.AlterField(
            model_name="configuracionmercadopago",
            name="access_token",
            field=encryption.EncryptedTextField(blank=True, default=""),
        ),
        migrations.RunPython(cifrar_existentes, descifrar_existentes),
    ]
