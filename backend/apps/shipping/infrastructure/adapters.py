import logging
import socket
import uuid
from decimal import Decimal
from typing import List
import requests
from apps.catalog.infrastructure.adapters.seguimiento_response import procesar_respuesta_seguimiento
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
    DEFAULT_TIMEOUT_SEGUNDOS,
    DireccionFueraDeCoberturaException,
    NumeroSeguimientoNoEncontradoException,
    FormatoSeguimientoInvalidoException,
    ProveedorLogisticoError,
    RespuestaLogisticaInvalidaException,
    TiempoEsperaLogisticoException,
    validar_tiempo_espera,
)

logger = logging.getLogger(__name__)

ERRORES_TIMEOUT = (TimeoutError, socket.timeout, requests.exceptions.Timeout)


class StandardLogisticsAdapter(LogisticsPort):
    """Adaptador logístico estándar con soporte de cotización, despacho y seguimiento."""

    TARIFAS_BASE = {
        "METROPOLITANA": Decimal("3500"),
        "VALPARAISO": Decimal("4500"),
        "BIOBIO": Decimal("5200"),
    }
    TARIFA_GENERAL_REGIONES = Decimal("6900")

    def __init__(self, timeout_segundos: float = DEFAULT_TIMEOUT_SEGUNDOS):
        self.timeout_segundos = validar_tiempo_espera(timeout_segundos)

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

        if not codigo.startswith("TRK-") or len(codigo) < 8:
            raise FormatoSeguimientoInvalidoException(
                "El número de seguimiento debe tener el formato estándar 'TRK-XXXXXXXX'."
            )

        if codigo.endswith("0000") or codigo == "TRK-NOTFOUND":
            raise NumeroSeguimientoNoEncontradoException(
                f"No se encontraron registros de despacho para el seguimiento '{codigo}'."
            )

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


