from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0014_itempedido_atributos'),
    ]

    operations = [
        migrations.AddField(
            model_name='itemcarrito',
            name='sku',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.AddConstraint(
            model_name='itemcarrito',
            constraint=models.UniqueConstraint(
                fields=('id_carrito', 'id_producto', 'sku'),
                name='uq_item_carrito_variante',
            ),
        ),
        migrations.AddConstraint(
            model_name='itemcarrito',
            constraint=models.UniqueConstraint(
                condition=Q(sku__isnull=True),
                fields=('id_carrito', 'id_producto'),
                name='uq_item_carrito_producto_base',
            ),
        ),
    ]
