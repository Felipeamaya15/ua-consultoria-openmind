from django.db import transaction
from django.utils.dateparse import parse_datetime
from rest_framework import serializers
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework.exceptions import ValidationError

from apps.authentication.infrastructure.cookie_auth import (
    ActiveSessionTokenAuthentication,
)
from apps.authentication.presentation.profile import (
    IsCustomer, StrictSerializer,
)
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import Tienda
from apps.core.presentation.responses import success_response
from apps.landing.models import SeleccionCarritoActividad
from apps.landing.paid_availability import availability


class CartSelectionSerializer(StrictSerializer):
    cantidad = serializers.IntegerField(min_value=1, max_value=10000)
    version = serializers.RegexField(r'^[a-f0-9]{64}$')


def item_data(item):
    from apps.landing.models import ConfiguracionLanding
    config = ConfiguracionLanding.objects.filter(tienda_id=item.tienda_id).first()
    block = next((block for block in (config.contenido or {}).get('bloques', []) if block.get('id') == str(item.seccion_id)), {}) if config else {}
    activity = block.get('actividad') or {}
    return {
        **({'recorded': True, 'accessDays': activity.get('acceso_dias')} if activity.get('modalidad_venta') == 'grabado' else {}),
        'sectionId': str(item.seccion_id),
        'title': item.titulo,
        'quantity': item.cantidad,
        'price': item.precio,
        'version': item.version,
        'start': item.inicio.isoformat() if item.inicio else '',
        'zone': item.zona,
    }


class CartBase(APIView):
    authentication_classes = [
        ActiveSessionTokenAuthentication,
        TokenAuthentication,
    ]
    permission_classes = [IsAuthenticated, IsCustomer]

    def rows(self, request):
        store = resolver_tienda(request)
        return (
            SeleccionCarritoActividad.objects.filter(
                tienda=store,
                usuario=request.user,
            ),
            store,
        )

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(
            request, response, *args, **kwargs
        )
        response['Cache-Control'] = 'no-store'
        return response


class CartActivityListView(CartBase):
    def get(self, request):
        rows, _ = self.rows(request)
        items = [
            item_data(item)
            for item in rows.order_by('pk')[:20]
        ]
        return success_response(data={'items': items})

    def delete(self, request):
        rows, _ = self.rows(request)
        rows.delete()
        return success_response(data={'items': []})


class CartActivityItemView(CartBase):
    def put(self, request, pk):
        body = CartSelectionSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        values = body.validated_data

        rows, store = self.rows(request)
        current = availability(store, pk)

        if (
            current['estado'] != 'disponible'
            or current['version'] != values['version']
            or values['cantidad'] > current['cupos_disponibles']
        ):
            raise ValidationError(
                'La actividad cambió o no tiene suficientes cupos. '
                'Actualiza sus condiciones antes de continuar.'
            )

        start = parse_datetime(current['inicio']) if current['inicio'] else None
        if current.get('modalidad_venta') != 'grabado' and (start is None or start.tzinfo is None):
            raise ValidationError('Fecha de actividad inválida.')

        with transaction.atomic():
            # Serializa las incorporaciones para limitar el carrito.
            Tienda.objects.select_for_update().get(pk=store.pk)
            rows, _ = self.rows(request)

            if (
                not rows.filter(seccion_id=pk).exists()
                and rows.count() >= 20
            ):
                raise ValidationError(
                    'Puedes guardar hasta 20 actividades.'
                )

            item, _ = rows.update_or_create(
                tienda=store,
                usuario=request.user,
                seccion_id=pk,
                defaults={
                    'cantidad': values['cantidad'],
                    'titulo': current['titulo'][:200],
                    'precio': current['precio'],
                    'version': current['version'],
                    'inicio': start,
                    'zona': current['zona_horaria'][:80],
                },
            )

        return success_response(data=item_data(item))

    def delete(self, request, pk):
        rows, _ = self.rows(request)
        rows.filter(seccion_id=pk).delete()
        return success_response(data={'eliminado': True})
