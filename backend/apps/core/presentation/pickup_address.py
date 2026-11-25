from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.infrastructure.pickup_address import configured, search_addresses, AddressProviderError
from apps.core.presentation.responses import success_response, error_response
from apps.core.shipping import validate_destination


class AddressThrottle(UserRateThrottle):
    rate = '20/min'
    scope = 'pickup_address'


class PickupAddressAPIView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [AddressThrottle]

    def get(self, request):
        resolver_tienda(request, exigir_propietario=True)
        return success_response(data={'configured': bool(configured()), 'provider': 'google' if configured() else None})

    def post(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        fields = {key: serializers.CharField(max_length=200) for key in ('region', 'comuna', 'query')}
        class QuerySerializer(serializers.Serializer):
            pass
        serializer = QuerySerializer(data=request.data)
        serializer.fields.update(fields)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        region = validate_destination(data['region'], data['comuna'])
        try:
            rows = search_addresses(tienda, region, data['comuna'], data['query'])
        except AddressProviderError as error:
            return error_response(str(error), 'DIRECCIONES_NO_DISPONIBLES', status=503)
        response = success_response(data=rows)
        response['Cache-Control'] = 'no-store'
        return response
