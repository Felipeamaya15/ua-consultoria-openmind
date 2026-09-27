from collections.abc import Mapping

from rest_framework.exceptions import APIException, NotAuthenticated, PermissionDenied, ValidationError

from apps.core.models import Tienda


class ErrorConfiguracionTienda(APIException):
    status_code = 503


class TiendaNoConfigurada(ErrorConfiguracionTienda):
    default_detail = 'La instalación todavía no tiene una tienda configurada.'
    default_code = 'TIENDA_NO_CONFIGURADA'


class ConfiguracionTiendaInvalida(ErrorConfiguracionTienda):
    default_detail = 'La instalación contiene varias tiendas; revise su configuración.'
    default_code = 'CONFIGURACION_TIENDA_INVALIDA'


def _comprobar_tienda_enviada(request, tienda_id):
    # Los identificadores del cliente solo se contrastan; nunca seleccionan tienda.
    fuentes = (
        getattr(request, 'query_params', getattr(request, 'GET', {})),
        getattr(request, 'data', getattr(request, 'POST', {})),
    )
    valores = []
    for fuente in fuentes:
        if isinstance(fuente, Mapping):
            for campo in ('tienda_id', 'id_tienda'):
                if campo in fuente:
                    valores.extend(fuente.getlist(campo) if hasattr(fuente, 'getlist') else [fuente[campo]])
    for cabecera in ('X-Tienda-ID', 'Tienda-ID'):
        if cabecera in request.headers:
            valores.append(request.headers[cabecera])
    if any(not isinstance(valor, (str, int)) or isinstance(valor, bool) or str(valor) != tienda_id for valor in valores):
        raise ValidationError({'tienda_id': 'El identificador enviado no corresponde a la tienda de esta instalación.'})


def resolver_tienda(request, *, exigir_propietario=False):
    """Identifica la única tienda local; autoriza al propietario solo en usos privados."""
    try:
        tienda = Tienda.objects.get()
    except Tienda.DoesNotExist:
        raise TiendaNoConfigurada() from None
    except Tienda.MultipleObjectsReturned:
        raise ConfiguracionTiendaInvalida() from None

    _comprobar_tienda_enviada(request, str(tienda.pk))
    if exigir_propietario:
        usuario = getattr(request, 'user', None)
        if usuario is None or not usuario.is_authenticated:
            raise NotAuthenticated()
        if not Tienda.objects.del_propietario(usuario).filter(pk=tienda.pk).exists():
            raise PermissionDenied('Solo el propietario activo puede administrar esta tienda.')
    return tienda


def resolver_tienda_id(request, *, exigir_propietario=False) -> str:
    return str(resolver_tienda(request, exigir_propietario=exigir_propietario).pk)
