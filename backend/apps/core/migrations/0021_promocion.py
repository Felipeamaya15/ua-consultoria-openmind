from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('core', '0020_alter_pedido_estado')]

    operations = [
        migrations.CreateModel(
            name='Promocion',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nombre', models.CharField(max_length=150)),
                ('codigo', models.CharField(max_length=40)),
                ('tipo', models.CharField(choices=[('percentage', 'Porcentaje'), ('fixed', 'Monto fijo'), ('free_shipping', 'Envio gratis')], max_length=20)),
                ('valor', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('monto_minimo', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('maximo_usos', models.PositiveIntegerField(blank=True, null=True)),
                ('usos', models.PositiveIntegerField(default=0)),
                ('fecha_inicio', models.DateField()),
                ('fecha_fin', models.DateField(blank=True, null=True)),
                ('activa', models.BooleanField(default=True)),
                ('fecha_creacion', models.DateTimeField(auto_now_add=True)),
                ('fecha_actualizacion', models.DateTimeField(auto_now=True)),
                ('tienda', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='promociones', to='core.tienda')),
            ],
            options={
                'db_table': 'promocion',
                'constraints': [
                    models.UniqueConstraint(fields=('tienda', 'codigo'), name='uq_promocion_tienda_codigo'),
                    models.CheckConstraint(condition=models.Q(('valor__gte', 0)), name='chk_promocion_valor_no_negativo'),
                    models.CheckConstraint(condition=models.Q(('monto_minimo__gte', 0)), name='chk_promocion_minimo_no_negativo'),
                ],
            },
        ),
    ]
