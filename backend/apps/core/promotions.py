from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from django.utils import timezone

from apps.core.models import Promocion
from apps.core.promotion_dates import promotion_instant


class PromotionError(ValueError):
    pass


@dataclass(frozen=True)
class PromotionAmounts:
    promotion: Promocion | None
    discount: Decimal
    shipping: Decimal


CANONICAL_TYPES = {
    'percentage': 'percentage', 'descuento_porcentual': 'percentage',
    'fixed': 'fixed', 'descuento_monto_fijo': 'fixed',
    'free_shipping': 'free_shipping', 'envio_gratuito': 'free_shipping',
    'precio_oferta': 'precio_oferta',
}


def _to_non_negative_decimal(value, label: str) -> Decimal:
    if isinstance(value, bool) or value is None:
        raise PromotionError(f'El {label} no es válido.')
    try:
        decimal_value = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise PromotionError(f'El {label} no es válido.') from exc
    if not decimal_value.is_finite() or decimal_value < Decimal('0.00'):
        raise PromotionError(f'El {label} no puede ser negativo.')
    return decimal_value


def validar_monto_minimo_envio_gratis(subtotal, monto_minimo) -> Decimal:
    """Valida que el subtotal cumpla el monto mínimo requerido para envío gratuito."""
    subtotal_dec = _to_non_negative_decimal(subtotal, 'subtotal')
    minimo_dec = _to_non_negative_decimal(monto_minimo or Decimal('0.00'), 'monto mínimo')
    if subtotal_dec < minimo_dec:
        raise PromotionError(f'La compra minima para este codigo es ${minimo_dec:.0f}.')
    return subtotal_dec


def calculate_promotion(tienda, code, subtotal, shipping, *, today=None, lock=False):
    subtotal_dec = _to_non_negative_decimal(subtotal, 'subtotal')
    shipping_dec = _to_non_negative_decimal(shipping, 'costo de envío')

    normalized = str(code or '').strip().upper()
    if not normalized:
        return PromotionAmounts(None, Decimal('0.00'), shipping_dec)

    query = Promocion.objects.filter(tienda=tienda, codigo__iexact=normalized)
    promotion = (query.select_for_update() if lock else query).first()
    if not promotion:
        raise PromotionError('El codigo promocional no existe.')

    current_instant = promotion_instant(today) if today is not None else timezone.now()
    start = promotion_instant(promotion.fecha_inicio)
    end = promotion_instant(promotion.fecha_fin, end=True)
    if promotion.tipo == 'precio_oferta':
        raise PromotionError('El precio de oferta pertenece al producto o variante; no es un cupón.')
    if promotion.tipo not in CANONICAL_TYPES:
        raise PromotionError('Tipo de promoción no compatible.')
    if not promotion.activa:
        raise PromotionError('El codigo promocional esta inactivo.')
    if start and current_instant < start:
        raise PromotionError('El codigo promocional aun no esta vigente.')
    if end and current_instant > end:
        raise PromotionError('El codigo promocional expiro.')
    if promotion.maximo_usos is not None and promotion.usos >= promotion.maximo_usos:
        raise PromotionError('El codigo promocional alcanzo su limite de usos.')

    validar_monto_minimo_envio_gratis(subtotal_dec, promotion.monto_minimo)

    discount = Decimal('0.00')
    adjusted_shipping = shipping_dec
    if promotion.tipo in (Promocion.TIPO_MONTO_FIJO, 'fixed', 'descuento_monto_fijo'):
        discount = min(subtotal_dec, promotion.valor)
    elif promotion.tipo in (Promocion.TIPO_PORCENTAJE, 'percentage', 'descuento_porcentual'):
        discount = min(
            subtotal_dec,
            (subtotal_dec * promotion.valor / Decimal('100')).quantize(Decimal('1'), rounding=ROUND_HALF_UP),
        )
    elif promotion.tipo in (Promocion.TIPO_ENVIO_GRATIS, 'free_shipping', 'envio_gratuito'):
        adjusted_shipping = Decimal('0.00')

    return PromotionAmounts(promotion, discount, adjusted_shipping)