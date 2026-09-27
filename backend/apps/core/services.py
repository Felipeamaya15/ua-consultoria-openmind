from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import connection, transaction

from apps.core.models import Tienda


@transaction.atomic
def configurar_tienda(propietario, *, nombre, descripcion=None):
    """Devuelve (tienda, creada) en la configuración privada de esta instalación."""
    # PostgreSQL: también serializa configuraciones cuando aún no existen filas.
    # Bloquear solo una fila con select_for_update no protege una tabla vacía.
    with connection.cursor() as cursor:
        tabla = connection.ops.quote_name(Tienda._meta.db_table)
        cursor.execute(f'LOCK TABLE {tabla} IN SHARE ROW EXCLUSIVE MODE')

    try:
        return Tienda.objects.get(), False
    except Tienda.DoesNotExist:
        pass
    # Si hay datos previos con varias tiendas, get() falla sin elegir ni borrar.
    if (
        not isinstance(propietario, get_user_model())
        or propietario.pk is None
        or not propietario.is_active
    ):
        raise ValidationError('El propietario debe ser una cuenta activa y guardada de autenticación.')

    tienda = Tienda(nombre=nombre, descripcion=descripcion, id_usuario_propietario=propietario)
    tienda.full_clean()
    tienda.save()
    return tienda, True
