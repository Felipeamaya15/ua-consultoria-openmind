from decimal import Decimal
from typing import Optional

from django.conf import settings

from apps.catalog.infrastructure.adapters.chilexpress_response import procesar_respuesta_chilexpress
from apps.shipping.infrastructure.carrier_clients import ChilexpressClient


def _cfg(name, default=''):
    return getattr(settings, name, default)


def simulated_allowed() -> bool:
    return bool(_cfg('SHIPPING_ALLOW_SIMULATED', True))


def _chilexpress_client_for_store(tienda, common):
    from apps.core.delivery import carrier_credentials, delivery_raw
    datos = delivery_raw(tienda)
    credentials = carrier_credentials(datos, 'chilexpress')
    if not (credentials.get('cotizador') and credentials.get('coberturas') and credentials.get('origen')):
        return None
    stored = datos.get('chilexpress') if isinstance(datos.get('chilexpress'), dict) else {}
    return ChilexpressClient(
        api_keys={k: credentials.get(k, '') for k in ('cotizador', 'coberturas', 'envios')},
        origin_county_code=credentials['origen'], ambiente=stored.get('ambiente') or 'SANDBOX',
        tracking_path=_cfg('CHILEXPRESS_TRACKING_PATH'), **common)


def get_client(operador: str, tienda=None):
    if operador != 'Chilexpress' or tienda is None:
        return None
    common = {'timeout_segundos': float(_cfg('SHIPPING_HTTP_TIMEOUT', 10))}
    return _chilexpress_client_for_store(tienda, common)


def live_quote(operador: str, region: str, comuna: str, tienda=None) -> Optional[dict]:
    client = get_client(operador, tienda)
    if client is None:
        return None
    package = {
        'peso_kg': Decimal(str(_cfg('SHIPPING_DEFAULT_WEIGHT_KG', '1'))),
        'alto_cm': Decimal('15'), 'ancho_cm': Decimal('20'), 'largo_cm': Decimal('30'),
        'valor_declarado': Decimal(str(_cfg('SHIPPING_DEFAULT_DECLARED_VALUE', '20000'))),
    }
    raw = client.cotizar(region, comuna, **package)
    try:
        return procesar_respuesta_chilexpress(raw)
    except ValueError as exc:
        from apps.shipping.domain.exceptions import RespuestaLogisticaInvalidaException
        raise RespuestaLogisticaInvalidaException(str(exc)) from exc
