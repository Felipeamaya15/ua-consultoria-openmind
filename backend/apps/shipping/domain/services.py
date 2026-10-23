from decimal import Decimal, InvalidOperation
from typing import List, Optional
from apps.shipping.domain.dtos import CotizacionEnvioDTO


class ShippingDomainService:
    """
    Servicio de Dominio con las reglas de negocio de despacho del e-commerce.
    """

    UMBRAL_ENVIO_GRATIS = Decimal("30000.00")
    REGIONES_PROMOCION_GRATIS = ["METROPOLITANA", "REGION METROPOLITANA", "RM"]

    @classmethod
    def cumple_monto_minimo_envio_gratis(
        cls,
        total_compra: Decimal,
        monto_minimo: Optional[Decimal] = None,
    ) -> bool:
        """
        Valida que el monto de la compra y el umbral mínimo sean valores válidos no negativos
        y determina si la compra alcanza el monto mínimo para envío gratuito.
        """
        if isinstance(total_compra, bool) or total_compra is None:
            raise ValueError("El total de la compra debe ser un monto válido.")
        try:
            total_dec = Decimal(str(total_compra))
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise ValueError("El total de la compra debe ser un monto válido.") from exc
        if not total_dec.is_finite() or total_dec < Decimal("0.00"):
            raise ValueError("El total de la compra no puede ser negativo.")

        umbral_raw = cls.UMBRAL_ENVIO_GRATIS if monto_minimo is None else monto_minimo
        if isinstance(umbral_raw, bool):
            raise ValueError("El monto mínimo para envío gratuito debe ser un número válido.")
        try:
            umbral_dec = Decimal(str(umbral_raw))
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise ValueError("El monto mínimo para envío gratuito debe ser un número válido.") from exc
        if not umbral_dec.is_finite() or umbral_dec < Decimal("0.00"):
            raise ValueError("El monto mínimo para envío gratuito no puede ser negativo.")

        return total_dec >= umbral_dec

    @classmethod
    def aplicar_politicas_comerciales(
        cls,
        cotizaciones: List[CotizacionEnvioDTO],
        region_destino: str,
        total_compra: Decimal,
        monto_minimo: Optional[Decimal] = None,
    ) -> List[CotizacionEnvioDTO]:
        """
        Aplica reglas comerciales como despacho gratis por monto de compra
        o ajustes de promocion sin modificar la API del proveedor logistico.
        """
        region_normalizada = (region_destino or "").strip().upper()
        cumple_minimo = cls.cumple_monto_minimo_envio_gratis(total_compra, monto_minimo=monto_minimo)
        aplica_gratis = (
            cumple_minimo
            and any(r in region_normalizada for r in cls.REGIONES_PROMOCION_GRATIS)
        )

        resultado: List[CotizacionEnvioDTO] = []
        for cotizacion in cotizaciones:
            costo_final = cotizacion.costo
            servicio_nombre = cotizacion.servicio

            if aplica_gratis and ("ESTANDAR" in cotizacion.servicio or "EXTENDIDO" in cotizacion.servicio):
                costo_final = Decimal("0.00")
                servicio_nombre = f"{cotizacion.servicio} (ENVIO_GRATIS)"

            resultado.append(
                CotizacionEnvioDTO(
                    proveedor=cotizacion.proveedor,
                    servicio=servicio_nombre,
                    costo=costo_final,
                    dias_habiles_entrega=cotizacion.dias_habiles_entrega,
                    es_cobertura_valida=cotizacion.es_cobertura_valida,
                )
            )

        return resultado