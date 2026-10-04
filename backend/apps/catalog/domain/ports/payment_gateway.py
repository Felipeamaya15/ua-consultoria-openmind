from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal
from enum import Enum


class EstadoPago(str, Enum):
    """Estados normalizados, independientes de la pasarela concreta."""
    APROBADO = "APROBADO"
    PENDIENTE = "PENDIENTE"
    RECHAZADO = "RECHAZADO"


@dataclass(frozen=True)
class PagoIniciado:
    """Resultado de iniciar un pago: referencia de la pasarela y URL de redirección."""
    referencia: str
    url_pago: str


@dataclass(frozen=True)
class ResultadoPago:
    """Resultado normalizado de consultar un pago en la pasarela."""
    id_transaccion: str
    orden_compra: str
    monto: Decimal
    estado: EstadoPago
    detalle_estado: str = ""


class PaymentGatewayPort(ABC):
    """
    Puerto de integración de pagos.
    implementar para que el sistema no dependa de un proveedor.
    """

    @abstractmethod
    def iniciar_pago(
        self,
        orden_compra: str,
        monto: Decimal,
        descripcion: str,
        url_retorno: str,
    ) -> PagoIniciado:
        """Crea el pago en la pasarela y retorna la URL a la que redirigir al cliente."""

    @abstractmethod
    def consultar_pago(self, id_transaccion: str) -> ResultadoPago:
        """Consulta el estado de un pago y lo retorna normalizado."""
