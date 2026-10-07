from decimal import Decimal
from typing import List, Dict, Any
from apps.shipping.domain.ports import LogisticsPort
from apps.shipping.domain.dtos import DireccionDespachoDTO, PaqueteDTO

class CotizarDespachoEcommerceUseCase:
    """Caso de uso invocado durante el flujo de checkout/carrito."""
    
    def __init__(self, logistics_port: LogisticsPort):
        self.logistics_port = logistics_port

    def execute(self, datos_destino: Dict[str, Any], total_carrito: Decimal, total_items: int) -> List[Dict[str, Any]]:
        destino = DireccionDespachoDTO(
            calle=datos_destino["calle"],
            numero=datos_destino["numero"],
            comuna=datos_destino["comuna"],
            region=datos_destino["region"],
            depto_casa=datos_destino.get("depto_casa", ""),
            referencias=datos_destino.get("referencias", "")
        )
        
        # Origen central de bodega/tienda
        origen_bodega = DireccionDespachoDTO(
            calle="Av. Central",
            numero="1000",
            comuna="Santiago",
            region="Metropolitana"
        )

        # Estimación estándar por volumen del carrito
        peso_estimado = Decimal(total_items) * Decimal("0.5")
        paquetes = [
            PaqueteDTO(
                peso_kg=peso_estimado,
                alto_cm=Decimal("15"),
                ancho_cm=Decimal("20"),
                largo_cm=Decimal("30"),
                valor_declarado=total_carrito
            )
        ]

        cotizaciones = self.logistics_port.cotizar_envio(origen_bodega, destino, paquetes)
        
        return [
            {
                "proveedor": c.proveedor,
                "servicio": c.servicio,
                "costo": int(c.costo),
                "dias_habiles_entrega": c.dias_habiles_entrega,
                "es_cobertura_valida": c.es_cobertura_valida
            }
            for c in cotizaciones
        ]