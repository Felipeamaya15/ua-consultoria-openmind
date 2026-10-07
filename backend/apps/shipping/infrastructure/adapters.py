import uuid
from decimal import Decimal
from typing import List
from apps.shipping.domain.ports import LogisticsPort
from apps.shipping.domain.dtos import (
    DireccionDespachoDTO, 
    PaqueteDTO, 
    CotizacionEnvioDTO, 
    GuiaDespachoDTO,
    EventoSeguimientoDTO,
    DetalleSeguimientoDTO
)
from apps.shipping.domain.exceptions import (
    DireccionFueraDeCoberturaException,
    NumeroSeguimientoNoEncontradoException,
    FormatoSeguimientoInvalidoException
)

class StandardLogisticsAdapter(LogisticsPort):
    """Adaptador logístico estándar con soporte de cotización, despacho y seguimiento."""

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

    def consultar_seguimiento(self, numero_seguimiento: str) -> DetalleSeguimientoDTO:
        codigo = numero_seguimiento.strip().upper()

        # Validación de formato (debe empezar con TRK- y tener al menos 6 caracteres)
        if not codigo.startswith("TRK-") or len(codigo) < 8:
            raise FormatoSeguimientoInvalidoException(
                "El número de seguimiento debe tener el formato estándar 'TRK-XXXXXXXX'."
            )

        # Simulación de código no existente
        if codigo.endswith("0000") or codigo == "TRK-NOTFOUND":
            raise NumeroSeguimientoNoEncontradoException(
                f"No se encontraron registros de despacho para el seguimiento '{codigo}'."
            )

        # Mock de eventos cronológicos del courier
        eventos = [
            EventoSeguimientoDTO(
                fecha_hora="2026-10-06T10:30:00Z",
                estado="RECEPCIONADO",
                descripcion="Paquete recibido en centro de distribución central.",
                ubicacion="Santiago Hub"
            ),
            EventoSeguimientoDTO(
                fecha_hora="2026-10-07T08:15:00Z",
                estado="EN_TRANSITO",
                descripcion="Paquete en traslado hacia la sucursal de destino.",
                ubicacion="Centro Logístico Regional"
            ),
            EventoSeguimientoDTO(
                fecha_hora="2026-10-07T14:45:00Z",
                estado="EN_REPARTO",
                descripcion="El repartidor va en camino a tu domicilio.",
                ubicacion="Ruta Final"
            )
        ]

        return DetalleSeguimientoDTO(
            numero_seguimiento=codigo,
            proveedor="LOGISTICA_CENTRAL",
            estado_actual="EN_REPARTO",
            descripcion_estado="Tu pedido está en reparto y será entregado hoy.",
            fecha_estimada_entrega="2026-10-07T19:00:00Z",
            historial_eventos=eventos
        )