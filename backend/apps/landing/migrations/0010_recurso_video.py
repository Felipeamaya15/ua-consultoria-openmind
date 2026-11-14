from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('landing', '0009_borradores_campanas')]
    operations = [migrations.AlterField(
        model_name='recursomultimedia', name='tipo',
        field=models.CharField(max_length=12, choices=[(name, name) for name in ('imagen', 'video', 'youtube', 'instagram', 'facebook', 'enlace')]),
    )]
