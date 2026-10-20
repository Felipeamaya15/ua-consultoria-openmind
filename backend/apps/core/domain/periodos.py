"""Límites comerciales de calendario, independientes de TIME_ZONE de Django."""
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

ZONA_COMERCIAL = ZoneInfo('America/Santiago')


def inicio_dia_utc(fecha, zona=ZONA_COMERCIAL):
    """Primer límite del día local expresado en UTC.

    fold=0 usa la primera ocurrencia si la medianoche se repite. En el salto
    chileno de 00:00 a 01:00, conserva el offset anterior al salto: al convertir
    a UTC el límite corresponde a 01:00, el primer instante existente del día.
    Nunca se suman 24 horas a un instante para calcular el siguiente día.
    """
    return datetime.combine(fecha, time.min, tzinfo=zona).replace(fold=0).astimezone(timezone.utc)


def limites_rango(desde, hasta, zona=ZONA_COMERCIAL):
    """Fechas inclusivas de entrada → [inicio, día siguiente exclusivo) en UTC."""
    return (inicio_dia_utc(desde, zona) if desde else None,
            inicio_dia_utc(hasta + timedelta(days=1), zona) if hasta else None)
