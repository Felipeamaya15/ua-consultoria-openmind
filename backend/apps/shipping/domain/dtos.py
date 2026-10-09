from dataclasses import dataclass
from typing import Optional, List
from decimal import Decimal

@dataclass(frozen=True)
class DireccionDespachoDTO:
    calle: str
    numero: str
    comuna: str
    region: str
    ciudad: Optional[str] = ""
    depto_casa: Optional[str] = ""
    codigo_postal: Optional[str] = ""
    referencias: Optional[str] = ""

@dataclass(frozen=True)
class PaqueteDTO:
    peso_kg: Decimal
    alto_cm: Decimal
    ancho_cm: Decimal
    largo_cm: Decimal
    valor_declarado: Decimal

@dataclass(frozen=True)
class CotizacionEnvioDTO:
    proveedor: str
    servicio: str
    costo: Decimal
    dias_habiles_entrega: int
    es_cobertura_valida: bool

@dataclass(frozen=True)
class GuiaDespachoDTO:
    numero_seguimiento: str
    proveedor: str
    url_etiqueta: Optional[str]
    estado: str


@dataclass(frozen=True)
class EventoSeguimientoDTO:
    fecha_hora: str
    estado: str
    descripcion: str
    ubicacion: str

@dataclass(frozen=True)
class DetalleSeguimientoDTO:
    numero_seguimiento: str
    proveedor: str
    estado_actual: str
    descripcion_estado: str
    fecha_estimada_entrega: str
    historial_eventos: List[EventoSeguimientoDTO]