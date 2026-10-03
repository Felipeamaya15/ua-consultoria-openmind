from django.db import migrations, models


def preserve_checkout_snapshots(apps, schema_editor):
    Pedido = apps.get_model('core', 'Pedido')
    ItemPedido = apps.get_model('core', 'ItemPedido')
    alias = schema_editor.connection.alias
    for order in Pedido.objects.using(alias).all().iterator():
        contact = order.contacto or {}
        order.nombre_contacto = contact.get('nombre', '')
        order.correo_contacto = contact.get('email', '')
        order.telefono_contacto = contact.get('telefono', '')
        order.metodo_pago = order.medio_pago
        order.save(using=alias, update_fields=['nombre_contacto', 'correo_contacto', 'telefono_contacto', 'metodo_pago'])
    for item in ItemPedido.objects.using(alias).all().iterator():
        item.atributos = {a.get('etiqueta') or a.get('clave'): a.get('valor') for a in item.atributos_variante}
        item.save(using=alias, update_fields=['atributos'])


class Migration(migrations.Migration):
    # ConfiguracionPago, VarianteProducto y sku ya existen en esta historia.
    dependencies = [('core', '0011_checkout_order_snapshots')]
    operations = [
        migrations.AddField(model_name='itempedido', name='atributos', field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name='pedido', name='nombre_contacto', field=models.CharField(blank=True, default='', max_length=150)),
        migrations.AddField(model_name='pedido', name='correo_contacto', field=models.EmailField(blank=True, default='', max_length=320)),
        migrations.AddField(model_name='pedido', name='telefono_contacto', field=models.CharField(blank=True, default='', max_length=30)),
        migrations.AddField(model_name='pedido', name='metodo_pago', field=models.CharField(blank=True, default='', max_length=50)),
        migrations.RunPython(preserve_checkout_snapshots, migrations.RunPython.noop),
        migrations.AddConstraint(model_name='pedido', constraint=models.CheckConstraint(
            condition=models.Q(id_usuario__isnull=False) | models.Q(comprador__isnull=False) | ~models.Q(correo_contacto=''),
            name='chk_pedido_tiene_comprador')),
    ]
