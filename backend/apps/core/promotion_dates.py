"""Vigencias: instantes UTC; fechas heredadas incluyen el día comercial de Santiago."""
from datetime import date, datetime, time, timedelta, timezone as dt_timezone
from zoneinfo import ZoneInfo
from django.utils import timezone

BUSINESS_ZONE = ZoneInfo('America/Santiago')


def promotion_instant(value, *, end=False):
    if value is None:
        return None
    if isinstance(value, datetime):
        if timezone.is_naive(value):
            raise ValueError('Indica la zona horaria de la vigencia.')
        return value.astimezone(dt_timezone.utc)
    if not isinstance(value, date):
        raise ValueError('La vigencia debe ser una fecha o un instante con zona horaria.')
    # El roundtrip UTC resuelve también la medianoche inexistente al comenzar DST.
    boundary = datetime.combine(value + timedelta(days=1) if end else value, time.min, BUSINESS_ZONE)
    instant = boundary.astimezone(dt_timezone.utc)
    return instant - timedelta(microseconds=1) if end else instant
