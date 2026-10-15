"""Contrato de entrega compartido por el panel, la consulta pública y checkout."""
from apps.core.models import ConfiguracionEntrega


DELIVERY_METHODS = {'Chilexpress': 'chilexpress', 'Starken': 'starken', 'Retiro': 'pickup'}


def delivery_defaults():
    return {
        'chilexpress': {'enabled': False, 'accountId': '', 'apiKey': '', 'status': 'not_configured', 'tarifas': []},
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
