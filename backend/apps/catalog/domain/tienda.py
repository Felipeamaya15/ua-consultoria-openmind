import re


def validate_store_id(tienda_id):
    """MongoDB recibe únicamente str(tienda.pk), resuelto por el backend."""
    if not isinstance(tienda_id, str) or re.fullmatch(r'[1-9][0-9]*', tienda_id) is None:
        raise ValueError('tienda_id debe ser la PK de la tienda expresada como cadena decimal positiva.')


def data_for_store(tienda_id, data):
    """Conserva la tienda resuelta e impide reasignarla mediante campos de $set."""
    validate_store_id(tienda_id)
    for field, value in data.items():
        if field == 'tienda_id':
            if value != tienda_id:
                raise ValueError('No se puede cambiar la tienda del documento.')
        elif field.startswith('tienda_id.'):
            raise ValueError('tienda_id debe conservarse como un identificador, no un documento.')
    return {**data, 'tienda_id': tienda_id}
