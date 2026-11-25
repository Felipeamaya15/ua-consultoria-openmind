from datetime import date, datetime
import re
from django.utils.dateparse import parse_datetime
from django.utils import timezone
from apps.core.promotion_dates import promotion_instant
from django.db import IntegrityError, transaction
from rest_framework import serializers, status
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from apps.authentication.permissions import IsStoreOwner
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import Promocion
from apps.core.promotions import PromotionError, calculate_promotion, CANONICAL_TYPES
from apps.core.presentation.responses import error_response, success_response

TIPO_TO_CANONICAL = CANONICAL_TYPES


class PromotionDateField(serializers.DateTimeField):
    """YYYY-MM-DD incluye todo el día Santiago; ISO requiere offset explícito."""
    def __init__(self, *args, end=False, **kwargs):
        self.end = end
        super().__init__(*args, **kwargs)

    def to_internal_value(self, value):
        try:
            if isinstance(value, date) and not isinstance(value, datetime):
                return promotion_instant(value, end=self.end)
            if isinstance(value, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
                return promotion_instant(date.fromisoformat(value), end=self.end)
            parsed = parse_datetime(value) if isinstance(value, str) else value
            if isinstance(parsed, datetime) and timezone.is_naive(parsed):
                raise ValueError('Indica Z o el offset horario de la vigencia.')
            return promotion_instant(super().to_internal_value(value))
        except (ValueError, OverflowError) as exc:
            raise serializers.ValidationError(str(exc))

    def to_representation(self, value):
        return promotion_instant(value, end=self.end).isoformat().replace('+00:00', 'Z')


class PromocionSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source='pk', read_only=True)
    code = serializers.CharField(source='codigo', max_length=40, allow_blank=True, required=False)
    name = serializers.CharField(source='nombre', max_length=150)
    type = serializers.ChoiceField(source='tipo', choices=list(TIPO_TO_CANONICAL.keys()))
    value = serializers.DecimalField(source='valor', max_digits=12, decimal_places=2, min_value=0)
    minAmount = serializers.DecimalField(source='monto_minimo', max_digits=12, decimal_places=2, min_value=0, required=False, default=0)
    maxUses = serializers.IntegerField(source='maximo_usos', min_value=1, allow_null=True, required=False)
    usedCount = serializers.IntegerField(source='usos', read_only=True)
    startsAt = PromotionDateField(source='fecha_inicio', allow_null=True, required=False)
    endsAt = PromotionDateField(source='fecha_fin', allow_null=True, required=False, end=True)
    active = serializers.BooleanField(source='activa', required=False, default=True)

    class Meta:
        model = Promocion
        fields = ('id', 'name', 'code', 'type', 'value', 'minAmount', 'maxUses', 'usedCount', 'startsAt', 'endsAt', 'active')

    def to_internal_value(self, data):
        """Normaliza nombres históricos sin omitir silenciosamente el monto mínimo."""
        if not hasattr(data, 'copy'):
            return super().to_internal_value(data)

        normalized = data.copy()
        aliases = ('monto_minimo', 'montoMinimo', 'minimumAmount', 'minimum_amount')
        provided_aliases = [alias for alias in aliases if alias in normalized]

        if ('minAmount' in normalized and provided_aliases) or len(provided_aliases) > 1:
            raise serializers.ValidationError({
                'minAmount': 'Envia el monto minimo una sola vez usando minAmount.',
            })

        if provided_aliases:
            alias = provided_aliases[0]
            normalized['minAmount'] = normalized.get(alias)
            normalized.pop(alias)

        if 'minAmount' in normalized and isinstance(normalized.get('minAmount'), bool):
            raise serializers.ValidationError({
                'minAmount': 'El monto mínimo debe ser un número válido mayor o igual a cero.',
            })

        return super().to_internal_value(normalized)

    def validate_code(self, value):
        normalized = value.strip().upper()
        if normalized and not re.fullmatch(r'[A-Z0-9]+(?:-[A-Z0-9]+)*', normalized):
            raise serializers.ValidationError('Usa solo letras, numeros y guiones.')
        return normalized

    def validate_type(self, value):
        return TIPO_TO_CANONICAL.get(value, value)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['type'] = TIPO_TO_CANONICAL.get(data.get('type'), data.get('type'))
        return data

    def validate(self, attrs):
        attrs = super().validate(attrs)
        raw_tipo = attrs.get('tipo', getattr(self.instance, 'tipo', None))
        tipo = TIPO_TO_CANONICAL.get(raw_tipo, raw_tipo)
        if 'tipo' in attrs:
            attrs['tipo'] = tipo
        valor = attrs.get('valor', getattr(self.instance, 'valor', 0))
        monto_minimo = attrs.get('monto_minimo', getattr(self.instance, 'monto_minimo', 0))
        inicio = attrs.get('fecha_inicio', getattr(self.instance, 'fecha_inicio', None))
        fin = attrs.get('fecha_fin', getattr(self.instance, 'fecha_fin', None))
        code = attrs.get('codigo', getattr(self.instance, 'codigo', ''))
        if tipo != 'precio_oferta' and not code:
            raise serializers.ValidationError({'code': 'El código del cupón es obligatorio.'})
        if monto_minimo is not None and monto_minimo < 0:
            raise serializers.ValidationError({'minAmount': 'El monto mínimo no puede ser negativo.'})
        if tipo == 'fixed' and valor <= 0:
            raise serializers.ValidationError({'value': 'El monto fijo debe ser mayor que cero.'})
        if tipo == 'percentage' and (valor <= 0 or valor > 100):
            raise serializers.ValidationError({'value': 'El porcentaje debe estar entre 0 y 100.'})
        if tipo == 'free_shipping' and ('tipo' in attrs or 'valor' in attrs):
            attrs['valor'] = 0
        if inicio and fin and fin < inicio:
            raise serializers.ValidationError({'endsAt': 'La fecha de fin no puede ser anterior al inicio.'})
        return attrs


