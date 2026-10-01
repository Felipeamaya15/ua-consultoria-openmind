from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('landing', '0002_configuracionlanding_logo_and_more')]
    operations = [migrations.AddField(
        model_name='configuracionlanding', name='contenido',
        field=models.JSONField(blank=True, default=dict),
    )]
