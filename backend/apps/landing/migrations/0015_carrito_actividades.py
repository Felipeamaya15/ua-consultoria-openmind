from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('landing', '0014_registrocarritoabandonado'),
    ]

    operations = [
        migrations.CreateModel(
            name='SeleccionCarritoActividad',
            fields=[
                (
                    'id',
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name='ID',
                    ),
                ),
                ('seccion_id', models.UUIDField()),
                ('cantidad', models.PositiveSmallIntegerField()),
                ('titulo', models.CharField(max_length=200)),
                ('precio', models.PositiveBigIntegerField()),
                ('version', models.CharField(max_length=64)),
                ('inicio', models.DateTimeField()),
                ('zona', models.CharField(max_length=80)),
                ('actualizado', models.DateTimeField(auto_now=True)),
                (
                    'tienda',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to='core.tienda',
                    ),
                ),
                (
                    'usuario',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                'constraints': [
                    models.UniqueConstraint(
                        fields=(
                            'tienda', 'usuario', 'seccion_id'
                        ),
                        name='carrito_actividad_usuario_unico',
                    ),
                ],
            },
        ),
    ]
