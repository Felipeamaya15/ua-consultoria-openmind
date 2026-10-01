"""Restricción de persistencia del inventario Mongo, sin alterar otros campos."""
from pymongo.errors import CollectionInvalid


STOCK_VALIDATOR = {
    '$jsonSchema': {
        'bsonType': 'object',
        'description': 'Stock de producto y variantes entero y no negativo (SCRUM-236)',
        'properties': {
            'stock': {'bsonType': ['int', 'long'], 'minimum': 0},
            'variantes': {
                'bsonType': 'array',
                'items': {
                    'bsonType': 'object',
                    'properties': {'stock': {'bsonType': ['int', 'long'], 'minimum': 0}},
                },
            },
        },
    },
}


def _contains_stock_rule(validator):
    return validator == STOCK_VALIDATOR or any(
        _contains_stock_rule(rule) for rule in validator.get('$and', [])
    )


def ensure_product_stock_validator(db):
    """Idempotente. Conserva validadores ajenos y no reescribe documentos antiguos."""
    existing = next(db.list_collections(filter={'name': 'productos'}), None)
    if existing is None:
        try:
            db.create_collection('productos', validator=STOCK_VALIDATOR,
                                 validationLevel='strict', validationAction='error')
            return
        except CollectionInvalid:
            # Otro proceso creó la colección: aplicar la misma regla a continuación.
            existing = next(db.list_collections(filter={'name': 'productos'}))

    invalid_count = db.productos.count_documents({'$nor': [STOCK_VALIDATOR]})
    if invalid_count:
        raise ValueError(
            f'No se activó la restricción de stock: hay {invalid_count} productos '
            'con inventario inválido. Revisa esos datos antes de ejecutar sync_mongo_indexes; '
            'no se modificaron ni se convirtieron a cero.'
        )
    validator = existing.get('options', {}).get('validator', {})
    if not _contains_stock_rule(validator):
        validator = {'$and': [validator, STOCK_VALIDATOR]} if validator else STOCK_VALIDATOR
    db.command('collMod', 'productos', validator=validator,
               validationLevel='strict', validationAction='error')
