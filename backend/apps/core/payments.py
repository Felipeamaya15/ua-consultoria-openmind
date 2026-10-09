"""Disponibilidad de los medios de pago; nunca devuelve credenciales privadas."""
from apps.core.models import (
    ConfiguracionMercadoPago, ConfiguracionPago, ConfiguracionPayPal, ConfiguracionTransbank,
)

PAYMENT_METHODS = {
    'Transbank': 'transbank', 'PayPal': 'paypal', 'MercadoPago': 'mercadopago',
    'Linkify': 'linkify', 'Transferencia': 'transfer',
}
UNAVAILABLE_CHECKOUT_METHODS = {
    "paypal": "PayPal requiere conciliación de moneda y captura antes de habilitar compras en CLP.",
    "mercadopago": "Mercado Pago requiere conectar el inicio y la confirmación del cobro al pedido.",
}
TRANSFER_PUBLIC_FIELDS = (
    'bank_name', 'account_type', 'account_number', 'holder_rut', 'holder_name', 'confirmation_email',
)


def payment_methods_for_store(tienda):
    methods = {}
    for key, model, credentials in (
        ('transbank', ConfiguracionTransbank, ('api_key', 'codigo_comercio')),
        ('paypal', ConfiguracionPayPal, ('client_id', 'client_secret')),
        ('mercadopago', ConfiguracionMercadoPago, ('public_key', 'access_token')),
    ):
        config = model.objects.filter(id_tienda=tienda, activo=True).first()
        if config and all(str(getattr(config, field) or '').strip() for field in credentials):
            methods[key] = ({'enabled': False, 'reason': UNAVAILABLE_CHECKOUT_METHODS[key]}
                            if key in UNAVAILABLE_CHECKOUT_METHODS else {'enabled': True})
    config = ConfiguracionPago.objects.filter(tienda=tienda).first()
    data = config.datos if config and isinstance(config.datos, dict) else {}
    for key, required in (('linkify', ('idCuenta', 'clavePrivada')), ('transfer', TRANSFER_PUBLIC_FIELDS)):
        method = data.get(key)
        if not isinstance(method, dict) or method.get('enabled') is not True:
            continue
        fields = method.get('fields')
        if not isinstance(fields, dict) or not all(isinstance(fields.get(field), str) and fields[field].strip()
                                                  for field in required):
            continue
        methods[key] = {'enabled': True}
        if key == 'transfer':
            methods[key]['fields'] = {field: fields[field] for field in TRANSFER_PUBLIC_FIELDS}
    return methods
