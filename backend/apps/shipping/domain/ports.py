from abc import ABC, abstractmethod
from typing import List
from .dtos import (
    DireccionDespachoDTO, 
    PaqueteDTO, 
    CotizacionEnvioDTO,
    GuiaDespachoDTO,
    DetalleSeguimientoDTO
)

class LogisticsPort(ABC):
    """
    Puerto de Integración Logística (Contrato de Arquitectura Hexagonal).
    Cualquier proveedor logístico (Chilexpress, Starken, Blue Express, Mock)
    debe implementar esta interfaz.
    """

    @abstractmethod
    def cotizar_envio(
        self, 
        origen: DireccionDespachoDTO, 
        destino: DireccionDespachoDTO, 
        paquetes: List[PaqueteDTO]
    ) -> List[CotizacionEnvioDTO]:
        """Calcula las tarifas disponibles según origen, destino y bultos."""
        pass

    @abstractmethod
    def generar_despacho(
        self, 
        orden_id: str, 
        origen: DireccionDespachoDTO, 
        destino: DireccionDespachoDTO, 
        paquetes: List[PaqueteDTO]
    ) -> GuiaDespachoDTO:
        """Emite la orden de retiro/despacho y retorna el tracking inicial."""
        pass

    @abstractmethod
    def consultar_seguimiento(self, numero_seguimiento: str) -> DetalleSeguimientoDTO:
        """Consulta el estado detallado y la bitácora de eventos del despacho."""
        pass