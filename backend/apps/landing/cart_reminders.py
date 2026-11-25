"""Registro privado de actividad del carrito. No envía publicidad."""
import hashlib
import json
import re

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.core.infrastructure.contacts import eligible_consents
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import Tienda
from apps.core.presentation.responses import success_response
from apps.landing.models import RegistroCarritoAbandonado


class CartItemInput(serializers.Serializer):
    nombre = serializers.CharField(max_length=120)
    cantidad = serializers.IntegerField(min_value=1, max_value=10000)


class CartInput(serializers.Serializer):
    items = CartItemInput(many=True, max_length=35)
    ruta = serializers.CharField(max_length=300)
    actividad = serializers.BooleanField(default=False)

    def validate_ruta(self, value):
        if not re.fullmatch(r'/[a-zA-Z0-9_/%.-]{0,280}', value):
            raise serializers.ValidationError('Ruta de carrito inválida.')
        if value.startswith('//') or '..' in value:
            raise serializers.ValidationError('Ruta de carrito inválida.')
        return value


class RegistroCarritoView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tienda = resolver_tienda(request)
        data = CartInput(data=request.data)
        data.is_valid(raise_exception=True)

        email = (request.user.email or '').strip().lower()
        items = [
            {
                'nombre': ' '.join(item['nombre'].split()),
                'cantidad': item['cantidad'],
            }
            for item in data.validated_data['items']
        ]

        with transaction.atomic():
            Tienda.objects.select_for_update().get(pk=tienda.pk)
            record = RegistroCarritoAbandonado.objects.select_for_update().filter(
                tienda=tienda, usuario=request.user
            ).first()

            consent = eligible_consents(tienda).filter(email=email).first()

            if not consent:
                if record:
                    record.items = []
                    record.estado = 'excluido'
                    record.save(update_fields=['items', 'estado'])
                return success_response(data={'recibido': True}, status=202)

            if not items:
                if record:
                    record.items = []
                    record.estado = 'vacio'
                    record.ultima_actividad = timezone.now()
                    record.save(update_fields=['items', 'estado', 'ultima_actividad'])
                return success_response(data={'recibido': True}, status=202)

            fingerprint = hashlib.sha256(
                json.dumps(items, ensure_ascii=False, sort_keys=True).encode()
            ).hexdigest()

            if record is None:
                RegistroCarritoAbandonado.objects.create(
                    tienda=tienda,
                    usuario=request.user,
                    email=email,
                    items=items,
                    ruta=data.validated_data['ruta'],
                    huella=fingerprint,
                    ultima_actividad=timezone.now(),
                    estado='activo',
                )
            else:
                changed = (
                    record.huella != fingerprint
                    or record.email != email
                    or record.estado in ('vacio', 'excluido')
                )
                record.email = email
                record.items = items
                record.ruta = data.validated_data['ruta']
                record.huella = fingerprint
                if changed or (
                    data.validated_data['actividad']
                    and record.estado == 'activo'
                ):
                    record.ultima_actividad = timezone.now()
                    record.estado = 'activo'
                    record.save(update_fields=[
                        'email', 'items', 'ruta', 'huella',
                        'ultima_actividad', 'estado'
                    ])
                else:
                    record.save(update_fields=[
                        'email', 'items', 'ruta', 'huella'
                    ])

        return success_response(data={'recibido': True}, status=202)
