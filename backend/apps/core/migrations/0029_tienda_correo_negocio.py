from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('core', '0028_bind_consent_management_link')]
    operations = [migrations.AddField(model_name='tienda', name='correo_negocio', field=models.EmailField(blank=True, default='', max_length=254))]
