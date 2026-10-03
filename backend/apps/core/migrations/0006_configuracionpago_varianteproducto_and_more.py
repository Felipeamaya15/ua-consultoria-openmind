import django.db.models.deletion
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

    # Mantenemos la dependencia de la rama feature (0011) para no romper su historial
    dependencies = [
        ('core', '0011_checkout_order_snapshots'),
    ]

    operations = [
        # 1. Creación de modelos de la rama develop
        migrations.CreateModel(
            name='ConfiguracionPago',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('datos', models.JSONField(blank=True, default=dict)),
                ('fecha_actualizacion', models.DateTimeField(auto_now=True)),
                ('tienda', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='configuracion_pago', to='core.tienda')),
            ],
            options={
                'db_table': 'configuracion_pago',
            },
        ),
        migrations.CreateModel(
            name='VarianteProducto',
            fields=[
                ('id_variante', models.BigAutoField(primary_key=True, serialize=False)),
                ('sku', models.CharField(max_length=100)),
                ('precio', models.DecimalField(decimal_places=2, max_digits=12)),
                ('stock', models.IntegerField(default=0)),
                ('atributos', models.JSONField(default=dict)),
                ('es_activa', models.BooleanField(default=True)),
                ('fecha_creacion', models.DateTimeField(auto_now_add=True)),
                ('id_producto', models.ForeignKey(db_column='id_producto', on_delete=django.db.models.deletion.CASCADE, to='core.producto')),
            ],
            options={
                'db_table': 'variante_producto',
            },
        ),
        
        # 2. Se añaden los campos a ItemPedido 
        migrations.AddField(
            model_name='itempedido',
            name='atributos',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='itempedido',
            name='sku',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        
        # 3. Se añaden los campos a Pedido (con default='' de la rama feature para evitar bloqueos)
        migrations.AddField(
            model_name='pedido',
            name='nombre_contacto',
            field=models.CharField(blank=True, default='', max_length=150),
        ),
        migrations.AddField(
            model_name='pedido',
            name='correo_contacto',
            field=models.EmailField(blank=True, default='', max_length=320),
        ),
        migrations.AddField(
            model_name='pedido',
            name='telefono_contacto',
            field=models.CharField(blank=True, default='', max_length=30),
        ),
        migrations.AddField(
            model_name='pedido',
            name='metodo_pago',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
        migrations.AlterField(
            model_name='pedido',
            name='id_usuario',
            field=models.ForeignKey(blank=True, db_column='id_usuario', null=True, on_delete=django.db.models.deletion.CASCADE, to='core.usuario'),
        ),
        
        # 4. Migración de datos de la rama feature (siempre DEBE ir después de crear las columnas)
        migrations.RunPython(preserve_checkout_snapshots, migrations.RunPython.noop),
        
        # 5. Restricciones de base de datos extraídas de ambas ramas
        migrations.AddConstraint(
            model_name='pedido',
            constraint=models.CheckConstraint(condition=models.Q(('id_usuario__isnull', False), models.Q(('correo_contacto', ''), _negated=True), _connector='OR'), name='chk_pedido_tiene_comprador'),
        ),
        migrations.AddConstraint(
            model_name='varianteproducto',
            constraint=models.CheckConstraint(condition=models.Q(('precio__gte', 0)), name='chk_variante_precio_valido'),
        ),
        migrations.AddConstraint(
            model_name='varianteproducto',
            constraint=models.CheckConstraint(condition=models.Q(('stock__gte', 0)), name='chk_variante_stock_valido'),
        ),
    ]