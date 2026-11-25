import logging
import unicodedata
from decimal import Decimal
from typing import Optional

import requests
from django.core.cache import cache

from apps.shipping.domain.exceptions import (
    DireccionFueraDeCoberturaException,
    NumeroSeguimientoNoEncontradoException,
    ProveedorLogisticoError,
    RespuestaLogisticaInvalidaException,
    SectorInvalidoException,
    SectorSinRepartoException,
    TiempoEsperaLogisticoException,
    validar_tiempo_espera,
)

logger = logging.getLogger(__name__)


def _normalizar(texto: str) -> str:
    base = unicodedata.normalize('NFKD', texto or '')
    return ''.join(c for c in base if not unicodedata.combining(c)).strip().upper()


def _clave_comuna(texto: str) -> str:
    return ''.join(c for c in _normalizar(texto) if c.isalnum())


COBERTURAS_CACHE_SEGUNDOS = 24 * 60 * 60


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

    def _puede_solicitar(self, api_key: Optional[str] = None) -> bool:
        return self.configurado

    def _headers(self, api_key: Optional[str] = None) -> dict:
        return {self.auth_header: (api_key or self.api_key), 'Accept': 'application/json',
                'Content-Type': 'application/json'}

    def _request(self, method: str, path: str, *, params=None, json=None, api_key: Optional[str] = None) -> dict:
        if not self._puede_solicitar(api_key):
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
    BUSINESS_RATES_PATH = 'rating/api/v1.0/rates/business'
    COVERAGE_PATH = 'georeference/api/v1.0/coverage-areas'
    ORDERS_PATH = 'transport-orders/api/v1.0/transport-orders'
    TRACKING_PATH = 'transport-orders/api/v1.0/tracking'

    def __init__(self, *, api_keys=None, origin_county_code: str = '', ambiente: str = 'SANDBOX', base_url: str = '',
                 rates_path: str = '', coverage_path: str = '', tracking_path: str = '', orders_path: str = '',
                 tcc: str = '', rut: str = '', api_key: str = '', **kwargs):
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
        self.orders_path = orders_path or self.ORDERS_PATH
        self.tracking_path = tracking_path or self.TRACKING_PATH
        self.tcc = (tcc or '').strip()
        self.rut = ''.join(c for c in (rut or '') if c.isdigit())

    @property
    def configurado(self) -> bool:
        return bool(self.base_url and self.api_keys['cotizador'] and self.api_keys['coberturas']
                    and self.origin_county_code)

    def _puede_solicitar(self, api_key: Optional[str] = None) -> bool:
        return bool(self.base_url and (api_key or self.api_key))

    @staticmethod
    def region_code(region: str) -> Optional[str]:
        norm = _normalizar(region)
        if norm in set(CHILEXPRESS_REGION_CODES.values()):
            return norm
        for key, code in CHILEXPRESS_REGION_CODES.items():
            if _normalizar(key) in norm:
                return code
        return None

    def coberturas(self, region: str) -> list:
        code = self.region_code(region)
        if not code:
            raise DireccionFueraDeCoberturaException('Región sin cobertura en Chilexpress.')
        cache_key = f'chilexpress:coberturas:v2:{self.ambiente}:{code}'
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
        body = self._request('GET', self.coverage_path, params={'RegionCode': code, 'type': 0},
                             api_key=self.api_keys['coberturas'])
        data = body.get('data')
        areas = body.get('coverageAreas')
        if not isinstance(areas, list) and isinstance(data, dict):
            areas = data.get('coverageAreas')
        if not isinstance(areas, list):
            logger.warning('Chilexpress: la respuesta de coberturas no trae coverageAreas.')
            raise RespuestaLogisticaInvalidaException('Chilexpress devolvió una cobertura inválida.')
        result = [
            {'codigo': area['countyCode'], 'comuna': str(area.get('countyName') or '').strip(),
             'cobertura': str(area.get('coverageName') or area.get('countyName') or '').strip(),
             'modo': area.get('queryMode'), 'region': code, 'reparto': area.get('ind_rd') == 1}
            for area in areas if isinstance(area, dict) and area.get('countyCode')
        ]
        if result:
            cache.set(cache_key, result, COBERTURAS_CACHE_SEGUNDOS)
        return result

    def sector_code(self, region: str, comuna: str, sector: str) -> str:
        principal = self.county_code(region, comuna)
        areas = self.coberturas(region)
        base = next((a for a in areas if a['codigo'] == principal), None)
        wanted = (sector or '').strip().upper()
        elegido = next((a for a in areas if base and a['comuna'] == base['comuna'] and a['modo'] != 1
                        and a['codigo'].upper() == wanted), None)
        if elegido is None:
            raise SectorInvalidoException('El sector elegido no pertenece a la comuna de destino.')
        if not elegido['reparto']:
            raise SectorSinRepartoException('Chilexpress no reparte a domicilio en el sector elegido.')
        return elegido['codigo']

    def county_code(self, region: str, comuna: str, sector: str = '') -> str:
        if sector:
            return self.sector_code(region, comuna, sector)
        areas = self.coberturas(region)
        index = {}
        rango = {}
        for area in areas:
            peso = 0 if area['modo'] == 1 else 1
            for key in (_clave_comuna(area['comuna']), _clave_comuna(area['cobertura'])):
                if key and (key not in index or peso < rango[key]):
                    index[key] = area['codigo']
                    rango[key] = peso
        for area in areas:
            index.setdefault(_clave_comuna(area['codigo']), area['codigo'])
        clave = _clave_comuna(comuna)
        found = index.get(clave)
        if not found and clave:
            candidatos = {v for k, v in index.items() if k.startswith(clave)}
            if len(candidatos) == 1:
                found = candidatos.pop()
        if not found:
            raise DireccionFueraDeCoberturaException('Chilexpress no cubre la comuna indicada.')
        return found

    def cotizar(self, region: str, comuna: str, *, peso_kg, alto_cm, ancho_cm, largo_cm, valor_declarado,
                sector: str = '') -> dict:
        payload = {
            'originCountyCode': self.origin_county_code,
            'destinationCountyCode': self.county_code(region, comuna, sector),
            'package': {'weight': float(peso_kg), 'height': float(alto_cm),
                        'width': float(ancho_cm), 'length': float(largo_cm)},
            'productType': 3, 'contentType': 1, 'declaredWorth': int(Decimal(str(valor_declarado))),
            'deliveryTime': 0,
        }
        if self.tcc:
            from apps.catalog.infrastructure.adapters.chilexpress_response import procesar_respuesta_chilexpress
            try:
                body = self._request('POST', self.BUSINESS_RATES_PATH,
                                     json={**payload, 'customerCardNumber': self.tcc},
                                     api_key=self.api_keys['cotizador'])
                procesar_respuesta_chilexpress(body)
                return body
            except (ProveedorLogisticoError, ValueError) as exc:
                logger.warning('Chilexpress: cotización con TCC falló (%s); se usa la tarifa normal.', type(exc).__name__)
        return self._request('POST', self.rates_path, json=payload, api_key=self.api_keys['cotizador'])

    @staticmethod
    def _verificar_estado(body: dict) -> dict:
        status_code = body.get('statusCode')
        if status_code not in (0, '0'):
            detalle = body.get('statusDescription') or ''
            errores = body.get('errors')
            if isinstance(errores, list) and errores:
                detalle = '; '.join(str(e.get('message', e)) if isinstance(e, dict) else str(e) for e in errores[:3])
            detalles = (body.get('data') or {}).get('detail') if isinstance(body.get('data'), dict) else None
            if isinstance(detalles, list):
                motivos = [str(d.get('statusDescription')) for d in detalles if isinstance(d, dict)
                           and d.get('statusCode') not in (0, '0', None) and d.get('statusDescription')]
                if motivos:
                    detalle = '; '.join(motivos[:3])
            logger.warning('Chilexpress: statusCode=%s (%s)', status_code, str(detalle)[:300])
            raise ProveedorLogisticoError(f'Chilexpress rechazó la solicitud: {str(detalle)[:300] or "sin detalle"}.')
        return body

    def crear_orden_transporte(self, *, referencia: str, destino: dict, remitente: dict, origen: dict,
                               paquete: dict, tipo_etiqueta: int = 2) -> dict:
        if not (self.api_keys['envios'] and self.tcc and self.rut and self.origin_county_code):
            raise ProveedorLogisticoError('Faltan credenciales de Chilexpress (clave Envíos, TCC, RUT o comuna de origen).')
        destino_code = self.county_code(destino['region'], destino['comuna'], destino.get('sector') or '')
        contacto = destino.get('contacto') or {}

        def direccion(tipo, code, datos):
            return {
                'addressId': 0, 'countyCoverageCode': code, 'streetName': datos.get('calle', ''),
                'streetNumber': str(datos.get('numero', '')), 'supplement': datos.get('complemento', '') or '',
                'addressType': tipo, 'deliveryOnCommercialOffice': False, 'observation': datos.get('observacion', '') or 'DEFAULT',
            }

        payload = {
            'header': {
                'certificateNumber': 0, 'customerCardNumber': self.tcc,
                'countyOfOriginCoverageCode': self.origin_county_code, 'labelType': tipo_etiqueta,
                'marketplaceRut': self.rut, 'sellerRut': 'DEFAULT',
            },
            'details': [{
                'addresses': [direccion('DEST', destino_code, destino),
                              direccion('DEV', self.origin_county_code, origen)],
                'contacts': [
                    {'name': remitente.get('nombre', ''), 'phoneNumber': remitente.get('telefono', ''),
                     'mail': remitente.get('correo', ''), 'contactType': 'R'},
                    {'name': contacto.get('nombre', ''), 'phoneNumber': contacto.get('telefono', ''),
                     'mail': contacto.get('correo', ''), 'contactType': 'D'},
                ],
                'packages': [{
                    'weight': format(Decimal(str(paquete['peso_kg'])), 'f'), 'height': str(paquete['alto_cm']),
                    'width': str(paquete['ancho_cm']), 'length': str(paquete['largo_cm']),
                    'serviceDeliveryCode': str(paquete.get('servicio', '3')), 'productCode': '3',
                    'deliveryReference': referencia, 'groupReference': '',
                    'declaredValue': str(int(Decimal(str(paquete['valor_declarado'])))),
                    'declaredContent': '5', 'receivableAmountInDelivery': 0,
                }],
            }],
        }
        body = self._request('POST', self.orders_path, json=payload, api_key=self.api_keys['envios'])
        return self._verificar_estado(body)

    def seguimiento(self, numero_ot, referencia: str = '', mostrar_eventos: int = 1) -> dict:
        if not self.api_keys['envios'] or not self.rut:
            raise ProveedorLogisticoError('El seguimiento de Chilexpress no está configurado (clave Envíos y RUT).')
        digitos = ''.join(c for c in str(numero_ot) if c.isdigit())
        if not digitos:
            raise ProveedorLogisticoError('Número de orden de transporte inválido.')
        payload = {'reference': referencia, 'transportOrderNumber': int(digitos), 'rut': int(self.rut),
                   'showTrackingEvents': 1 if mostrar_eventos else 0}
        body = self._request('POST', self.tracking_path, json=payload, api_key=self.api_keys['envios'])
        return self._verificar_estado(body)


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
