from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True
    dependencies = [('core', '0037_ficha_logistica_catalogo')]
    operations = [migrations.CreateModel(name='BlueShipment', fields=[
        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
        ('state', models.CharField(choices=[('draft','Preparado'),('submitting','Enviando'),('unknown','Revisar en Blue'),('emitted','Emitido')], default='draft', max_length=16)),
        ('payload', models.JSONField(default=dict)), ('configuration_hash', models.CharField(max_length=64)),
        ('tracking_number', models.CharField(blank=True,max_length=30)),
        ('labels', models.JSONField(default=list)), ('tracking', models.JSONField(default=dict)),
        ('created_at', models.DateTimeField(auto_now_add=True)), ('updated_at', models.DateTimeField(auto_now=True)),
        ('order', models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name='blue_shipment', to='core.pedido')),
    ])]
