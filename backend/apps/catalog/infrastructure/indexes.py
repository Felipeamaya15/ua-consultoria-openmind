from apps.core.infrastructure.mongo_client import get_mongo_db
from .stock_validation import ensure_product_stock_validator


def create_catalog_indexes():
    """Crea los índices del catálogo ."""
    db = get_mongo_db()
    ensure_product_stock_validator(db)
    
    # Índices para 'productos'
    productos = db.productos
    productos.create_index([("tienda_id", 1), ("activo", 1)])
    productos.create_index([("tienda_id", 1), ("categoria", 1)])
    productos.create_index([("tienda_id", 1), ("slug", 1)], unique=True)


    productos.create_index([
        ("tienda_id", 1),
        ("atributos_generales.clave", 1),
        ("atributos_generales.valor", 1)
    ])
    productos.create_index(
        [("tienda_id", 1), ("variantes.sku", 1)],
        unique=True,
        partialFilterExpression={"variantes.sku": {"$exists": True}}
    )

    productos.create_index([
        ("tienda_id", 1),
        ("variantes.atributos_variante.clave", 1),
        ("variantes.atributos_variante.valor", 1)
    ])

    # Índices para 'plantillas_atributos'
    plantillas = db.plantillas_atributos
    plantillas.create_index(
        [("tienda_id", 1), ("categoria", 1)],
        unique=True
    )
    
    print(" Índices del catálogo creados exitosamente")
