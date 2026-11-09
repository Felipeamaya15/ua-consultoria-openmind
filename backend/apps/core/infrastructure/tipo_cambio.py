"""Tipo de cambio CLP -> USD para cobrar con PayPal (SCRUM-509).

PayPal no admite pesos chilenos de forma estandar, asi que el pedido (en CLP) se cobra en su
equivalente en USD. El valor sale del dolar observado, se refresca solo y nunca se usa si esta
desactualizado.

Banco Central de Chile (API SIETE), solo si hay BCCH_USUARIO y BCCH_CLAVE configurados.


Todo es configurable por entorno (ver settings.py): margen, vigencia maxima y frecuencia de refresco.
"""
import json
import logging
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone as dt_timezone
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

CACHE_KEY = 'paypal_fx:dolar_observado'
SERIE_BCCH = 'F073.TCO.PRE.Z.D'  
URL_BCCH = 'https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx'
URL_MINDICADOR = 'https://mindicador.cl/api/dolar'
TIMEOUT = 8


@dataclass(frozen=True)
class TipoCambio:
    observado: Decimal      
    fecha_dato: date       
    fuente: str
    margen_pct: Decimal     

    @property
    def aplicado(self):
        return (self.observado * (Decimal('1') + self.margen_pct / Decimal('100'))).quantize(
            Decimal('0.0001'), ROUND_HALF_UP)

    def clp_a_usd(self, monto_clp):
        usd = (Decimal(monto_clp) / self.aplicado).quantize(Decimal('0.01'), ROUND_HALF_UP)
        return max(Decimal('0.01'), usd)


def _decimal_positivo(valor):
    try:
        numero = Decimal(str(valor).replace(',', '.'))
    except (InvalidOperation, ValueError):
        return None
    return numero if numero.is_finite() and numero > 0 else None


def margen_pct():
    try:
        margen = Decimal(str(getattr(settings, 'PAYPAL_FX_MARGEN_PCT', '2')).replace(',', '.'))
    except (InvalidOperation, ValueError):
        return Decimal('2')
    return margen if margen.is_finite() and Decimal('0') <= margen <= Decimal('20') else Decimal('2')


def _leer_json(url):
    request = urllib.request.Request(url, headers={'Accept': 'application/json', 'User-Agent': 'openmind-ecommerce'})
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:  # noqa: S310 (URL fija de la fuente)
        return json.loads(response.read().decode('utf-8'))


def _desde_bcch():
    usuario = (getattr(settings, 'BCCH_USUARIO', '') or '').strip()
    clave = (getattr(settings, 'BCCH_CLAVE', '') or '').strip()
    if not usuario or not clave:
        return None
    hoy = date.today()
    query = urllib.parse.urlencode({
        'user': usuario, 'pass': clave, 'timeseries': SERIE_BCCH,
        'firstdate': (hoy - timedelta(days=10)).isoformat(), 'lastdate': hoy.isoformat(),
    })
    datos = _leer_json(f'{URL_BCCH}?{query}')
    observaciones = [o for o in (datos.get('Series') or {}).get('Obs', []) if _decimal_positivo(o.get('value'))]
    if not observaciones:
        return None
    ultima = observaciones[-1]
    fecha = datetime.strptime(ultima['indexDateString'], '%d-%m-%Y').date()
    return _decimal_positivo(ultima['value']), fecha, 'Banco Central de Chile'


def _desde_mindicador():
    serie = _leer_json(URL_MINDICADOR).get('serie') or []
    for punto in serie:  # viene ordenada de la mas reciente a la mas antigua
        valor = _decimal_positivo(punto.get('valor'))
        if valor:
            return valor, datetime.fromisoformat(str(punto['fecha']).replace('Z', '+00:00')).date(), 'mindicador.cl'
    return None


def _descargar():
    """Primera fuente que responde con un dato valido; None si ninguna lo hace."""
    for fuente in (_desde_bcch, _desde_mindicador):
        try:
            encontrado = fuente()
        except Exception:
            logger.warning('Fuente de tipo de cambio %s no disponible.', getattr(fuente, '__name__', repr(fuente)), exc_info=True)
            continue
        if encontrado:
            return encontrado
    return None


def _ahora():
    return datetime.now(dt_timezone.utc)


def tipo_cambio_vigente():
    """TipoCambio listo para cobrar, o None si no hay un dato reciente y confiable."""
    refresco = timedelta(hours=float(getattr(settings, 'PAYPAL_FX_REFRESCO_HORAS', 6)))
    vigencia = timedelta(hours=float(getattr(settings, 'PAYPAL_FX_MAX_EDAD_HORAS', 96)))
    ahora = _ahora()

    guardado = cache.get(CACHE_KEY)
    if not guardado or ahora - datetime.fromisoformat(guardado['obtenido']) >= refresco:
        nuevo = _descargar()
        if nuevo:
            guardado = {'observado': str(nuevo[0]), 'fecha_dato': nuevo[1].isoformat(), 'fuente': nuevo[2],
                        'obtenido': ahora.isoformat()}
            cache.set(CACHE_KEY, guardado, 7 * 24 * 3600)
    if not guardado:
        return None

    fecha_dato = date.fromisoformat(guardado['fecha_dato'])
    inicio_del_dia = datetime(fecha_dato.year, fecha_dato.month, fecha_dato.day, tzinfo=dt_timezone.utc)
    if ahora - inicio_del_dia > vigencia:
        logger.error('Tipo de cambio desactualizado (dato del %s): PayPal queda oculto.', fecha_dato)
        return None
    return TipoCambio(Decimal(guardado['observado']), fecha_dato, guardado['fuente'], margen_pct())