class PromocionesAPIView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated, IsStoreOwner]

    def get(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        rows = Promocion.objects.filter(tienda=tienda).order_by('-fecha_creacion')
        return success_response(data=PromocionSerializer(rows, many=True).data)

    def post(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        serializer = PromocionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                promocion = serializer.save(tienda=tienda)
        except IntegrityError:
            return error_response('Ya existe una promocion con ese codigo.', 'CODIGO_DUPLICADO', status=status.HTTP_409_CONFLICT)
        return success_response(data=PromocionSerializer(promocion).data, mensaje='Promocion creada correctamente.', status=status.HTTP_201_CREATED)


class PromocionDetalleAPIView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated, IsStoreOwner]

    def _get(self, request, promotion_id):
        tienda = resolver_tienda(request, exigir_propietario=True)
        return Promocion.objects.filter(tienda=tienda, pk=promotion_id).first()

    def patch(self, request, promotion_id):
        promocion = self._get(request, promotion_id)
        if not promocion:
            return error_response('La promocion no existe.', 'PROMOCION_NO_ENCONTRADA', status=status.HTTP_404_NOT_FOUND)
        serializer = PromocionSerializer(promocion, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                serializer.save()
        except IntegrityError:
            return error_response('Ya existe una promocion con ese codigo.', 'CODIGO_DUPLICADO', status=status.HTTP_409_CONFLICT)
        return success_response(data=serializer.data, mensaje='Promocion actualizada correctamente.')

    def delete(self, request, promotion_id):
        promocion = self._get(request, promotion_id)
        if not promocion:
            return error_response('La promocion no existe.', 'PROMOCION_NO_ENCONTRADA', status=status.HTTP_404_NOT_FOUND)
        promocion.delete()
        return success_response(mensaje='Promocion eliminada correctamente.')


class ValidarPromocionSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=40, trim_whitespace=True)
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0)
    shipping = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False, default=0)


class ValidarPromocionAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        tienda = resolver_tienda(request)
        serializer = ValidarPromocionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            amounts = calculate_promotion(tienda, data['code'], data['subtotal'], data['shipping'])
        except PromotionError as exc:
            return error_response(str(exc), 'PROMOCION_INVALIDA', status=status.HTTP_400_BAD_REQUEST)
        promotion = amounts.promotion
        canonical_type = TIPO_TO_CANONICAL.get(promotion.tipo, promotion.tipo)
        return success_response(data={
            'code': promotion.codigo,
            'type': canonical_type,
            'discount': format(amounts.discount, '.2f'),
            'shipping': format(amounts.shipping, '.2f'),
            'message': 'Codigo promocional aplicado correctamente.',
        })