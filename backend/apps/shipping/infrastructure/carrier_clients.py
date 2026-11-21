import logging
import unicodedata
from decimal import Decimal
from typing import Optional

import requests

from apps.shipping.domain.exceptions import (
    DireccionFueraDeCoberturaException,
    NumeroSeguimientoNoEncontradoException,
    ProveedorLogisticoError,
    RespuestaLogisticaInvalidaException,
    TiempoEsperaLogisticoException,
    validar_tiempo_espera,
)

logger = logging.getLogger(__name__)


def _normalizar(texto: str) -> str:
    base = unicodedata.normalize('NFKD', texto or '')
    return ''.join(c for c in base if not unicodedata.combining(c)).strip().upper()


class BaseCarrierClient:
    nombre = 'transportista'
    auth_header = 'Authorization'

    def __init__(self, api_key: str, base_url: str, timeout_segundos: float = 10.0, session=None):
        self.api_key = (api_key or '').strip()
        self.base_url = (base_url or '').strip().rstrip('/')
        self.timeout = validar_tiempo_espera(timeout_segundos)
        self.session = session or requests.Session()

    @property
    def configurado(self) -> bool:
        return bool(self.api_key and self.base_url)

    def _headers(self, api_key: Optional[str] = None) -> dict:
        return {self.auth_header: (api_key or self.api_key), 'Accept': 'application/json'}

    def _request(self, method: str, path: str, *, params=None, json=None, api_key: Optional[str] = None) -> dict:
        if not self.configurado:
            raise ProveedorLogisticoError(f'{self.nombre} no está configurado.')
        url = f'{self.base_url}/{path.lstrip("/")}'
        try:
            response = self.session.request(
                method, url, headers=self._headers(api_key), params=params, json=json, timeout=self.timeout,
            )
        except requests.exceptions.Timeout as exc:
            logger.warning('%s: tiempo de espera agotado (%ss)', self.nombre, self.timeout)
            raise TiempoEsperaLogisticoException(
                f'Se agotó el tiempo de espera al consultar {self.nombre}.') from exc
        except requests.exceptions.RequestException as exc:
            logger.warning('%s: error de conexión (%s)', self.nombre, type(exc).__name__)
            raise ProveedorLogisticoError(f'No se pudo conectar con {self.nombre}.') from exc

        if response.status_code == 404:
            raise NumeroSeguimientoNoEncontradoException(f'{self.nombre}: recurso no encontrado.')
        if response.status_code in (401, 403):
            logger.error('%s: credenciales rechazadas (HTTP %s)', self.nombre, response.status_code)
            raise ProveedorLogisticoError(f'{self.nombre} rechazó las credenciales configuradas.')
        if response.status_code >= 400:
            logger.warning('%s: respuesta HTTP %s', self.nombre, response.status_code)
            raise ProveedorLogisticoError(f'{self.nombre} respondió con error ({response.status_code}).')
        try:
            body = response.json()
        except ValueError as exc:
            raise RespuestaLogisticaInvalidaException(f'{self.nombre} devolvió una respuesta no válida.') from exc
        if not isinstance(body, dict):
            raise RespuestaLogisticaInvalidaException(f'{self.nombre} devolvió una respuesta no válida.')
        return body


CHILEXPRESS_REGION_CODES = {
    'ARICA': 'R15', 'TARAPACA': 'R1', 'ANTOFAGASTA': 'R2', 'ATACAMA': 'R3', 'COQUIMBO': 'R4',
    'VALPARAISO': 'R5', 'METROPOLITANA': 'RM', "O'HIGGINS": 'R6', 'LIBERTADOR': 'R6', 'MAULE': 'R7',
    'NUBLE': 'R16', 'BIOBIO': 'R8', 'ARAUCANIA': 'R9', 'LOS RIOS': 'R14', 'LOS LAGOS': 'R10',
    'AYSEN': 'R11', 'MAGALLANES': 'R12',
}


CHILEXPRESS_HOSTS = {
    'SANDBOX': 'https://testservices.wschilexpress.com',
    'PRODUCCION': 'https://services.wschilexpress.com',
}


