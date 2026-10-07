class LogisticaException(Exception):
    """Excepción base de logística."""
    pass

class DireccionFueraDeCoberturaException(LogisticaException):
    """Lanzada cuando el destino no tiene cobertura logística."""
    pass

class ProveedorLogisticoError(LogisticaException):
    """Error al comunicarse con el proveedor o servicio logístico."""
    pass


class NumeroSeguimientoNoEncontradoException(LogisticaException):
    """Lanzada cuando el código de seguimiento no existe o no registra envíos."""
    pass

class FormatoSeguimientoInvalidoException(LogisticaException):
    """Lanzada cuando el código de seguimiento no cumple con el formato requerido."""
    pass