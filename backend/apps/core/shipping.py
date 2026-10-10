"""Tarifas explícitas por tienda; no hay todavía clientes de las APIs de transportistas."""
import json
from pathlib import Path
from time import time

from django.core import signing
from rest_framework.exceptions import ValidationError

from apps.catalog.infrastructure.adapters.chilexpress_response import procesar_respuesta_chilexpress
from apps.catalog.infrastructure.adapters.starken_response import procesar_respuesta_starken
from apps.core.delivery import DELIVERY_METHODS, delivery_for_store


class ErrorCotizacion(ValidationError):
    """Error de cotizacion con un codigo estable (SCRUM-349).

    Conserva el formato de ValidationError ({campo: [mensaje]}) y agrega un codigo
    que el frontend usa para decidir que mostrarle al comprador: reintentar,
    elegir otra alternativa o corregir la comuna.
    """

    def __init__(self, campo, mensaje, codigo):
        super().__init__({campo: mensaje})
        self.codigo_error = codigo
        self.mensaje_error = mensaje


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
    try:
        region = validate_destination(region, comuna)
    except ValidationError:
        raise ErrorCotizacion('comuna', 'Selecciona una comuna de la región elegida.', 'DESTINO_INVALIDO') from None
    method = DELIVERY_METHODS.get(operador)
    if method not in ('chilexpress', 'starken'):
        raise ErrorCotizacion('operador', 'Selecciona Chilexpress o Starken. Retiro no requiere cotización.',
                              'OPERADOR_INVALIDO')
    carrier = delivery_for_store(tienda)[method]
    if not carrier['enabled']:
        raise ErrorCotizacion('operador', 'El transportista no está habilitado en esta tienda.',
                              'TRANSPORTISTA_NO_HABILITADO')
    rates = [rate for rate in carrier['tarifas'] if isinstance(rate, dict)
             and canonical_region(rate.get('region')) == region and rate.get('comuna') == comuna]
    if len(rates) != 1:
        raise ErrorCotizacion('cotizacion', 'No hay una tarifa disponible para este destino. Contacta a la tienda.',
                              'TARIFA_NO_DISPONIBLE')
    rate = rates[0]
    amount, days = rate.get('monto'), rate.get('plazo_dias')
    # Defensa también ante datos históricos escritos fuera del serializer de configuración.
    if (type(amount) is not int or not 0 <= amount <= 9999999999
            or (days is not None and (type(days) is not int or not 1 <= days <= 365))):
        raise ErrorCotizacion('cotizacion', 'La tarifa no está disponible. Contacta a la tienda.', 'TARIFA_NO_DISPONIBLE')
    try:
        if operador == 'Chilexpress':
            quote = procesar_respuesta_chilexpress({'data': {'courierServiceOptions': [{'serviceValue': amount}]}})
        else:
            quote = procesar_respuesta_starken({'valor': amount, 'plazo_entrega': days})
    except (ValueError, TypeError, OverflowError):
        raise ErrorCotizacion('cotizacion', 'No se pudo cotizar el envío. Intenta nuevamente.', 'ERROR_COTIZACION') from None
    return {**quote, 'monto': str(quote['monto']), 'plazo_dias': days,
            'region': region, 'comuna': comuna, 'origen': 'configuracion_tienda'}


def issue_quote(tienda, operador, region, comuna):
    quote = configured_quote(tienda, operador, region, comuna)
    payload = {**quote, 'tienda': tienda.pk, 'vence_en': int(time()) + QUOTE_MAX_AGE}
    return {**quote, 'vence_en': payload['vence_en'],
            'cotizacion': signing.dumps(payload, salt=QUOTE_SALT, compress=True)}


def validate_quote(tienda, operador, address, token):
    vencida = ErrorCotizacion('cotizacion', 'La cotización venció. Vuelve a cotizar el envío.', 'COTIZACION_VENCIDA')
    invalida = ErrorCotizacion('cotizacion', 'La cotización es inválida o venció. Vuelve a cotizar el envío.',
                               'COTIZACION_INVALIDA')
    try:
        signed = signing.loads(token or '', salt=QUOTE_SALT, max_age=QUOTE_MAX_AGE)
    except signing.SignatureExpired:
        raise vencida from None
    except (signing.BadSignature, TypeError, ValueError):
        raise invalida from None
    if not isinstance(signed, dict):
        raise invalida
    if signed.get('vence_en', 0) <= time():
        raise vencida
    current = configured_quote(tienda, operador, address.get('region'), address.get('city'))
    expected = {**current, 'tienda': tienda.pk}
    if any(signed.get(key) != value for key, value in expected.items()):
        raise ErrorCotizacion('cotizacion', 'La cotización cambió. Vuelve a cotizar el envío.', 'COTIZACION_CAMBIO')
    return current