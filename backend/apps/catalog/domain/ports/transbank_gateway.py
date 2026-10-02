from abc import ABC, abstractmethod
from typing import Dict, Any


class TransbankGatewayPort(ABC):
    """
    Puerto que define las operaciones agnósticas requeridas para interactuar
    con la pasarela de pagos Webpay Plus / Transbank.
    """

    @abstractmethod
    def iniciar_transaccion(
        self,
        orden_compra: str,
        session_id: str,
        monto: int,
        return_url: str,
    ) -> Dict[str, Any]:
        """Inicia una transacción en Webpay y retorna el token y la URL de redirección."""
        pass

    @abstractmethod
    def confirmar_transaccion(self, token_ws: str) -> Dict[str, Any]:
        """Confirma y valida el resultado del pago realizado por el cliente."""
        pass