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


class ProductoNoEncontradoException(ProductoNoDisponibleException):
    """Lanzada cuando el producto no existe en la base de datos."""
    pass


class VarianteNoEncontradaException(CatalogException):
    """Lanzada cuando el SKU o identificador de variante no existe en el producto."""
    pass


class ItemCarritoNoEncontradoException(CatalogException):
    """Lanzada cuando el ítem no existe en el carrito del usuario."""
    pass

class ConfiguracionPagoInvalidaException(CatalogException):
    """Lanzada cuando los parámetros de Transbank no cumplen con el formato o reglas requeridas."""
    pass


class TiendaNoAutorizadaException(CatalogException):
    """Lanzada cuando un usuario intenta acceder o modificar la configuración de una tienda no asignada."""
    pass

# Alias de compatibilidad por si algún módulo importa DominioException


class TransbankTransaccionException(CatalogException):
    """Lanzada cuando ocurre un error de comunicación o rechazo técnico con Transbank."""
    pass


class TransbankRechazoException(CatalogException):
    """Lanzada cuando la transacción es rechazada por el banco emisor o anulada."""
    pass


class TransbankConfiguracionFaltanteException(CatalogException):
    """Lanzada cuando la tienda no tiene credenciales de Transbank activas o configuradas."""
    pass







DominioException = CatalogException