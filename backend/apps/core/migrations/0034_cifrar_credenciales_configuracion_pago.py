from django.db import migrations

CAMPOS_SECRETOS = {'linkify': ('clavePrivada',), 'tuu': ('secretKey',)}


def cifrar_credenciales_existentes(apps, schema_editor):
    from apps.core.infrastructure.encryption import cifrar
    ConfiguracionPago = apps.get_model('core', 'ConfiguracionPago')
    for config in ConfiguracionPago.objects.all():
        datos = config.datos if isinstance(config.datos, dict) else {}
        cambio = False
        for metodo, campos in CAMPOS_SECRETOS.items():
            fields = (datos.get(metodo) or {}).get('fields') if isinstance(datos.get(metodo), dict) else None
            if not isinstance(fields, dict):
                continue
            for campo in campos:
                valor = fields.get(campo)
                if isinstance(valor, str) and valor and cifrar(valor) != valor:
                    fields[campo] = cifrar(valor)
                    cambio = True
        if cambio:
            config.datos = datos
            config.save(update_fields=['datos'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0033_pedido_stock_descontado'),
    ]

    operations = [
        migrations.RunPython(cifrar_credenciales_existentes, migrations.RunPython.noop),
    ]
