from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from django.utils import timezone

from apps.core.models import Promocion


class PromotionError(ValueError):
    pass


@dataclass(frozen=True)
class PromotionAmounts:
    promotion: Promocion | None
    discount: Decimal
    shipping: Decimal


def calculate_promotion(tienda, code, subtotal, shipping, *, today=None, lock=False):
    normalized = str(code or '').strip().upper()
    if not normalized:
        return PromotionAmounts(None, Decimal('0.00'), shipping)

    query = Promocion.objects.filter(tienda=tienda, codigo=normalized)
    promotion = (query.select_for_update() if lock else query).first()
    if not promotion:
        raise PromotionError('El codigo promocional no existe.')

    current_date = today or timezone.localdate()
    if not promotion.activa:
        raise PromotionError('El codigo promocional esta inactivo.')
    if promotion.fecha_inicio and current_date < promotion.fecha_inicio:
        raise PromotionError('El codigo promocional aun no esta vigente.')
    if promotion.fecha_fin and current_date > promotion.fecha_fin:
        raise PromotionError('El codigo promocional expiro.')
    if promotion.maximo_usos is not None and promotion.usos >= promotion.maximo_usos:
        raise PromotionError('El codigo promocional alcanzo su limite de usos.')
    if subtotal < promotion.monto_minimo:
        raise PromotionError(f'La compra minima para este codigo es ${promotion.monto_minimo:.0f}.')

    discount = Decimal('0.00')
    adjusted_shipping = shipping
    if promotion.tipo == Promocion.TIPO_MONTO_FIJO:
        discount = min(subtotal, promotion.valor)
    elif promotion.tipo == Promocion.TIPO_PORCENTAJE:
        discount = min(subtotal, (subtotal * promotion.valor / Decimal('100')).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    elif promotion.tipo == Promocion.TIPO_ENVIO_GRATIS:
        adjusted_shipping = Decimal('0.00')

    return PromotionAmounts(promotion, discount, adjusted_shipping)
