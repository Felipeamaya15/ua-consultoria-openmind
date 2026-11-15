from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0035_conexiongmailtienda'),
    ]

    operations = [
        migrations.CreateModel(
            name='TipoCambioGuardado',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('observado', models.DecimalField(decimal_places=4, max_digits=12)),
                ('fecha_dato', models.DateField()),
                ('fuente', models.CharField(max_length=60)),
                ('obtenido_en', models.DateTimeField()),
            ],
        ),
    ]
