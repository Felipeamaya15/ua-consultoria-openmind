import logging
import json
import unicodedata
from pathlib import Path
from time import time

from django.core import signing
from rest_framework.exceptions import ValidationError

from apps.catalog.infrastructure.adapters.chilexpress_response import procesar_respuesta_chilexpress
from apps.catalog.infrastructure.adapters.starken_response import procesar_respuesta_starken
from apps.core.delivery import DELIVERY_METHODS, delivery_for_store
from apps.shipping.domain.exceptions import (
    DireccionFueraDeCoberturaException, LogisticaException, SectorInvalidoException, SectorSinRepartoException,
    TiempoEsperaLogisticoException,
)
from apps.core.peso_envio import (
    MENSAJE_A_COORDINAR, CarritoInvalido, CarritoRequerido, EnvioACoordinar, calcular_carrito, mismo_peso, mismo_volumen,
)
from apps.shipping.infrastructure.live import live_quote

logger = logging.getLogger(__name__)


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


COMUNA_ALIASES = {'SANTIAGOCENTRO': 'SANTIAGO', 'AISEN': 'AYSEN', 'LACALERA': 'CALERA', 'LLAYLLAY': 'LLAILLAY'}


def _clave_comuna(texto):
    base = unicodedata.normalize('NFKD', texto if isinstance(texto, str) else '')
    return ''.join(c for c in base if c.isalnum() and not unicodedata.combining(c)).upper()


def validate_destination(region, comuna):
    official = canonical_region(region)
    wanted = _clave_comuna(comuna)
    wanted = COMUNA_ALIASES.get(wanted, wanted)
    for entry in TERRITORY:
        if entry['nombre'] == official and wanted and any(
                _clave_comuna(nombre) == wanted for p in entry['provincias'] for nombre in p['comunas']):
            return official
    raise ValidationError({'comuna': 'Selecciona una comuna de la región elegida.'})


CAMPOS_INTERNOS = ('monto_base', 'margen')


def configured_quote(tienda, operador, region, comuna, items=None, repository=None, sector=''):
    try:
        region = validate_destination(region, comuna)
    except ValidationError:
        raise ErrorCotizacion('comuna', 'Selecciona una comuna de la región elegida.', 'DESTINO_INVALIDO') from None
    method = DELIVERY_METHODS.get(operador)
    if method not in ('chilexpress', 'starken'):
        raise ErrorCotizacion('operador', 'Selecciona Chilexpress o Starken. Retiro no requiere cotización.',
                              'OPERADOR_INVALIDO')
    sector = (sector or '').strip() if operador == 'Chilexpress' else ''
    carrier = delivery_for_store(tienda)[method]
    if not carrier['enabled']:
        raise ErrorCotizacion('operador', 'El transportista no está habilitado en esta tienda.',
                              'TRANSPORTISTA_NO_HABILITADO')
    live_error = None
    try:
        live = live_quote(operador, region, comuna, tienda, items=items, repository=repository, exigir_carrito=True,
                          sector=sector)
    except CarritoRequerido as exc:
        raise ErrorCotizacion('items', str(exc), 'CARRITO_REQUERIDO') from None
    except CarritoInvalido as exc:
        raise ErrorCotizacion('items', str(exc), 'CARRITO_INVALIDO') from None
    except EnvioACoordinar as exc:
        raise ErrorCotizacion('cotizacion', str(exc) or MENSAJE_A_COORDINAR, 'ENVIO_A_COORDINAR') from None
    except SectorSinRepartoException:
        raise ErrorCotizacion('sector', 'Chilexpress no reparte a domicilio en ese sector. Elige otra opción de entrega.',
                              'SECTOR_SIN_REPARTO') from None
    except SectorInvalidoException:
        raise ErrorCotizacion('sector', 'Selecciona un sector válido para la comuna elegida.',
                              'SECTOR_INVALIDO') from None
    except DireccionFueraDeCoberturaException:
        live = None
    except LogisticaException as exc:
        live, live_error = None, exc
        logger.warning('Cotizacion en vivo fallida (%s, tienda=%s): %s', operador, tienda.pk, type(exc).__name__)
    if live is not None:
        return {**live, 'monto': str(live['monto']), 'region': region, 'comuna': comuna, 'sector': sector,
                'origen': 'api_transportista'}
    rates = [rate for rate in carrier['tarifas'] if isinstance(rate, dict)
             and canonical_region(rate.get('region')) == region and rate.get('comuna') == comuna]
    if len(rates) != 1:
        if live_error is not None:
            mensaje = ('El transportista tardó demasiado en responder. Intenta nuevamente.'
                       if isinstance(live_error, TiempoEsperaLogisticoException)
                       else 'No pudimos obtener la tarifa de envío en este momento. Intenta nuevamente.')
            raise ErrorCotizacion('cotizacion', mensaje, 'ERROR_COTIZACION')
        raise ErrorCotizacion('cotizacion', 'No hay una tarifa disponible para este destino. Contacta a la tienda.',
                              'TARIFA_NO_DISPONIBLE')
    rate = rates[0]
    amount, days = rate.get('monto'), rate.get('plazo_dias')
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
            'region': region, 'comuna': comuna, 'sector': sector, 'origen': 'configuracion_tienda'}


def issue_quote(tienda, operador, region, comuna, items=None, repository=None, sector=''):
    quote = configured_quote(tienda, operador, region, comuna, items, repository, sector)
    payload = {**quote, 'tienda': tienda.pk, 'vence_en': int(time()) + QUOTE_MAX_AGE}
    visible = {key: value for key, value in quote.items() if key not in CAMPOS_INTERNOS}
    return {**visible, 'vence_en': payload['vence_en'],
            'cotizacion': signing.dumps(payload, salt=QUOTE_SALT, compress=True)}


def validate_quote(tienda, operador, address, token, items=None, repository=None):
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
    if signed.get('peso_kg') is not None:
        cambio = ErrorCotizacion('cotizacion', 'Tu carrito cambió desde que cotizaste el envío. Vuelve a cotizar.',
                                 'COTIZACION_INVALIDA')
        try:
            actual = calcular_carrito(tienda, items or [], repository=repository)
        except CarritoInvalido:
            raise cambio from None
        if not mismo_peso(signed.get('peso_kg'), actual.peso_kg):
            raise cambio
        if signed.get('volumen_cm3') is not None and not mismo_volumen(signed.get('volumen_cm3'), actual.volumen_cm3):
            raise cambio
    current = configured_quote(tienda, operador, address.get('region'), address.get('city'), items, repository,
                               address.get('sector') or '')
    expected = {**current, 'tienda': tienda.pk}
    if any(signed.get(key) != value for key, value in expected.items()):
        raise ErrorCotizacion('cotizacion', 'La cotización cambió. Vuelve a cotizar el envío.', 'COTIZACION_CAMBIO')
    return current