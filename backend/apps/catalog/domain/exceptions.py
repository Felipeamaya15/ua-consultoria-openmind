class CatalogException(Exception):
    """Excepción base para el dominio de catálogo y compras."""
    pass


class CantidadInvalidaException(CatalogException):
    """Lanzada cuando la cantidad es menor o igual a cero o no es un entero."""
    pass


class StockInsuficienteException(CatalogException):
    """Lanzada cuando la cantidad solicitada excede el stock disponible en inventario."""
    pass


class ProductoNoDisponibleException(CatalogException):
    """Lanzada cuando el producto está inactivo o no existe."""
    pass


class ItemCarritoNoEncontradoException(CatalogException):
    """Lanzada cuando el ítem no existe en el carrito del usuario."""
    pass