"""Descriptions for the real order context; stored marker syntax stays unchanged."""
import re
from .base import VARIABLES_PERMITIDAS, _MARCADOR

_DETAILS = (
    ('Nombre del cliente', 'Nombre registrado al realizar la compra.', 'María'),
    ('Correo del cliente', 'Correo de contacto del pedido.', 'cliente@example.test'),
    ('Número de pedido', 'Identificador del pedido al que corresponde el mensaje.', 'PED-00125'),
    ('Total del pedido', 'Monto total de esa compra.', '$25.990'),
    ('Método de entrega', 'Método de entrega elegido para el pedido.', 'Despacho a domicilio'),
    ('Transportista', 'Transportista o método de despacho del pedido.', 'Transportista de ejemplo'),
    ('Código de seguimiento', 'Código de seguimiento guardado en el despacho.', 'SEG-00125'),
    ('Enlace de seguimiento', 'Enlace seguro para consultar el pedido; solicita el correo del comprador.', 'https://example.test/seguimiento?orden=PED-00125'),
    ('Nombre de la tienda', 'Nombre actual de tu negocio.', 'Tienda de ejemplo'),
)
FIELDS = [dict(key=key, label=label, description=description, example=example) for key, (label, description, example) in zip(VARIABLES_PERMITIDAS, _DETAILS)]
REQUIRED = ('orderNumber',)


def validate_markers(text):
    for key in _MARCADOR.findall(text):
        if key not in VARIABLES_PERMITIDAS:
            raise ValueError(f'El campo automático {{{{{key}}}}} no existe. Selecciona un campo válido.')
    remainder = _MARCADOR.sub('', text)
    # Only recognizable system markers are protected; normal braces remain text.
    for key in VARIABLES_PERMITIDAS:
        if re.search(r'\{\{?\s*' + re.escape(key) + r'\b|\b' + re.escape(key) + r'\s*\}\}?', remainder):
            raise ValueError(f'El campo automático {key} está incompleto. Insértalo desde Campos automáticos.')


def validate_template(template):
    text = '\n'.join(template[field] for field in ('subject', 'preheader', 'body'))
    validate_markers(text)
    if template['enabled'] and not set(REQUIRED).issubset(_MARCADOR.findall(text)):
        raise ValueError('Incluye el campo automático Número de pedido antes de guardar este correo activo.')
