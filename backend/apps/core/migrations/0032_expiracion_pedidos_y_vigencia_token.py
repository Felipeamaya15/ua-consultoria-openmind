import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0031_pedido_pago_fx'),
    ]

    operations = [
        migrations.AddField(
            model_name='pedido',
            name='webpay_iniciado_en',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='pedido',
            name='stock_devuelto',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='tienda',
            name='horas_expiracion_pedido_en_linea',
            field=models.PositiveSmallIntegerField(
                default=2, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(720)]),
        ),
        # En pagos manuales, 0 horas = el pedido nunca expira.
        migrations.AddField(
            model_name='tienda',
            name='horas_expiracion_pedido_manual',
            field=models.PositiveSmallIntegerField(
                default=48, validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(720)]),
        ),
    ]
