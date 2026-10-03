import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("authentication", "0002_ensure_configuracion_autenticacion_table"),
    ]

    operations = [
        migrations.CreateModel(
            name="ConfiguracionPagos",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("metodos", models.JSONField(default=dict)),
                ("fecha_actualizacion", models.DateTimeField(auto_now=True)),
                (
                    "tienda",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="configuracion_pagos",
                        to="core.tienda",
                    ),
                ),
            ],
            options={
                "db_table": "configuracion_pagos",
            },
        ),
    ]
