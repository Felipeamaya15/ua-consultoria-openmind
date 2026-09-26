def validate_stock(value):
    """El inventario se expresa como una cantidad entera no negativa."""
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError('El stock debe ser un entero mayor o igual a cero.')


def validate_product_stock(data):
    """Valida documentos y campos de $set, incluidas rutas de variantes."""
    def validate_variant(variant):
        if not isinstance(variant, dict):
            raise ValueError('La variante debe ser un documento.')
        if 'stock' in variant:
            validate_stock(variant['stock'])

    for field, value in data.items():
        path = field.split('.')
        if path[0] == 'stock':
            if len(path) != 1:
                raise ValueError('El stock debe ser un valor entero, no un documento.')
            validate_stock(value)
        elif path[0] == 'variantes':
            if len(path) == 1:
                if not isinstance(value, list):
                    raise ValueError('Las variantes deben ser una lista.')
                for variant in value:
                    validate_variant(variant)
            elif len(path) == 2:
                validate_variant(value)
            elif path[2] == 'stock':
                if len(path) != 3:
                    raise ValueError('El stock debe ser un valor entero, no un documento.')
                validate_stock(value)
