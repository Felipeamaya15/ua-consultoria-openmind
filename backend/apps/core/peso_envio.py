import math
from dataclasses import dataclass, field
from decimal import ROUND_CEILING, Decimal, InvalidOperation
from typing import Any, Dict, List, Optional

from django.conf import settings

PACKAGE_DEFAULTS = {
    'peso_default_kg': None,
    'margen_porcentaje': 0,
    'margen_fijo': 0,
    'limite_peso_kg': 15,
    'limite_unidades': 10,
    'alto_cm': 15, 'ancho_cm': 20, 'largo_cm': 30,
}
PESO_MINIMO_KG = Decimal('0.1')
MENSAJE_A_COORDINAR = ('Tu pedido supera el tamaño para envío automático. '
                       'Contacta a la tienda para coordinar el despacho o elige retiro en tienda.')


class CarritoInvalido(ValueError):
    """Un producto del carrito no existe, está inactivo o su SKU no pertenece al producto."""


class CarritoRequerido(ValueError):
    """Con la API del transportista el precio depende del peso: la cotización necesita los productos del carrito."""


class EnvioACoordinar(Exception):
    """El carrito supera el peso o las unidades máximas para envío automático."""


def _decimal(value, default=None):
    if value is None or isinstance(value, bool):
        return default
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return default
    return number if number.is_finite() else default


def peso_global_por_defecto() -> Decimal:
    return _decimal(getattr(settings, 'SHIPPING_DEFAULT_WEIGHT_KG', '1'), Decimal('1')) or Decimal('1')


def package_settings(datos) -> Dict[str, Any]:
    stored = datos.get('paquete') if isinstance(datos, dict) and isinstance(datos.get('paquete'), dict) else {}
    result = dict(PACKAGE_DEFAULTS)
    for key, default in PACKAGE_DEFAULTS.items():
        if key not in stored:
            continue
        value = stored[key]
        if value is None:
            if key in ('peso_default_kg', 'limite_peso_kg', 'limite_unidades'):
                result[key] = None
            continue
        number = _decimal(value)
        if number is None or number < 0:
            continue
        if key in ('peso_default_kg', 'limite_peso_kg') and number <= 0:
            continue
        result[key] = number if key in ('peso_default_kg', 'limite_peso_kg', 'margen_porcentaje') else int(number)
    return result


def package_settings_for_store(tienda) -> Dict[str, Any]:
    from apps.core.delivery import delivery_raw
    return package_settings(delivery_raw(tienda))


def peso_default_de_tienda(params) -> Decimal:
    peso = _decimal(params.get('peso_default_kg'))
    return peso if peso is not None and peso > 0 else peso_global_por_defecto()


def _peso_producto(product) -> Optional[Decimal]:
    peso = _decimal(product.get('peso_kg')) if isinstance(product, dict) else None
    return peso if peso is not None and peso > 0 else None


def _precio_variante(variant) -> Decimal:
    base = _decimal(variant.get('precio'), Decimal('0'))
    oferta = _decimal(variant.get('precio_oferta'))
    price = oferta if oferta is not None and 0 <= oferta <= base else base
    return max(price, Decimal('0'))


@dataclass
class CarritoEnvio:
    peso_kg: Decimal
    unidades: int
    valor_declarado: Decimal
    usa_peso_default: bool
    params: Dict[str, Any] = field(default_factory=dict)

    @property
    def a_coordinar(self) -> bool:
        limite_peso, limite_unidades = self.params.get('limite_peso_kg'), self.params.get('limite_unidades')
        return bool((limite_peso is not None and self.peso_kg > Decimal(str(limite_peso)))
                    or (limite_unidades is not None and self.unidades > int(limite_unidades)))

    def paquete(self) -> Dict[str, Any]:
        return {
            'peso_kg': max(self.peso_kg, PESO_MINIMO_KG),
            'alto_cm': Decimal(str(self.params['alto_cm'])), 'ancho_cm': Decimal(str(self.params['ancho_cm'])),
            'largo_cm': Decimal(str(self.params['largo_cm'])),
            'valor_declarado': self.valor_declarado.quantize(Decimal('1'), rounding=ROUND_CEILING),
        }


def paquete_sin_carrito(params, valor_declarado=None) -> Dict[str, Any]:
    return {
        'peso_kg': max(peso_default_de_tienda(params), PESO_MINIMO_KG),
        'alto_cm': Decimal(str(params['alto_cm'])), 'ancho_cm': Decimal(str(params['ancho_cm'])),
        'largo_cm': Decimal(str(params['largo_cm'])),
        'valor_declarado': Decimal(str(valor_declarado if valor_declarado is not None else
                                       getattr(settings, 'SHIPPING_DEFAULT_DECLARED_VALUE', '20000'))),
    }


def calcular_carrito(tienda, items: List[Dict[str, Any]], *, repository=None, params=None) -> CarritoEnvio:
    if repository is None:
        from apps.catalog.infrastructure.repositories import ProductRepository
        repository = ProductRepository()
    params = params if params is not None else package_settings_for_store(tienda)
    peso_default = peso_default_de_tienda(params)
    total, unidades, valor, usa_default = Decimal('0'), 0, Decimal('0'), False
    for item in items or []:
        cantidad = item.get('cantidad')
        if isinstance(cantidad, bool) or not isinstance(cantidad, int) or cantidad < 1:
            raise CarritoInvalido('La cantidad de un producto no es válida.')
        product = (repository.get_by_id(str(tienda.pk), item.get('producto_id'))
                   or repository.get_by_slug(str(tienda.pk), item.get('producto_id')))
        if not product or not product.get('activo', False):
            raise CarritoInvalido('Un producto no está disponible en esta tienda.')
        variant = next((v for v in product.get('variantes', []) if v.get('sku') == item.get('sku')), None)
        if variant is None:
            raise CarritoInvalido('El SKU no pertenece al producto seleccionado.')
        peso = _peso_producto(product)
        if peso is None:
            peso, usa_default = peso_default, True
        total += peso * cantidad
        unidades += cantidad
        valor += _precio_variante(variant) * cantidad
    return CarritoEnvio(peso_kg=total.quantize(Decimal('0.001')), unidades=unidades,
                        valor_declarado=valor, usa_peso_default=usa_default, params=params)


def aplicar_margen(monto, params) -> int:
    base = _decimal(monto, Decimal('0'))
    porcentaje = _decimal(params.get('margen_porcentaje'), Decimal('0'))
    fijo = _decimal(params.get('margen_fijo'), Decimal('0'))
    total = base + base * porcentaje / Decimal('100') + fijo
    return int(total.to_integral_value(rounding=ROUND_CEILING))


def peso_str(value) -> str:
    return format(Decimal(str(value)).quantize(Decimal('0.001')), 'f')


def mismo_peso(firmado, actual) -> bool:
    a, b = _decimal(firmado), _decimal(actual)
    return a is not None and b is not None and math.isclose(float(a), float(b), abs_tol=0.0005)
