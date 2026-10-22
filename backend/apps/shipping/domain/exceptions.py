import math


class LogisticaException(Exception):
    """Excepción base de logística."""
    pass


class DireccionFueraDeCoberturaException(LogisticaException):
    """Lanzada cuando el destino no tiene cobertura logística."""
    pass


class ProveedorLogisticoError(LogisticaException):
    """Error al comunicarse con el proveedor o servicio logístico."""
    pass


class TiempoEsperaLogisticoException(ProveedorLogisticoError):
    """Lanzada cuando se agota el tiempo de espera al consultar al operador logístico."""
    pass


class RespuestaLogisticaInvalidaException(ProveedorLogisticoError):
    """Lanzada cuando la respuesta del operador logístico es inválida, corrupta o incompleta."""
    pass


class NumeroSeguimientoNoEncontradoException(LogisticaException):
    """Lanzada cuando el código de seguimiento no existe o no registra envíos."""
    pass


class FormatoSeguimientoInvalidoException(LogisticaException):
    """Lanzada cuando el código de seguimiento no cumple con el formato requerido."""
    pass


TIMEOUT_MIN_SEGUNDOS = 0.1
TIMEOUT_MAX_SEGUNDOS = 60.0
DEFAULT_TIMEOUT_SEGUNDOS = 10.0


def validar_tiempo_espera(timeout_segundos: float = DEFAULT_TIMEOUT_SEGUNDOS) -> float:
    """Valida que el tiempo de espera configurado sea un número finito positivo y acotado."""
    if isinstance(timeout_segundos, bool) or timeout_segundos is None:
        raise ValueError("El tiempo de espera debe ser un número válido en segundos.")
    try:
        valor = float(timeout_segundos)
    except (TypeError, ValueError) as exc:
        raise ValueError("El tiempo de espera debe ser un número válido en segundos.") from exc
    if not math.isfinite(valor) or valor <= 0 or valor > TIMEOUT_MAX_SEGUNDOS:
        raise ValueError(
            f"El tiempo de espera debe ser mayor a 0 y menor o igual a {TIMEOUT_MAX_SEGUNDOS:.0f} segundos."
        )
    return valor