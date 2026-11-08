"""Disponibilidad de los medios de pago; nunca devuelve credenciales privadas."""
from apps.core.models import (
    ConfiguracionMercadoPago, ConfiguracionPago, ConfiguracionPayPal, ConfiguracionTransbank,
)

PAYMENT_METHODS = {
    'Transbank': 'transbank', 'PayPal': 'paypal', 'MercadoPago': 'mercadopago',
    'Linkify': 'linkify', 'Transferencia': 'transfer', 'TUU': 'tuu',
}
PAYPAL_SIN_TIPO_DE_CAMBIO = 'PayPal no está disponible: no hay un tipo de cambio CLP/USD reciente.'


def _paypal_checkout_state():
    """PayPal cobra en USD: solo se ofrece con un tipo de cambio vigente, que se informa al comprador."""
    from apps.core.infrastructure.tipo_cambio import tipo_cambio_vigente
    tipo = tipo_cambio_vigente()
    if not tipo:
        return {'enabled': False, 'reason': PAYPAL_SIN_TIPO_DE_CAMBIO}
    return {'enabled': True, 'fx': {
        'moneda': 'USD', 'tipo_cambio': str(tipo.aplicado), 'observado': str(tipo.observado),
        'margen_pct': str(tipo.margen_pct), 'fecha_dato': tipo.fecha_dato.isoformat(), 'fuente': tipo.fuente,
    }}


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
            methods[key] = _paypal_checkout_state() if key == 'paypal' else {'enabled': True}
    config = ConfiguracionPago.objects.filter(tienda=tienda).first()
    data = config.datos if config and isinstance(config.datos, dict) else {}
    for key, required in (('linkify', ('idCuenta', 'clavePrivada')), ('tuu', ('accountId', 'secretKey')),
                          ('transfer', TRANSFER_PUBLIC_FIELDS)):
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