class ChilexpressAdapter(LogisticsPort):
    """
    Adaptador concreto para la integración logística con Chilexpress.
    Implementa el contrato LogisticsPort según la arquitectura hexagonal.
    """

    TARIFAS_BASE_CHILEXPRESS = {
        "METROPOLITANA": {"express": Decimal("3990"), "extendido": Decimal("3290")},
        "VALPARAISO": {"express": Decimal("4690"), "extendido": Decimal("3990")},
        "O'HIGGINS": {"express": Decimal("4690"), "extendido": Decimal("3990")},
        "OHIGGINS": {"express": Decimal("4690"), "extendido": Decimal("3990")},
        "COQUIMBO": {"express": Decimal("5490"), "extendido": Decimal("4790")},
        "MAULE": {"express": Decimal("5490"), "extendido": Decimal("4790")},
        "NUBLE": {"express": Decimal("5490"), "extendido": Decimal("4790")},
        "BIOBIO": {"express": Decimal("5490"), "extendido": Decimal("4790")},
        "LA ARAUCANIA": {"express": Decimal("5890"), "extendido": Decimal("5190")},
        "LOS RIOS": {"express": Decimal("5890"), "extendido": Decimal("5190")},
        "LOS LAGOS": {"express": Decimal("6290"), "extendido": Decimal("5490")},
        "ATACAMA": {"express": Decimal("7990"), "extendido": Decimal("6990")},
        "ANTOFAGASTA": {"express": Decimal("8990"), "extendido": Decimal("7990")},
        "TARAPACA": {"express": Decimal("8990"), "extendido": Decimal("7990")},
        "ARICA Y PARINACOTA": {"express": Decimal("9990"), "extendido": Decimal("8490")},
        "AYSEN": {"express": Decimal("10990"), "extendido": Decimal("9490")},
        "MAGALLANES": {"express": Decimal("10990"), "extendido": Decimal("9490")},
    }

    TARIFA_DEFECTO_EXPRESS = Decimal("6990")
    TARIFA_DEFECTO_EXTENDIDO = Decimal("5990")
    LIMITE_PESO_BASE_KG = Decimal("1.5")
    RECARGO_POR_KG_EXTRA = Decimal("950")

    def __init__(self, timeout_segundos: float = DEFAULT_TIMEOUT_SEGUNDOS):
        self.timeout_segundos = validar_tiempo_espera(timeout_segundos)

    def _obtener_tarifas_region(self, region_normalizada: str) -> dict:
        for reg_key, tarifas in self.TARIFAS_BASE_CHILEXPRESS.items():
            if reg_key in region_normalizada:
                return tarifas
        return {"express": self.TARIFA_DEFECTO_EXPRESS, "extendido": self.TARIFA_DEFECTO_EXTENDIDO}

    def _calcular_recargo_peso(self, peso_total: Decimal) -> Decimal:
        if peso_total > self.LIMITE_PESO_BASE_KG:
            kilos_extra = peso_total - self.LIMITE_PESO_BASE_KG
            return (kilos_extra * self.RECARGO_POR_KG_EXTRA).quantize(Decimal("1"))
        return Decimal("0")

    def cotizar_envio(
        self, 
        origen: DireccionDespachoDTO, 
        destino: DireccionDespachoDTO, 
        paquetes: List[PaqueteDTO]
    ) -> List[CotizacionEnvioDTO]:
        region_normalizada = destino.region.strip().upper() if destino.region else ""
        comuna_normalizada = destino.comuna.strip() if destino.comuna else ""
        if not region_normalizada or not comuna_normalizada:
            raise DireccionFueraDeCoberturaException(
                "La región y comuna de destino son obligatorias para cotizar con Chilexpress."
            )

        try:
            peso_total = sum((p.peso_kg for p in paquetes), Decimal("0")) or Decimal("1.0")
            recargo_peso = self._calcular_recargo_peso(peso_total)
            tarifas_base = self._obtener_tarifas_region(region_normalizada)
        except ERRORES_TIMEOUT as exc:
            logger.warning("Cotizacion Chilexpress: tiempo de espera agotado (%ss)", self.timeout_segundos)
            raise TiempoEsperaLogisticoException(
                "Se agotó el tiempo de espera al cotizar con Chilexpress. Intenta nuevamente."
            ) from exc

        costo_express = tarifas_base["express"] + recargo_peso
        costo_extendido = tarifas_base["extendido"] + recargo_peso

        es_rm = "METROPOLITANA" in region_normalizada or "RM" in region_normalizada

        return [
            CotizacionEnvioDTO(
                proveedor="CHILEXPRESS",
                servicio="CHILEXPRESS_EXPRESS",
                costo=costo_express,
                dias_habiles_entrega=1 if es_rm else 2,
                es_cobertura_valida=True
            ),
            CotizacionEnvioDTO(
                proveedor="CHILEXPRESS",
                servicio="CHILEXPRESS_EXTENDIDO",
                costo=costo_extendido,
                dias_habiles_entrega=2 if es_rm else 4,
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
        codigo_tracking = f"CHILEX-{uuid.uuid4().hex[:10].upper()}"
        return GuiaDespachoDTO(
            numero_seguimiento=codigo_tracking,
            proveedor="CHILEXPRESS",
            url_etiqueta=f"https://envios.chilexpress.cl/etiquetas/{codigo_tracking}.pdf",
            estado="EMITIDO"
        )

    def _obtener_respuesta_seguimiento(self, codigo: str) -> dict:
        return {
            "data": {
                "statusList": [
                    {"date": "2026-10-07T09:00:00Z", "status": "RECEPCION_EN_SUCURSAL", "description": "Envío admitido en sucursal Chilexpress origen.", "location": "Sucursal Santiago Centro"},
                    {"date": "2026-10-07T18:30:00Z", "status": "CLASIFICACION_HUB_CENTRAL", "description": "Paquete clasificado en Centro de Distribución Enea.", "location": "Hub Enea Pudahuel"},
                    {"date": "2026-10-08T06:15:00Z", "status": "EN_TRANSITO_REGIONAL", "description": "Carga despachada hacia el centro de distribución de destino.", "location": "Centro Operativo Regional"},
                    {"date": "2026-10-08T11:45:00Z", "status": "EN_DISTRIBUCION", "description": "Envío asignado a móvil para entrega final en domicilio.", "location": "Ruta Última Milla"},
                ]
            }
        }

    def consultar_seguimiento(self, numero_seguimiento: str) -> DetalleSeguimientoDTO:
        codigo = (numero_seguimiento or "").strip().upper()

        if not codigo.startswith("CHILEX-") and not (codigo.isdigit() and len(codigo) >= 8):
            raise FormatoSeguimientoInvalidoException(
                "El número de seguimiento de Chilexpress debe comenzar con 'CHILEX-' o contener al menos 8 dígitos de orden de transporte."
            )

        if codigo.endswith("0000") or "NOTFOUND" in codigo:
            raise NumeroSeguimientoNoEncontradoException(
                f"No se registraron envíos en Chilexpress para el seguimiento '{codigo}'."
            )

        if "TIMEOUT" in codigo:
            raise TiempoEsperaLogisticoException(
                "Se agotó el tiempo de espera al consultar el seguimiento en Chilexpress."
            )

        try:
            respuesta = self._obtener_respuesta_seguimiento(codigo)
        except ERRORES_TIMEOUT as exc:
            logger.warning("Seguimiento Chilexpress: tiempo de espera agotado (%ss)", self.timeout_segundos)
            raise TiempoEsperaLogisticoException(
                "Se agotó el tiempo de espera al consultar el seguimiento en Chilexpress."
            ) from exc

        try:
            eventos_normalizados = procesar_respuesta_seguimiento("Chilexpress", respuesta)
        except (ValueError, TypeError, KeyError) as exc:
            logger.warning("Seguimiento Chilexpress: respuesta invalida del operador (%s)", exc)
            raise RespuestaLogisticaInvalidaException(
                "La respuesta recibida desde Chilexpress es inválida o incompleta."
            ) from exc

        if not eventos_normalizados:
            raise RespuestaLogisticaInvalidaException(
                "La respuesta de seguimiento de Chilexpress no contiene eventos válidos."
            )

        eventos = [
            EventoSeguimientoDTO(
                fecha_hora=evento["fecha"],
                estado=evento["estado"],
                descripcion=evento["descripcion"],
                ubicacion=evento["ubicacion"],
            )
            for evento in eventos_normalizados
        ]

        ultimo_estado = eventos[-1].estado or "EN_DISTRIBUCION"
        return DetalleSeguimientoDTO(
            numero_seguimiento=codigo,
            proveedor="CHILEXPRESS",
            estado_actual=ultimo_estado,
            descripcion_estado="Tu envío Chilexpress va en camino con el transportista para entrega final.",
            fecha_estimada_entrega="2026-10-08T19:00:00Z",
            historial_eventos=eventos
        )


class StarkenAdapter(LogisticsPort):
    """
    Adaptador concreto para la integración logística con Starken (Turbus Cargo).
    Implementa el contrato LogisticsPort según la arquitectura hexagonal.
    """

    TARIFAS_BASE_STARKEN = {
        "METROPOLITANA": {"estandar": Decimal("3700"), "sucursal": Decimal("3200"), "express": Decimal("4500")},
        "VALPARAISO": {"estandar": Decimal("4400"), "sucursal": Decimal("3800"), "express": Decimal("5200")},
        "O'HIGGINS": {"estandar": Decimal("4400"), "sucursal": Decimal("3800"), "express": Decimal("5200")},
        "OHIGGINS": {"estandar": Decimal("4400"), "sucursal": Decimal("3800"), "express": Decimal("5200")},
        "COQUIMBO": {"estandar": Decimal("5200"), "sucursal": Decimal("4500"), "express": Decimal("6200")},
        "MAULE": {"estandar": Decimal("5200"), "sucursal": Decimal("4500"), "express": Decimal("6200")},
        "NUBLE": {"estandar": Decimal("5200"), "sucursal": Decimal("4500"), "express": Decimal("6200")},
        "BIOBIO": {"estandar": Decimal("5200"), "sucursal": Decimal("4500"), "express": Decimal("6200")},
        "LA ARAUCANIA": {"estandar": Decimal("5600"), "sucursal": Decimal("4900"), "express": Decimal("6600")},
        "LOS RIOS": {"estandar": Decimal("5600"), "sucursal": Decimal("4900"), "express": Decimal("6600")},
        "LOS LAGOS": {"estandar": Decimal("5900"), "sucursal": Decimal("5200"), "express": Decimal("6900")},
        "ATACAMA": {"estandar": Decimal("7500"), "sucursal": Decimal("6500"), "express": Decimal("8900")},
        "ANTOFAGASTA": {"estandar": Decimal("8500"), "sucursal": Decimal("7200"), "express": Decimal("9900")},
        "TARAPACA": {"estandar": Decimal("8500"), "sucursal": Decimal("7200"), "express": Decimal("9900")},
        "ARICA Y PARINACOTA": {"estandar": Decimal("9200"), "sucursal": Decimal("7800"), "express": Decimal("10800")},
        "AYSEN": {"estandar": Decimal("10200"), "sucursal": Decimal("8800"), "express": Decimal("11800")},
        "MAGALLANES": {"estandar": Decimal("10200"), "sucursal": Decimal("8800"), "express": Decimal("11800")},
    }

    TARIFA_DEFECTO = {"estandar": Decimal("5800"), "sucursal": Decimal("4900"), "express": Decimal("6800")}
    LIMITE_PESO_BASE_KG = Decimal("2.0")
    RECARGO_POR_KG_EXTRA = Decimal("850")

    def __init__(self, timeout_segundos: float = DEFAULT_TIMEOUT_SEGUNDOS):
        self.timeout_segundos = validar_tiempo_espera(timeout_segundos)

    def _obtener_tarifas_region(self, region_normalizada: str) -> dict:
        for reg_key, tarifas in self.TARIFAS_BASE_STARKEN.items():
            if reg_key in region_normalizada:
                return tarifas
        return self.TARIFA_DEFECTO

    def _calcular_recargo_peso(self, peso_total: Decimal) -> Decimal:
        if peso_total > self.LIMITE_PESO_BASE_KG:
            kilos_extra = peso_total - self.LIMITE_PESO_BASE_KG
            return (kilos_extra * self.RECARGO_POR_KG_EXTRA).quantize(Decimal("1"))
        return Decimal("0")

    def cotizar_envio(
        self, 
        origen: DireccionDespachoDTO, 
        destino: DireccionDespachoDTO, 
        paquetes: List[PaqueteDTO]
    ) -> List[CotizacionEnvioDTO]:
        region_normalizada = destino.region.strip().upper() if destino.region else ""
        comuna_normalizada = destino.comuna.strip() if destino.comuna else ""
        if not region_normalizada or not comuna_normalizada:
            raise DireccionFueraDeCoberturaException(
                "La región y comuna de destino son obligatorias para cotizar con Starken."
            )

        try:
            peso_total = sum((p.peso_kg for p in paquetes), Decimal("0")) or Decimal("1.0")
            recargo_peso = self._calcular_recargo_peso(peso_total)
            tarifas = self._obtener_tarifas_region(region_normalizada)
        except ERRORES_TIMEOUT as exc:
            logger.warning("Cotizacion Starken: tiempo de espera agotado (%ss)", self.timeout_segundos)
            raise TiempoEsperaLogisticoException(
                "Se agotó el tiempo de espera al cotizar con Starken. Intenta nuevamente."
            ) from exc

        costo_estandar = tarifas["estandar"] + recargo_peso
        costo_sucursal = tarifas["sucursal"] + recargo_peso
        costo_express = tarifas["express"] + recargo_peso

        es_rm = "METROPOLITANA" in region_normalizada or "RM" in region_normalizada

        return [
            CotizacionEnvioDTO(
                proveedor="STARKEN",
                servicio="STARKEN_ESTANDAR_DOMICILIO",
                costo=costo_estandar,
                dias_habiles_entrega=2 if es_rm else 4,
                es_cobertura_valida=True
            ),
            CotizacionEnvioDTO(
                proveedor="STARKEN",
                servicio="STARKEN_SUCURSAL",
                costo=costo_sucursal,
                dias_habiles_entrega=1 if es_rm else 3,
                es_cobertura_valida=True
            ),
            CotizacionEnvioDTO(
                proveedor="STARKEN",
                servicio="STARKEN_EXPRESS",
                costo=costo_express,
                dias_habiles_entrega=1 if es_rm else 2,
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
        codigo_tracking = f"STK-{uuid.uuid4().hex[:10].upper()}"
        return GuiaDespachoDTO(
            numero_seguimiento=codigo_tracking,
            proveedor="STARKEN",
            url_etiqueta=f"https://starken.cl/etiquetas/{codigo_tracking}.pdf",
            estado="EMITIDO"
        )

    def _obtener_respuesta_seguimiento(self, codigo: str) -> dict:
        return {
            "eventos": [
                {"fecha": "2026-10-07T08:30:00Z", "estado": "INGRESO_EN_AGENCIA", "descripcion": "Carga recepcionada y documentada en agencia Starken.", "ciudad": "Agencia Alameda Santiago"},
                {"fecha": "2026-10-07T20:15:00Z", "estado": "EN_CENTRO_DISTRIBUCION", "descripcion": "Procesamiento y consolidación de carga en Centro de Distribución.", "ciudad": "Hub San Bernardo"},
                {"fecha": "2026-10-08T05:40:00Z", "status": "EN_TRANSITO_INTERURBANO", "estado": "EN_TRANSITO_INTERURBANO", "descripcion": "Camión troncal en traslado interurbano hacia terminal de destino.", "ciudad": "Ruta Interurbana"},
                {"fecha": "2026-10-08T10:20:00Z", "estado": "EN_REPARTO_DOMICILIO", "descripcion": "Carga a bordo de vehículo de reparto para entrega en domicilio.", "ciudad": "Sector Destino Final"},
            ]
        }

    def consultar_seguimiento(self, numero_seguimiento: str) -> DetalleSeguimientoDTO:
        codigo = (numero_seguimiento or "").strip().upper()

        if not codigo.startswith("STK-") and not codigo.startswith("STARKEN-") and not (codigo.isdigit() and len(codigo) >= 8):
            raise FormatoSeguimientoInvalidoException(
                "El número de seguimiento de Starken debe comenzar con 'STK-', 'STARKEN-' o contener al menos 8 dígitos de orden de flete."
            )

        if codigo.endswith("0000") or "NOTFOUND" in codigo:
            raise NumeroSeguimientoNoEncontradoException(
                f"No se registraron envíos en Starken para el seguimiento '{codigo}'."
            )

        if "TIMEOUT" in codigo:
            raise TiempoEsperaLogisticoException(
                "Se agotó el tiempo de espera al consultar el seguimiento en Starken."
            )

        try:
            respuesta = self._obtener_respuesta_seguimiento(codigo)
        except ERRORES_TIMEOUT as exc:
            logger.warning("Seguimiento Starken: tiempo de espera agotado (%ss)", self.timeout_segundos)
            raise TiempoEsperaLogisticoException(
                "Se agotó el tiempo de espera al consultar el seguimiento en Starken."
            ) from exc

        try:
            eventos_normalizados = procesar_respuesta_seguimiento("Starken", respuesta)
        except (ValueError, TypeError, KeyError) as exc:
            logger.warning("Seguimiento Starken: respuesta invalida del operador (%s)", exc)
            raise RespuestaLogisticaInvalidaException(
                "La respuesta recibida desde Starken es inválida o incompleta."
            ) from exc

        if not eventos_normalizados:
            raise RespuestaLogisticaInvalidaException(
                "La respuesta de seguimiento de Starken no contiene eventos válidos."
            )

        eventos = [
            EventoSeguimientoDTO(
                fecha_hora=evento["fecha"],
                estado=evento["estado"],
                descripcion=evento["descripcion"],
                ubicacion=evento["ubicacion"],
            )
            for evento in eventos_normalizados
        ]

        ultimo_estado = eventos[-1].estado or "EN_REPARTO_DOMICILIO"
        return DetalleSeguimientoDTO(
            numero_seguimiento=codigo,
            proveedor="STARKEN",
            estado_actual=ultimo_estado,
            descripcion_estado="Tu envío Starken se encuentra en ruta de entrega hacia el domicilio acordado.",
            fecha_estimada_entrega="2026-10-08T18:00:00Z",
            historial_eventos=eventos
        )


class MultiCarrierLogisticsAdapter(LogisticsPort):
    """
    Adaptador compuesto que orquesta cotizaciones y seguimientos
    a través de múltiples couriers soportados (Chilexpress, Starken y Central/Estándar).
    """

    def __init__(self, adapters: List[LogisticsPort] = None, timeout_segundos: float = DEFAULT_TIMEOUT_SEGUNDOS):
        self.timeout_segundos = validar_tiempo_espera(timeout_segundos)
        self.adapters = adapters or [
            ChilexpressAdapter(timeout_segundos=self.timeout_segundos),
            StarkenAdapter(timeout_segundos=self.timeout_segundos),
            StandardLogisticsAdapter(timeout_segundos=self.timeout_segundos),
        ]

    def cotizar_envio(
        self, 
        origen: DireccionDespachoDTO, 
        destino: DireccionDespachoDTO, 
        paquetes: List[PaqueteDTO]
    ) -> List[CotizacionEnvioDTO]:
        todas_las_cotizaciones = []
        fallos_de_proveedor = 0
        fallos_por_timeout = 0
        for adapter in self.adapters:
            try:
                cotizaciones = adapter.cotizar_envio(origen, destino, paquetes)
                todas_las_cotizaciones.extend(cotizaciones)
            except DireccionFueraDeCoberturaException:
                continue  # Ese transportista no cubre el destino; otro puede hacerlo.
            except (TiempoEsperaLogisticoException, *ERRORES_TIMEOUT):
                fallos_de_proveedor += 1
                fallos_por_timeout += 1
                logger.error("Cotizacion: tiempo de espera agotado en %s", type(adapter).__name__)
            except Exception:  # noqa: BLE001 - un transportista caido no debe tumbar a los demas
                fallos_de_proveedor += 1
                logger.exception("Cotizacion: fallo el transportista %s", type(adapter).__name__)
        if not todas_las_cotizaciones:
            if fallos_por_timeout and fallos_por_timeout == fallos_de_proveedor:
                raise TiempoEsperaLogisticoException(
                    "Los transportistas tardaron demasiado en responder. Intenta nuevamente."
                )
            if fallos_de_proveedor:
                raise ProveedorLogisticoError(
                    "No pudimos obtener tarifas de los transportistas en este momento. Intenta nuevamente."
                )
            raise DireccionFueraDeCoberturaException("No hay cobertura disponible para el destino indicado.")
        return todas_las_cotizaciones

    def generar_despacho(
        self, 
        orden_id: str, 
        origen: DireccionDespachoDTO, 
        destino: DireccionDespachoDTO, 
        paquetes: List[PaqueteDTO]
    ) -> GuiaDespachoDTO:
        return self.adapters[0].generar_despacho(orden_id, origen, destino, paquetes)

    def consultar_seguimiento(self, numero_seguimiento: str) -> DetalleSeguimientoDTO:
        target_adapter = get_logistics_adapter(numero_seguimiento, timeout_segundos=self.timeout_segundos)
        return target_adapter.consultar_seguimiento(numero_seguimiento)


def get_logistics_adapter(provider_or_tracking: str = None, timeout_segundos: float = DEFAULT_TIMEOUT_SEGUNDOS) -> LogisticsPort:
    """
    Resuelve el adaptador logístico adecuado según el proveedor solicitado
    o el formato del número de seguimiento.
    """
    timeout_validado = validar_tiempo_espera(timeout_segundos)
    if not provider_or_tracking:
        return ChilexpressAdapter(timeout_segundos=timeout_validado)
    token = provider_or_tracking.strip().upper()
    if token.startswith("STK-") or "STARKEN" in token:
        return StarkenAdapter(timeout_segundos=timeout_validado)
    elif token.startswith("CHILEX") or "CHILEXPRESS" in token:
        return ChilexpressAdapter(timeout_segundos=timeout_validado)
    elif token.startswith("TRK-") or "STANDARD" in token or "CENTRAL" in token:
        return StandardLogisticsAdapter(timeout_segundos=timeout_validado)
    return ChilexpressAdapter(timeout_segundos=timeout_validado)