import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from django.utils import timezone

TAMANO_POR_DEFECTO = 20
TAMANO_MAXIMO = 100
BUSQUEDA_MAXIMA = 100
DIAS_MAXIMOS_POR_DIA = 366
AGRUPACIONES = ('dia', 'mes')
ORDENES = {
    'fecha_desc': ('-fecha_creacion', '-id_pedido'),
    'fecha_asc': ('fecha_creacion', 'id_pedido'),
    'monto_desc': ('-monto_total', '-id_pedido'),
    'monto_asc': ('monto_total', 'id_pedido'),
}
_FECHA = re.compile(r'[0-9]{4}-[0-9]{2}-[0-9]{2}')


class ParametroInvalido(Exception):
    def __init__(self, mensaje, codigo):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.codigo = codigo


@dataclass(frozen=True)
class Rango:
    desde: date | None
    hasta: date | None

    def limites(self):
        zona = timezone.get_current_timezone()
        inicio = timezone.make_aware(datetime.combine(self.desde, time.min), zona) if self.desde else None
        fin = timezone.make_aware(datetime.combine(self.hasta + timedelta(days=1), time.min), zona) if self.hasta else None
        return inicio, fin

    def aplicar(self, queryset):
        inicio, fin = self.limites()
        if inicio is not None:
            queryset = queryset.filter(fecha_creacion__gte=inicio)
        if fin is not None:
            queryset = queryset.filter(fecha_creacion__lt=fin)
        return queryset


@dataclass(frozen=True)
class Pagina:
    numero: int
    tamano: int

    @property
    def inicio(self):
        return (self.numero - 1) * self.tamano

    @property
    def fin(self):
        return self.inicio + self.tamano

    def metadatos(self, total):
        paginas = -(-total // self.tamano)
        return {'pagina': self.numero, 'tamano': self.tamano, 'total': total, 'total_paginas': paginas}


def _entero(valor, nombre, codigo, maximo=None):
    # isdigit() acepta también dígitos de otros alfabetos y superíndices: solo se admiten 0-9.
    if not (valor.isascii() and valor.isdigit()) or int(valor) < 1 or (maximo is not None and int(valor) > maximo):
        limite = f' y {maximo}' if maximo else ''
        raise ParametroInvalido(f'{nombre} debe ser un número entero entre 1{limite}.' if maximo
                                else f'{nombre} debe ser un número entero mayor o igual a 1.', codigo)
    return int(valor)


def leer_fecha(valor, nombre):
    if not _FECHA.fullmatch(valor):
        raise ParametroInvalido(f'{nombre} debe tener el formato AAAA-MM-DD.', 'FECHA_INVALIDA')
    try:
        return date.fromisoformat(valor)
    except ValueError:
        raise ParametroInvalido(f'{nombre} no es una fecha válida.', 'FECHA_INVALIDA') from None


def leer_rango(params):
    desde = leer_fecha(params['fecha_desde'], 'fecha_desde') if 'fecha_desde' in params else None
    hasta = leer_fecha(params['fecha_hasta'], 'fecha_hasta') if 'fecha_hasta' in params else None
    if desde and hasta and desde > hasta:
        raise ParametroInvalido('fecha_desde no puede ser posterior a fecha_hasta.', 'RANGO_FECHAS_INVALIDO')
    return Rango(desde, hasta)


def leer_pagina(params):
    numero = _entero(params['pagina'], 'pagina', 'PAGINA_INVALIDA') if 'pagina' in params else 1
    tamano = (_entero(params['tamano'], 'tamano', 'TAMANO_INVALIDO', TAMANO_MAXIMO)
              if 'tamano' in params else TAMANO_POR_DEFECTO)
    return Pagina(numero, tamano)


def leer_estado(params, estados_validos):
    if 'estado' not in params:
        return None
    estado = params['estado']
    if estado not in estados_validos:
        raise ParametroInvalido('El estado indicado no es válido.', 'ESTADO_INVALIDO')
    return estado


def leer_orden(params):
    clave = params.get('orden', 'fecha_desc')
    if clave not in ORDENES:
        raise ParametroInvalido(f'El orden debe ser uno de: {", ".join(ORDENES)}.', 'ORDEN_INVALIDO')
    return ORDENES[clave]


def leer_busqueda(params):
    texto = params.get('q', '').strip()
    if len(texto) > BUSQUEDA_MAXIMA:
        raise ParametroInvalido(f'La búsqueda admite hasta {BUSQUEDA_MAXIMA} caracteres.', 'BUSQUEDA_INVALIDA')
    return texto


def leer_agrupacion(params, rango):
    agrupacion = params.get('agrupacion', 'mes')
    if agrupacion not in AGRUPACIONES:
        raise ParametroInvalido('La agrupación debe ser "dia" o "mes".', 'AGRUPACION_INVALIDA')
    if agrupacion == 'dia':
        if not (rango.desde and rango.hasta):
            raise ParametroInvalido('Agrupar por día exige fecha_desde y fecha_hasta.', 'RANGO_DEMASIADO_AMPLIO')
        if (rango.hasta - rango.desde).days + 1 > DIAS_MAXIMOS_POR_DIA:
            raise ParametroInvalido(
                f'Agrupar por día admite un rango de hasta {DIAS_MAXIMOS_POR_DIA} días.', 'RANGO_DEMASIADO_AMPLIO')
    return agrupacion
