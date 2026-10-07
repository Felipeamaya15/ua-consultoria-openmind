import uuid
from decimal import Decimal
from typing import List
from apps.shipping.domain.ports import LogisticsPort
from apps.shipping.domain.dtos import (
    DireccionDespachoDTO, 
    PaqueteDTO, 
    CotizacionEnvioDTO, 
    GuiaDespachoDTO
)
from apps.shipping.domain.exceptions import DireccionFueraDeCoberturaException

class StandardLogisticsAdapter(LogisticsPort):
    """
    Adaptador logístico estándar con validación territorial nacional.
    """

    TARIFAS_BASE = {
        "METROPOLITANA": Decimal("3500"),
        "VALPARAISO": Decimal("4500"),
        "BIOBIO": Decimal("5200"),
    }
    TARIFA_GENERAL_REGIONES = Decimal("6900")

    def cotizar_envio(
        self, 
        origen: DireccionDespachoDTO, 
        destino: DireccionDespachoDTO, 
        paquetes: List[PaqueteDTO]
    ) -> List[CotizacionEnvioDTO]:
        region_normalizada = destino.region.strip().upper()
        
        if not region_normalizada:
            raise DireccionFueraDeCoberturaException("La región de destino es obligatoria.")

        tarifa_base = self.TARIFAS_BASE.get(region_normalizada, self.TARIFA_GENERAL_REGIONES)
        peso_total = sum(p.peso_kg for p in paquetes) or Decimal("1.0")
        
        # Recargo por peso adicional (> 3kg)
        recargo_peso = Decimal("0")
        if peso_total > Decimal("3.0"):
            recargo_peso = (peso_total - Decimal("3.0")) * Decimal("800")

        costo_total = tarifa_base + recargo_peso

        return [
            CotizacionEnvioDTO(
                proveedor="LOGISTICA_CENTRAL",
                servicio="ESTANDAR_DOMICILIO",
                costo=costo_total,
                dias_habiles_entrega=2 if "METROPOLITANA" in region_normalizada else 4,
                es_cobertura_valida=True
            ),
            CotizacionEnvioDTO(
                proveedor="LOGISTICA_CENTRAL",
                servicio="EXPRESS_DOMICILIO",
                costo=costo_total + Decimal("2000"),
                dias_habiles_entrega=1 if "METROPOLITANA" in region_normalizada else 2,
                es_cobertura_valida=True
            )
        ]

    def generar_despacho(
        self, 
        orden_id: str, 
        origen: DireccionDespachoDTO, 
        destino: DireccionDespachoDTO, 
        paquetes: List[PaqueteDTO]
    ) -> GuiaDespachoDTO:
        codigo_tracking = f"TRK-{uuid.uuid4().hex[:8].upper()}"
        return GuiaDespachoDTO(
            numero_seguimiento=codigo_tracking,
            proveedor="LOGISTICA_CENTRAL",
            url_etiqueta=f"https://envios.local/etiquetas/{codigo_tracking}.pdf",
            estado="CREADO"
        )

    def consultar_estado(self, numero_seguimiento: str) -> str:
        return "EN_PREPARACION"