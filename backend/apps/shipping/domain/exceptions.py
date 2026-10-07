class LogisticaException(Exception):
    """Excepción base de logística."""
    pass

class DireccionFueraDeCoberturaException(LogisticaException):
    """Lanzada cuando el destino no tiene cobertura logística."""
    pass

class ProveedorLogisticoError(LogisticaException):
    """Error al comunicarse con el proveedor o servicio logístico."""
    pass