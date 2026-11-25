from django.conf import settings
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("authentication", "0003_configuracion_pagos"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="postal_code",
            field=models.CharField(
                blank=True,
                default="",
                max_length=12,
                verbose_name="Código Postal",
            ),
        ),
        migrations.CreateModel(
            name="UserMFA",
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
                (
                    "secret",
                    models.CharField(
                        max_length=64,
                        verbose_name="Secreto TOTP Base32",
                    ),
                ),
                (
                    "is_enabled",
                    models.BooleanField(
                        default=False,
                        verbose_name="MFA Activo",
                    ),
                ),
                (
                    "fecha_actualizacion",
                    models.DateTimeField(auto_now=True),
                ),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="mfa",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "user_mfa",
            },
        ),
    ]
