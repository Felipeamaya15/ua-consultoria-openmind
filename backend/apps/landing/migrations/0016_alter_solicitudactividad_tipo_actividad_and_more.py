import apps.landing.private_storage
import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0037_merge_correo_tipo_cambio'),
        ('landing', '0015_carrito_actividades'),
    ]

    operations = [
        migrations.AlterField(model_name='reservaactividadpagada', name='inicio', field=models.DateTimeField(null=True, blank=True)),
        migrations.AlterField(model_name='reservaactividadpagada', name='cierre', field=models.DateTimeField(null=True, blank=True)),
        migrations.AlterField(model_name='seleccioncarritoactividad', name='inicio', field=models.DateTimeField(null=True, blank=True)),
        migrations.AlterField(
            model_name='solicitudactividad',
            name='tipo_actividad',
            field=models.CharField(choices=[('servicio', 'Servicio'), ('taller', 'Taller'), ('producto', 'Cotización de producto')], max_length=10),
        ),
        migrations.CreateModel(
            name='GrabacionTaller',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('titulo', models.CharField(max_length=200)),
                ('archivo', models.FileField(max_length=200, storage=apps.landing.private_storage.PrivateRecordingStorage(), upload_to=apps.landing.private_storage.recording_path)),
                ('bytes', models.PositiveBigIntegerField()),
                ('activa', models.BooleanField(default=True)),
                ('creado', models.DateTimeField(auto_now_add=True)),
                ('tienda', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='core.tienda')),
            ],
        ),
    ]
