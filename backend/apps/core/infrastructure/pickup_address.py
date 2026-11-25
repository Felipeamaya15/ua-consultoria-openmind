"""Adaptador configurable de geocodificación. Nunca retorna coincidencias parciales."""
import os
import re
import unicodedata
import requests
from django.core import signing
from apps.core.pickup import SALT


class AddressProviderError(Exception):
    pass


def configured():
    return os.getenv('PICKUP_GEOCODING_PROVIDER') == 'google' and bool(os.getenv('PICKUP_GOOGLE_GEOCODING_KEY'))


def normalize(value):
    value = ''.join(c for c in unicodedata.normalize('NFD', value.lower()) if not unicodedata.combining(c))
    value = value.replace('region', '').strip()
    return re.sub(r'^(?:de|del)\s+', '', value)


class GoogleAddressProvider:
    def search(self, region, comuna, query):
        try:
            response = requests.get('https://maps.googleapis.com/maps/api/geocode/json', params={
                'address': f'{query}, {comuna}, {region}, Chile', 'components': 'country:CL',
                'language': 'es', 'key': os.environ['PICKUP_GOOGLE_GEOCODING_KEY'],
            }, timeout=8)
            response.raise_for_status()
            body = response.json()
            if not isinstance(body, dict):
                raise ValueError()
        except (requests.RequestException, ValueError, KeyError):
            raise AddressProviderError('No se pudo consultar el proveedor de direcciones. Intenta nuevamente.') from None
        if body.get('status') == 'ZERO_RESULTS':
            return []
        if body.get('status') != 'OK':
            raise AddressProviderError('El proveedor de direcciones no está disponible. Revisa su configuración.')
        results = []
        for row in body.get('results', [])[:10]:
            if not isinstance(row, dict):
                continue
            components = {kind: c.get('long_name', '') for c in row.get('address_components', []) for kind in c.get('types', [])}
            country = next((c.get('short_name') for c in row.get('address_components', []) if 'country' in c.get('types', [])), '')
            matches_comuna = any(normalize(components.get(key, '')) == normalize(comuna)
                                 for key in ('administrative_area_level_3', 'locality', 'sublocality_level_1'))
            provider_region = normalize(components.get('administrative_area_level_1', ''))
            region_match = provider_region == normalize(region) or (
                normalize(region) == 'metropolitana de santiago' and provider_region in ('metropolitana', 'metropolitana de santiago'))
            special = 'premise' in row.get('types', []) and bool(components.get('premise'))
            street = components.get('route') or (components.get('premise') if special else '')
            number = components.get('street_number', '')
            if (row.get('partial_match') or country != 'CL' or not matches_comuna or not region_match
                    or row.get('geometry', {}).get('location_type') != 'ROOFTOP'
                    or not street or (not number and not special) or not row.get('place_id')):
                continue
            results.append({'region': region, 'comuna': comuna, 'street': street, 'number': number,
                            'reference': '', 'place_id': row['place_id'], 'special': special})
        return results


def search_addresses(tienda, region, comuna, query):
    if not configured():
        raise AddressProviderError('Búsqueda de direcciones no configurada. Puedes guardar otras entregas o dejar el retiro desactivado.')
    results = GoogleAddressProvider().search(region, comuna, query)
    for row in results:
        address = {key: row[key] for key in ('region', 'comuna', 'street', 'number')}
        row['verification'] = signing.dumps({'tienda': str(tienda.pk), 'address': address,
                                            'special': row.pop('special'), 'place_id': row.pop('place_id')}, salt=SALT, compress=True)
    return results
