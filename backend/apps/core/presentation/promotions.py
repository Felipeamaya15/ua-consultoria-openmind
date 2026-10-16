from django.db import IntegrityError
from rest_framework import serializers, status
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from apps.authentication.permissions import IsStoreOwner
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import Promocion
from apps.core.promotions import PromotionError, calculate_promotion
from apps.core.presentation.responses import error_response, success_response


class PromocionSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source='pk', read_only=True)
    code = serializers.CharField(source='codigo', max_length=40)
    name = serializers.CharField(source='nombre', max_length=150)
    type = serializers.ChoiceField(source='tipo', choices=Promocion.TIPOS_CODIGO)
    value = serializers.DecimalField(source='valor', max_digits=12, decimal_places=2)
    minAmount = serializers.DecimalField(source='monto_minimo', max_digits=12, decimal_places=2, required=False, default=0)
    maxUses = serializers.IntegerField(source='maximo_usos', min_value=1, allow_null=True, required=False)
    usedCount = serializers.IntegerField(source='usos', read_only=True)
    startsAt = serializers.DateField(source='fecha_inicio')
    endsAt = serializers.DateField(source='fecha_fin', allow_null=True, required=False)
    active = serializers.BooleanField(source='activa', required=False, default=True)

    class Meta:
        model = Promocion
        fields = ('id', 'name', 'code', 'type', 'value', 'minAmount', 'maxUses', 'usedCount', 'startsAt', 'endsAt', 'active')

    def validate_code(self, value):
        normalized = value.strip().upper()
        if not normalized or not normalized.replace('-', '').isalnum():
            raise serializers.ValidationError('Usa solo letras, numeros y guiones.')
        return normalized

    def validate(self, attrs):
        attrs = super().validate(attrs)
        tipo = attrs.get('tipo', getattr(self.instance, 'tipo', None))
        valor = attrs.get('valor', getattr(self.instance, 'valor', 0))
        inicio = attrs.get('fecha_inicio', getattr(self.instance, 'fecha_inicio', None))
        fin = attrs.get('fecha_fin', getattr(self.instance, 'fecha_fin', None))
        if tipo == Promocion.TIPO_MONTO_FIJO and valor <= 0:
            raise serializers.ValidationError({'value': 'El monto fijo debe ser mayor que cero.'})
        if tipo == Promocion.TIPO_PORCENTAJE and (valor <= 0 or valor > 100):
            raise serializers.ValidationError({'value': 'El porcentaje debe estar entre 0 y 100.'})
        if tipo == Promocion.TIPO_ENVIO_GRATIS:
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
        return success_response(data={
            'code': promotion.codigo,
            'type': promotion.tipo,
            'discount': format(amounts.discount, '.2f'),
            'shipping': format(amounts.shipping, '.2f'),
            'message': 'Codigo promocional aplicado correctamente.',
        })