class ChilexpressClient(BaseCarrierClient):
    nombre = 'Chilexpress'
    auth_header = 'Ocp-Apim-Subscription-Key'
    RATES_PATH = 'rating/api/v1.0/rates/courier'
    COVERAGE_PATH = 'georeference/api/v1.0/coverage-areas'

    def __init__(self, *, api_keys=None, origin_county_code: str = '', ambiente: str = 'SANDBOX', base_url: str = '',
                 rates_path: str = '', coverage_path: str = '', tracking_path: str = '', api_key: str = '', **kwargs):
        ambiente = (ambiente or 'SANDBOX').upper()
        if ambiente not in CHILEXPRESS_HOSTS:
            raise ValueError('Ambiente de Chilexpress inválido (usa SANDBOX o PRODUCCION).')
        keys = {k: (v or '').strip() for k, v in (api_keys or {}).items()}
        legacy = (api_key or '').strip()
        super().__init__(api_key=legacy or keys.get('cotizador', ''),
                         base_url=base_url or CHILEXPRESS_HOSTS[ambiente], **kwargs)
        self.ambiente = ambiente
        self.api_keys = {'cotizador': keys.get('cotizador') or legacy, 'coberturas': keys.get('coberturas') or legacy,
                         'envios': keys.get('envios') or legacy}
        self.origin_county_code = (origin_county_code or '').strip()
        self.rates_path = rates_path or self.RATES_PATH
        self.coverage_path = coverage_path or self.COVERAGE_PATH
        self.tracking_path = tracking_path
        self._counties = {}

    @property
    def configurado(self) -> bool:
        return bool(self.base_url and self.api_keys['cotizador'] and self.api_keys['coberturas']
                    and self.origin_county_code)

    @staticmethod
    def region_code(region: str) -> Optional[str]:
        norm = _normalizar(region)
        for key, code in CHILEXPRESS_REGION_CODES.items():
            if _normalizar(key) in norm:
                return code
        return None

    def county_code(self, region: str, comuna: str) -> str:
        code = self.region_code(region)
        if not code:
            raise DireccionFueraDeCoberturaException('Región sin cobertura en Chilexpress.')
        if code not in self._counties:
            body = self._request('GET', self.coverage_path, params={'RegionCode': code, 'type': 0},
                                 api_key=self.api_keys['coberturas'])
            areas = (body.get('data') or {}).get('coverageAreas')
            if not isinstance(areas, list):
                raise RespuestaLogisticaInvalidaException('Chilexpress devolvió una cobertura inválida.')
            self._counties[code] = {
                _normalizar(a.get('countyName')): a.get('countyCode') for a in areas
                if isinstance(a, dict) and a.get('countyCode')
            }
        found = self._counties[code].get(_normalizar(comuna))
        if not found:
            raise DireccionFueraDeCoberturaException('Chilexpress no cubre la comuna indicada.')
        return found

    def cotizar(self, region: str, comuna: str, *, peso_kg, alto_cm, ancho_cm, largo_cm, valor_declarado) -> dict:
        payload = {
            'originCountyCode': self.origin_county_code,
            'destinationCountyCode': self.county_code(region, comuna),
            'package': {'weight': float(peso_kg), 'height': float(alto_cm),
                        'width': float(ancho_cm), 'length': float(largo_cm)},
            'productType': 3, 'contentType': 1, 'declaredWorth': int(Decimal(str(valor_declarado))),
            'deliveryTime': 0,
        }
        return self._request('POST', self.rates_path, json=payload, api_key=self.api_keys['cotizador'])

    def seguimiento(self, numero: str, rut: str = '') -> dict:
        if not self.tracking_path or not self.api_keys['envios']:
            raise ProveedorLogisticoError('El seguimiento de Chilexpress no está configurado.')
        return self._request('POST', self.tracking_path, json={'reference': numero, 'rut': rut},
                             api_key=self.api_keys['envios'])


class StarkenClient(BaseCarrierClient):
    nombre = 'Starken'

    def __init__(self, *, origin_city: str = '', quote_path='quote', tracking_path='tracking/{numero}', **kwargs):
        super().__init__(**kwargs)
        self.origin_city = (origin_city or '').strip()
        self.quote_path, self.tracking_path = quote_path, tracking_path

    @property
    def configurado(self) -> bool:
        return super().configurado and bool(self.origin_city)

    def _headers(self, api_key: Optional[str] = None) -> dict:
        return {'Authorization': f'Bearer {api_key or self.api_key}', 'Accept': 'application/json'}

    def cotizar(self, region: str, comuna: str, *, peso_kg, alto_cm, ancho_cm, largo_cm, valor_declarado) -> dict:
        payload = {
            'origen': self.origin_city, 'destino': {'region': region, 'comuna': comuna},
            'peso_kg': float(peso_kg), 'alto_cm': float(alto_cm), 'ancho_cm': float(ancho_cm),
            'largo_cm': float(largo_cm), 'valor_declarado': int(Decimal(str(valor_declarado))),
        }
        return self._request('POST', self.quote_path, json=payload)

    def seguimiento(self, numero: str) -> dict:
        return self._request('GET', self.tracking_path.format(numero=numero))
