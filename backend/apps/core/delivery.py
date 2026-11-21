"""Contrato de entrega compartido por el panel, la consulta pública y checkout."""
from django.core.exceptions import ImproperlyConfigured

from apps.core.infrastructure.encryption import cifrar, descifrar
from apps.core.models import ConfiguracionEntrega


DELIVERY_METHODS = {'Chilexpress': 'chilexpress', 'Starken': 'starken', 'Retiro': 'pickup'}

CARRIER_ENVIRONMENTS = ('SANDBOX', 'PRODUCCION')
CARRIER_CREDENTIALS = {'chilexpress': ('cotizador', 'coberturas', 'envios', 'tcc', 'origen')}
CARRIER_SECRET_FIELDS = {'chilexpress': ('cotizador', 'coberturas', 'envios')}
CREDENTIALS_KEY = 'credenciales_transportistas'


def _mask(value):
    if not value:
        return ''
    return '********' if len(value) <= 8 else f"{'*' * (len(value) - 4)}{value[-4:]}"


def _stored_credentials(datos, method):
    all_credentials = datos.get(CREDENTIALS_KEY) if isinstance(datos, dict) else None
    stored = all_credentials.get(method) if isinstance(all_credentials, dict) else None
    return stored if isinstance(stored, dict) else {}


def carrier_credentials(datos, method):
    result = {}
    for field in CARRIER_CREDENTIALS.get(method, ()):
        value = _stored_credentials(datos, method).get(field)
        if isinstance(value, str) and value:
            try:
                result[field] = descifrar(value) if field in CARRIER_SECRET_FIELDS[method] else value
            except ImproperlyConfigured:
                result[field] = ''
    return result


def merge_carrier_credentials(datos, method, incoming):
    stored = dict(_stored_credentials(datos, method))
    for field, value in (incoming or {}).items():
        value = value.strip() if isinstance(value, str) else ''
        if not value or value.startswith('*'):
            continue
        stored[field] = cifrar(value) if field in CARRIER_SECRET_FIELDS[method] else value
    all_credentials = dict(datos.get(CREDENTIALS_KEY) or {}) if isinstance(datos, dict) else {}
    all_credentials[method] = stored
    return all_credentials


def delivery_defaults():
    return {
        'chilexpress': {'enabled': False, 'accountId': '', 'apiKey': '', 'status': 'not_configured', 'tarifas': [],
                        'ambiente': 'SANDBOX', 'credenciales': {k: '' for k in CARRIER_CREDENTIALS['chilexpress']}},
        'starken': {'enabled': False, 'accountId': '', 'apiKey': '', 'status': 'not_configured', 'tarifas': []},
        'pickup': {'enabled': False, 'address': '', 'schedule': ''},
    }


def delivery_data(datos):
    """Completa campos ausentes y nunca expone credenciales de transportistas."""
    result = delivery_defaults()
    if not isinstance(datos, dict):
        return result
    for method, defaults in result.items():
        stored = datos.get(method)
        if not isinstance(stored, dict):
            continue
        defaults['enabled'] = stored.get('enabled') is True
        if method == 'chilexpress':
            if stored.get('ambiente') in CARRIER_ENVIRONMENTS:
                defaults['ambiente'] = stored['ambiente']
            credentials = carrier_credentials(datos, method)
            defaults['credenciales'] = {
                field: _mask(credentials.get(field, '')) if field in CARRIER_SECRET_FIELDS[method]
                else credentials.get(field, '') for field in CARRIER_CREDENTIALS[method]}
            if all(credentials.get(f) for f in ('cotizador', 'coberturas', 'origen')):
                defaults['status'] = 'configured'
        if method == 'pickup':
            for field in ('address', 'schedule'):
                if isinstance(stored.get(field), str):
                    defaults[field] = stored[field]
            if stored.get('version') == 2:
                from copy import deepcopy
                from apps.core.pickup import readable_pickup
                defaults.update({key: deepcopy(stored[key]) for key in ('version', 'location', 'hours', 'legacy_address', 'legacy_schedule') if key in stored})
                result[method] = readable_pickup(defaults)
        elif isinstance(stored.get('tarifas'), list):
            defaults['tarifas'] = [
                {key: rate[key] for key in ('region', 'comuna', 'monto', 'plazo_dias') if key in rate}
                for rate in stored['tarifas'] if isinstance(rate, dict)
            ]
    return result


def delivery_raw(tienda):
    config = ConfiguracionEntrega.objects.filter(tienda=tienda).first()
    return config.datos if config and isinstance(config.datos, dict) else {}


def delivery_for_store(tienda, *, public=True):
    config = ConfiguracionEntrega.objects.filter(tienda=tienda).first()
    data = delivery_data(config.datos if config else None)
    if public:
        from apps.core.pickup import validate_pickup
        if validate_pickup(data['pickup'], tienda.pk):
            data['pickup']['enabled'] = False
        if isinstance(data['pickup'].get('location'), dict):
            data['pickup']['location'].pop('verification', None)
    return data
