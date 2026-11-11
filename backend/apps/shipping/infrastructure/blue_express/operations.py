"""Contratos BX-Emission (PDF), BX-Label y BX-Tracking Pull."""
import base64
import binascii
import json
import re
from uuid import uuid4
from decimal import Decimal, InvalidOperation
from urllib.parse import urlsplit

import requests
from django.conf import settings
from .config import get_service_config, BlueExpressConfigurationError
from .client import BlueExpressAPIError

MAX_RESPONSE = 10 * 1024 * 1024


def tracking_number(value):
    if isinstance(value, bool) or not isinstance(value, (str, int)) or not re.fullmatch(r'[0-9]{1,30}', str(value)):
        raise BlueExpressAPIError('Blue devolvió un número de seguimiento inválido.')
    return str(value)


def pdf_content(value):
    if not isinstance(value, str) or len(value) > MAX_RESPONSE:
        raise BlueExpressAPIError('La etiqueta excede el tamaño admitido o es inválida.')
    try:
        content = base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error):
        raise BlueExpressAPIError('La etiqueta no es base64 válido.') from None
    if not content.startswith(b'%PDF-'):
        raise BlueExpressAPIError('La etiqueta recibida no es PDF.')
    return content


def parse_emission(data):
    if not isinstance(data, dict) or data.get('status') is not True or not isinstance(data.get('data'), dict):
        raise BlueExpressAPIError('Respuesta de emisión inválida.')
    body = data['data']
    tracking = tracking_number(body.get('trackingNumber'))
    return tracking


def parse_labels(data, emission=False):
    body = data.get('data') if isinstance(data, dict) and data.get('status') is True else None
    rows = body.get('labels') if emission and isinstance(body, dict) else body
    if not isinstance(rows, list) or not 1 <= len(rows) <= 100:
        raise BlueExpressAPIError('Blue no devolvió etiquetas válidas.')
    labels = []
    for row in rows:
        value = row.get('contenido' if emission else 'base64') if isinstance(row, dict) else None
        pdf_content(value)
        labels.append(value)
    return labels


def parse_tracking(data, expected):
    body = data.get('data') if isinstance(data, dict) and data.get('status') is True else None
    if not isinstance(body, dict) or tracking_number(body.get('nroOS')) != expected:
        raise BlueExpressAPIError('El seguimiento no corresponde al despacho solicitado.')
    rows = body.get('pinchazos')
    if not isinstance(rows, list) or len(rows) > 2000:
        raise BlueExpressAPIError('El historial recibido es inválido.')
    events = []
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get('tipoMovimiento'), dict):
            raise BlueExpressAPIError('Movimiento de seguimiento inválido.')
        movement = row['tipoMovimiento']
        if not isinstance(row.get('fechaHora'), str) or not isinstance(movement.get('descripcion'), str):
            raise BlueExpressAPIError('Movimiento de seguimiento incompleto.')
        events.append({'fecha_hora': row['fechaHora'], 'codigo': str(movement.get('codigo') or '')[:40],
                       'descripcion': movement['descripcion'][:300]})
    state = body.get('macroEstadoActual')
    if state is not None and not isinstance(state, (str, int)):
        raise BlueExpressAPIError('Estado de seguimiento inesperado.')
    # No se publican dirección, cuenta corriente ni datos de contacto del proveedor.
    return {'numero_seguimiento': expected, 'estado': str(state) if state is not None else 'Sin estado informado',
            'eventos': events, 'fecha_entrega': body.get('fechaEntrega') if isinstance(body.get('fechaEntrega'), str) else None}


def physical_packages(rows):
    if not isinstance(rows, list) or not 1 <= len(rows) <= 100:
        raise ValueError('Declara entre 1 y 100 bultos físicos.')
    result = []
    for row in rows:
        if not isinstance(row, dict) or set(row) != {'weight', 'length', 'width', 'height'}:
            raise ValueError('Cada bulto requiere peso, largo, ancho y alto.')
        item = {'weightUnit': 'KG', 'lengthUnit': 'CM', 'quantity': 1}
        for key in ('weight', 'length', 'width', 'height'):
            try:
                if isinstance(row[key], bool):
                    raise ValueError
                number = Decimal(str(row[key]))
                if not number.is_finite() or not Decimal('0.001') <= number <= Decimal('1000000'):
                    raise ValueError
            except (ValueError, InvalidOperation):
                raise ValueError('Las medidas deben ser positivas y finitas, en kg y cm.') from None
            item[key] = float(number)
        result.append(item)
    return result


def text_field(value, label, limit):
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit:
        raise ValueError(f'{label}: completa un valor de hasta {limit} caracteres.')
    return value.strip()


