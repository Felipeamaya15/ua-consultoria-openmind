"""Tarifas explícitas por tienda; no hay todavía clientes de las APIs de transportistas."""
import json
from pathlib import Path
from time import time

from django.core import signing
from rest_framework.exceptions import ValidationError

from apps.catalog.infrastructure.adapters.chilexpress_response import procesar_respuesta_chilexpress
from apps.catalog.infrastructure.adapters.starken_response import procesar_respuesta_starken
from apps.core.delivery import DELIVERY_METHODS, delivery_for_store

QUOTE_MAX_AGE = 15 * 60
QUOTE_SALT = 'core.shipping.quote.v1'
REGION_ALIASES = {
    'Metropolitana': 'Metropolitana de Santiago',
    'OHiggins': "Libertador General Bernardo O'Higgins",
    'Araucanía': 'La Araucanía', 'Aysén': 'Aysén del General Carlos Ibáñez del Campo',
    'Magallanes': 'Magallanes y de la Antártica Chilena', 'Arica': 'Arica y Parinacota',
}
with (Path(__file__).parent / 'data' / 'chile_territory.json').open(encoding='utf-8') as source:
    TERRITORY = json.load(source)


def canonical_region(region):
    return REGION_ALIASES.get(region, region) if isinstance(region, str) else ''


def validate_destination(region, comuna):
    official = canonical_region(region)
    for entry in TERRITORY:
        if entry['nombre'] == official and any(comuna in p['comunas'] for p in entry['provincias']):
            return official
    raise ValidationError({'comuna': 'Selecciona una comuna de la región elegida.'})


def configured_quote(tienda, operador, region, comuna):
    region = validate_destination(region, comuna)
    method = DELIVERY_METHODS.get(operador)
    if method not in ('chilexpress', 'starken'):
        raise ValidationError({'operador': 'Selecciona Chilexpress o Starken. Retiro no requiere cotización.'})
    carrier = delivery_for_store(tienda)[method]
    if not carrier['enabled']:
        raise ValidationError({'operador': 'El transportista no está habilitado en esta tienda.'})
    rates = [rate for rate in carrier['tarifas'] if isinstance(rate, dict)
             and canonical_region(rate.get('region')) == region and rate.get('comuna') == comuna]
    if len(rates) != 1:
        raise ValidationError({'cotizacion': 'No hay una tarifa disponible para este destino. Contacta a la tienda.'})
    rate = rates[0]
    amount, days = rate.get('monto'), rate.get('plazo_dias')
    # Defensa también ante datos históricos escritos fuera del serializer de configuración.
    if (type(amount) is not int or not 0 <= amount <= 9999999999
            or (days is not None and (type(days) is not int or not 1 <= days <= 365))):
        raise ValidationError({'cotizacion': 'La tarifa no está disponible. Contacta a la tienda.'})
    try:
        if operador == 'Chilexpress':
            quote = procesar_respuesta_chilexpress({'data': {'courierServiceOptions': [{'serviceValue': amount}]}})
        else:
            quote = procesar_respuesta_starken({'valor': amount, 'plazo_entrega': days})
    except (ValueError, TypeError, OverflowError):
        raise ValidationError({'cotizacion': 'No se pudo cotizar el envío. Intenta nuevamente.'}) from None
    return {**quote, 'monto': str(quote['monto']), 'plazo_dias': days,
            'region': region, 'comuna': comuna, 'origen': 'configuracion_tienda'}


def issue_quote(tienda, operador, region, comuna):
    quote = configured_quote(tienda, operador, region, comuna)
    payload = {**quote, 'tienda': tienda.pk, 'vence_en': int(time()) + QUOTE_MAX_AGE}
    return {**quote, 'vence_en': payload['vence_en'],
            'cotizacion': signing.dumps(payload, salt=QUOTE_SALT, compress=True)}


def validate_quote(tienda, operador, address, token):
    try:
        signed = signing.loads(token or '', salt=QUOTE_SALT, max_age=QUOTE_MAX_AGE)
        if not isinstance(signed, dict) or signed.get('vence_en', 0) <= time():
            raise signing.BadSignature()
    except (signing.BadSignature, TypeError, ValueError):
        raise ValidationError({'cotizacion': 'La cotización es inválida o venció. Vuelve a cotizar el envío.'}) from None
    current = configured_quote(tienda, operador, address.get('region'), address.get('city'))
    expected = {**current, 'tienda': tienda.pk}
    if any(signed.get(key) != value for key, value in expected.items()):
        raise ValidationError({'cotizacion': 'La cotización cambió. Vuelve a cotizar el envío.'})
    return current
