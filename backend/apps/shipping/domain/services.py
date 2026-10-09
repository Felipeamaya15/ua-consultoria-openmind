from decimal import Decimal
from typing import List
from apps.shipping.domain.dtos import CotizacionEnvioDTO

class ShippingDomainService:
    """
    Servicio de Dominio con las reglas de negocio de despacho del e-commerce.
    """

    UMBRAL_ENVIO_GRATIS = Decimal("30000.00")
    REGIONES_PROMOCION_GRATIS = ["METROPOLITANA", "REGION METROPOLITANA", "RM"]

    @classmethod
    def aplicar_politicas_comerciales(
        cls, 
        cotizaciones: List[CotizacionEnvioDTO], 
        region_destino: str, 
        total_compra: Decimal
    ) -> List[CotizacionEnvioDTO]:
        """
        Aplica reglas comerciales como despacho gratis por monto de compra
        o ajustes de promocion sin modificar la API del proveedor logistico.
        """
        region_normalizada = region_destino.strip().upper()
        aplica_gratis = (
            total_compra >= cls.UMBRAL_ENVIO_GRATIS and 
            any(r in region_normalizada for r in cls.REGIONES_PROMOCION_GRATIS)
        )

        resultado: List[CotizacionEnvioDTO] = []
        for cotizacion in cotizaciones:
            costo_final = cotizacion.costo
            servicio_nombre = cotizacion.servicio

            # Aplica promocion de envio gratis para el servicio estandar
            if aplica_gratis and "ESTANDAR" in cotizacion.servicio:
                costo_final = Decimal("0.00")
                servicio_nombre = f"{cotizacion.servicio} (ENVIO_GRATIS)"

            resultado.append(
                CotizacionEnvioDTO(
                    proveedor=cotizacion.proveedor,
                    servicio=servicio_nombre,
                    costo=costo_final,
                    dias_habiles_entrega=cotizacion.dias_habiles_entrega,
                    es_cobertura_valida=cotizacion.es_cobertura_valida
                )
            )

        return resultado