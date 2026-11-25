from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0024_configuracioncorreo"),
    ]

    operations = [
        migrations.AddField(
            model_name="pedido",
            name="webpay_token",
            field=models.CharField(blank=True, default="", max_length=512),
        ),
        migrations.AddField(
            model_name="pedido",
            name="webpay_url",
            field=models.CharField(blank=True, default="", max_length=2048),
        ),
    ]
