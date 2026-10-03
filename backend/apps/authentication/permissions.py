from rest_framework.permissions import BasePermission
from rest_framework.exceptions import PermissionDenied
from apps.core.models import Tienda
from apps.core.infrastructure.tenant import resolver_tienda


class IsStoreOwner(BasePermission):
    message = 'Solo el propietario de la tienda puede acceder al panel.'

    def has_permission(self, request, view):
        if not request.user.is_authenticated or not Tienda.objects.del_propietario(request.user).exists():
            return False
        # Identificadores ajenos nunca autorizan ni seleccionan otra tienda.
        for source in (request.query_params, request.data):
            for key in ('tienda_id', 'id_tienda'):
                if key in source and str(source[key]) not in {str(pk) for pk in Tienda.objects.del_propietario(request.user).values_list('pk', flat=True)}:
                    raise PermissionDenied(self.message)
        tienda = resolver_tienda(request, exigir_propietario=True)
        product_id = view.kwargs.get('id_producto') or view.kwargs.get('product_id')
        if product_id:
            from apps.catalog.infrastructure.repositories import ProductRepository
            product = ProductRepository().get_by_id(str(product_id))
            if product and str(product.get('tienda_id')) != str(tienda.pk):
                raise PermissionDenied('El producto no pertenece a tu tienda.')
        return True
