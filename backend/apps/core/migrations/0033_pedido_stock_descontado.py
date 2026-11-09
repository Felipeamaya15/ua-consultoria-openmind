from django.db import migrations, models


def pedidos_existentes_ya_descontaron(apps, schema_editor):
    apps.get_model('core', 'Pedido').objects.update(stock_descontado=True)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0032_expiracion_pedidos_y_vigencia_token'),
    ]

    operations = [
        migrations.AddField(
            model_name='pedido',
            name='stock_descontado',
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(pedidos_existentes_ya_descontaron, migrations.RunPython.noop),
    ]