def build_emission(order, origin, packages, username):
    delivery = order.entrega or {}
    quote, address = delivery.get('cotizacion', {}), delivery.get('direccion', {})
    codes = quote.get('destino_blue', {})
    if type(codes.get('region_code')) is not int or codes['region_code'] <= 0 or not re.fullmatch(r'[A-Za-z0-9]{1,3}', str(codes.get('district_code', ''))):
        raise ValueError('El pedido no conserva un destino Blue válido.')
    if type(origin.region_code) is not int or origin.region_code <= 0 or not re.fullmatch(r'[A-Za-z0-9]{1,3}', origin.district_code):
        raise ValueError('Configura códigos Blue válidos para el origen.')
    contact = order.contacto or {}
    street = ' '.join(str(address.get(key) or '').strip() for key in ('street', 'number', 'apt')).strip()
    name = text_field(order.nombre_contacto or contact.get('nombre'), 'Nombre destinatario', 50)
    phone = text_field(order.telefono_contacto or contact.get('telefono'), 'Teléfono destinatario', 20)
    return {'printFormatCode': 4, 'orderNumber': 'BX' + uuid4().hex[:18], 'references': [f'pedido-{order.pk}'],
            'serviceType': 'EX', 'productType': 'P', 'productCategory': 'PAQU', 'currency': 'CLP',
            'shipmentCost': 0, 'extendedClaim': False, 'companyId': 2000,
            'userName': text_field(username, 'Usuario Blue', 10),
            'pickup': {'location': {'stateId': origin.region_code, 'districtId': origin.district_code,
                'address': text_field(origin.direccion, 'Dirección remitente', 80),
                'name': text_field(origin.nombre_remitente, 'Nombre remitente', 50)},
                'contact': {'fullname': origin.nombre_remitente.strip(), 'phone': text_field(origin.telefono, 'Teléfono remitente', 20)}},
            'dropoff': {'location': {'stateId': codes['region_code'], 'districtId': codes['district_code'],
                'address': text_field(street, 'Dirección destinatario', 80), 'name': name},
                'contact': {'fullname': name, 'phone': phone}},
            'packages': physical_packages(packages), 'extras': None}


class BlueOperationsClient:
    def request(self, service, *, payload=None, tracking=None):
        config = get_service_config(service)
        if service not in {'emission', 'label', 'tracking'}:
            raise BlueExpressConfigurationError('Operación desconocida.')
        if service == 'emission' and not getattr(settings, 'BLUE_EXPRESS_EMISSION_ENABLED', False):
            raise BlueExpressConfigurationError('La emisión Blue está deshabilitada.')
        parsed = urlsplit(config['url'])
        allowed = {'qa': {'qa-bx-tracking.bluex.cl', 'qaapigw.bluex.cl'},
                   'production': {'bx-tracking.bluex.cl', 'apigw.bluex.cl'}}
        if parsed.hostname not in allowed[config['environment']]:
            raise BlueExpressConfigurationError('La URL no corresponde al ambiente Blue configurado.')
        url = config['url'].rstrip('/')
        expected = {'emission':'/bx-emission/v1', 'label':'/bx-label/v1', 'tracking':'/bx-tracking/v1/tracking-pull'}[service]
        if parsed.path.rstrip('/') != expected or parsed.query:
            raise BlueExpressConfigurationError('Configura la URL base del servicio Blue, sin número de seguimiento.')
        if service != 'emission':
            url += '/' + tracking_number(tracking)
        headers = {'BX-TOKEN': config['token'], 'BX-USERCODE': config['usercode'],
                   ('BX-CLIENT-ACCOUNT' if service == 'tracking' else 'BX-CLIENT_ACCOUNT'): config['client_account'],
                   'Accept': 'application/json'}
        try:
            with requests.request('POST' if service == 'emission' else 'GET', url, headers=headers,
                                  json=payload, timeout=config['timeout'], allow_redirects=False, stream=True) as response:
                if not 200 <= response.status_code < 300:
                    raise BlueExpressAPIError('Blue no confirmó la operación solicitada.')
                chunks, size = [], 0
                for chunk in response.iter_content(65536):
                    size += len(chunk)
                    if size > MAX_RESPONSE:
                        raise BlueExpressAPIError('La respuesta de Blue excede el límite admitido.')
                    chunks.append(chunk)
                data = json.loads(b''.join(chunks))
                if not isinstance(data, dict) or data.get('status') is not True:
                    raise BlueExpressAPIError('Blue no confirmó la operación solicitada.')
                return data
        except (requests.RequestException, ValueError):
            raise BlueExpressAPIError('No fue posible confirmar la respuesta de Blue.') from None
