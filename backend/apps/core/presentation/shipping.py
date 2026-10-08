from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.authentication.presentation.profile import StrictSerializer
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.presentation.responses import success_response
from apps.core.shipping import issue_quote


class ShippingQuoteSerializer(StrictSerializer):
    operador = serializers.ChoiceField(choices=['Chilexpress', 'Starken'])
    region = serializers.CharField(max_length=100)
    comuna = serializers.CharField(max_length=100)


class ShippingQuoteAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        tienda = resolver_tienda(request)
        serializer = ShippingQuoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        quote = issue_quote(tienda, **serializer.validated_data)
        return success_response(data={'tarifas': [quote]})
