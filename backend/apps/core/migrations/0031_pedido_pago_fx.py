from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0030_alter_pedido_estado')]
    operations = [migrations.AddField(model_name='pedido', name='pago_fx', field=models.JSONField(blank=True, default=dict))]
