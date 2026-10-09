from decimal import Decimal
from typing import List, Dict, Any, Optional
from apps.shipping.domain.ports import LogisticsPort
from apps.shipping.domain.dtos import DireccionDespachoDTO, PaqueteDTO
from apps.shipping.domain.exceptions import DireccionFueraDeCoberturaException

class CotizarDespachoEcommerceUseCase:
    """
    Servicio de Aplicación: Orquestador y calculador del servicio 
    de cotización de envíos para el flujo de Checkout.
    """

    # Reglas comerciales de la tienda
    UMBRAL_ENVIO_GRATIS = Decimal("30000.00")
    REGIONES_PROMOCION_GRATIS = ["METROPOLITANA", "REGION METROPOLITANA", "RM"]

    def __init__(self, logistics_port: LogisticsPort):
        self.logistics_port = logistics_port


    def cotizar(self, datos_cotizacion: Dict[str, Any]) -> Dict[str, Any]:
        """Método invocado por la vista API."""
        return self.execute(
            datos_destino=datos_cotizacion,
            total_carrito=Decimal(str(datos_cotizacion["total_carrito"])),
            total_items=int(datos_cotizacion["total_items"]),
            peso_kg=datos_cotizacion.get("peso_kg")
        )
    
    def execute(
        self, 
        datos_destino: Dict[str, Any], 
        total_carrito: Decimal, 
        total_items: int,
        peso_kg: Optional[Decimal] = None
    ) -> Dict[str, Any]:
        """
        Calcula las alternativas de despacho disponibles, aplicando políticas
        comerciales (descuentos, gratuidad) y ordenando por conveniencia.
        """
        region = datos_destino.get("region", "").strip()
        comuna = datos_destino.get("comuna", "").strip()

        if not region or not comuna:
            raise DireccionFueraDeCoberturaException("La región y comuna de destino son obligatorias para cotizar.")

        # 1. Construcción de DTOs de dirección
        destino = DireccionDespachoDTO(
            calle=datos_destino.get("calle", ""),
            numero=datos_destino.get("numero", ""),
            comuna=comuna,
            region=region,
            depto_casa=datos_destino.get("depto_casa", ""),
            referencias=datos_destino.get("referencias", "")
        )

        origen_bodega = DireccionDespachoDTO(
            calle="Av. Central",
            numero="1000",
            comuna="Santiago",
            region="Metropolitana"
        )

        # 2. Estimación de peso y empaque
        if peso_kg is not None and peso_kg > Decimal("0"):
            peso_final = peso_kg
        else:
            peso_final = Decimal(str(total_items)) * Decimal("0.5")

        paquetes = [
            PaqueteDTO(
                peso_kg=peso_final,
                alto_cm=Decimal("15"),
                ancho_cm=Decimal("20"),
                largo_cm=Decimal("30"),
                valor_declarado=total_carrito
            )
        ]

        # 3. Consulta de tarifas crudas al puerto logístico
        cotizaciones_puerto = self.logistics_port.cotizar_envio(origen_bodega, destino, paquetes)

        # 4. Aplicación de políticas comerciales (Envío gratis por compra sobre umbral)
        region_upper = region.upper()
        aplica_envio_gratis = (
            total_carrito >= self.UMBRAL_ENVIO_GRATIS and
            any(r in region_upper for r in self.REGIONES_PROMOCION_GRATIS)
        )

        opciones_procesadas = []
        for cotizacion in cotizaciones_puerto:
            costo = cotizacion.costo
            servicio = cotizacion.servicio
            es_gratis = False

            # Se subsidia el servicio estándar/extendido si cumple las condiciones comerciales
            if aplica_envio_gratis and ("ESTANDAR" in servicio or "EXTENDIDO" in servicio):
                costo = Decimal("0.00")
                servicio = f"{cotizacion.servicio} (ENVÍO GRATIS)"
                es_gratis = True

            opciones_procesadas.append({
                "proveedor": cotizacion.proveedor,
                "servicio": servicio,
                "costo": int(costo),
                "dias_habiles_entrega": cotizacion.dias_habiles_entrega,
                "es_cobertura_valida": cotizacion.es_cobertura_valida,
                "es_gratis": es_gratis
            })

        # 5. Ordenar por menor costo (la opción más económica primero)
        opciones_procesadas.sort(key=lambda item: item["costo"])

        # 6. Retorno estructurado para el Checkout
        return {
            "destino": {
                "comuna": comuna,
                "region": region
            },
            "total_items": total_items,
            "total_carrito": int(total_carrito),
            "opcion_recomendada": opciones_procesadas[0] if opciones_procesadas else None,
            "opciones": opciones_procesadas
        }


class ConsultarSeguimientoUseCase:
    """
    Caso de uso: Consulta y procesamiento del estado logístico de una orden.
    """

    def __init__(self, logistics_port: LogisticsPort):
        self.logistics_port = logistics_port

    def execute(self, numero_seguimiento: str) -> Dict[str, Any]:
        codigo_limpio = (numero_seguimiento or "").strip()
        
        # Orquestación a través del puerto logístico
        detalle = self.logistics_port.consultar_seguimiento(codigo_limpio)

        return {
            "numero_seguimiento": detalle.numero_seguimiento,
            "proveedor": detalle.proveedor,
            "estado_actual": detalle.estado_actual,
            "descripcion_estado": detalle.descripcion_estado,
            "fecha_estimada_entrega": detalle.fecha_estimada_entrega,
            "historial": [
                {
                    "fecha_hora": e.fecha_hora,
                    "estado": e.estado,
                    "descripcion": e.descripcion,
                    "ubicacion": e.ubicacion
                }
                for e in detalle.historial_eventos
            ]
        }

# Alias para mantener coherencia semántica con el nombre del servicio
ShippingQuotationService = CotizarDespachoEcommerceUseCase