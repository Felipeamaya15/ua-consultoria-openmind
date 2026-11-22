import base64
import binascii


def _dict(valor, mensaje):
    if not isinstance(valor, dict):
        raise ValueError(mensaje)
    return valor


def _texto(valor) -> str:
    if isinstance(valor, float) and valor.is_integer():
        valor = int(valor)
    return '' if valor is None else str(valor).strip()


def procesar_orden_transporte(respuesta: dict) -> dict:
    data = _dict(_dict(respuesta, 'Respuesta de Chilexpress inválida.').get('data'),
                 'Respuesta de Chilexpress inválida: no trae datos de la orden.')
    detalles = data.get('detail')
    if not isinstance(detalles, list) or not detalles or not isinstance(detalles[0], dict):
        raise ValueError('Respuesta de Chilexpress inválida: no trae el detalle de la orden.')
    detalle = detalles[0]
    if detalle.get('statusCode') not in (None, 0, '0'):
        raise ValueError(f"Chilexpress rechazó la orden: {_texto(detalle.get('statusDescription'))[:200] or 'sin detalle'}.")
    numero = _texto(detalle.get('transportOrderNumber'))
    if not numero or numero == '0':
        raise ValueError('Respuesta de Chilexpress inválida: falta el número de orden de transporte.')
    etiqueta = detalle.get('label') if isinstance(detalle.get('label'), dict) else {}
    datos_etiqueta = etiqueta.get('labelData')
    if isinstance(datos_etiqueta, (bytes, bytearray)):
        datos_etiqueta = base64.b64encode(bytes(datos_etiqueta)).decode('ascii')
    header = data.get('header') if isinstance(data.get('header'), dict) else {}
    return {
        'numero_ot': numero,
        'certificado': _texto(header.get('certificateNumber')),
        'codigo_barras': _texto(detalle.get('barcode')),
        'etiqueta': _texto(datos_etiqueta),
        'tipo_etiqueta': _texto(etiqueta.get('labelType')),
    }


def tipo_contenido_etiqueta(base64_data: str):
    try:
        raw = base64.b64decode(base64_data, validate=True)
    except (binascii.Error, ValueError):
        return None
    if raw.startswith(b'%PDF'):
        return raw, 'application/pdf'
    if raw.startswith(b'\x89PNG'):
        return raw, 'image/png'
    if raw[:3] == b'\xff\xd8\xff':
        return raw, 'image/jpeg'
    if raw.startswith(b'GIF8'):
        return raw, 'image/gif'
    return raw, 'application/octet-stream'


def procesar_seguimiento(respuesta: dict) -> dict:
    data = _dict(_dict(respuesta, 'Respuesta de seguimiento inválida.').get('data'),
                 'Respuesta de seguimiento inválida: no trae datos.')
    orden = _dict(data.get('transportOrderData'), 'Respuesta de seguimiento inválida: falta el estado del envío.')
    entrega = data.get('deliveryData') if isinstance(data.get('deliveryData'), dict) else {}
    crudos = data.get('trackingEvents')
    if crudos is None:
        crudos = []
    if not isinstance(crudos, list) or any(not isinstance(e, dict) for e in crudos):
        raise ValueError('Respuesta de seguimiento inválida: eventos mal formados.')

    eventos = []
    for evento in crudos:
        codigo = evento.get('code') if isinstance(evento.get('code'), dict) else {}
        fecha = _texto(evento.get('eventDate'))
        hora = _texto(evento.get('eventHour'))
        eventos.append({
            'fecha': f'{fecha} {hora}'.strip(),
            'estado': _texto(codigo.get('clientEventDescription')) or _texto(evento.get('description')),
            'descripcion': _texto(evento.get('description')) or _texto(codigo.get('clientEventDescription')),
            'ubicacion': _texto(evento.get('location')),
            'certificado_entrega': _texto(evento.get('certificadoEntrega')),
        })
    estado = _texto(orden.get('status'))
    if not estado and not eventos:
        raise ValueError('Respuesta de seguimiento inválida: sin estado ni eventos.')
    return {
        'estado': estado,
        'ubicacion_estado': _texto(orden.get('locationStatus')),
        'entrega': {
            'receptor_rut': _texto(entrega.get('receptorRut')),
            'receptor_nombre': _texto(entrega.get('receptorName')),
            'fecha_hora': _texto(entrega.get('deliveryDateTime')),
        } if any(entrega.get(k) for k in ('receptorRut', 'receptorName', 'deliveryDateTime')) else None,
        'eventos': eventos,
    }
