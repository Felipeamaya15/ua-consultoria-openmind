from django.core.exceptions import ValidationError
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.core.image_processing import process_upload
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.presentation.responses import success_response


class ProcessImageAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        resolver_tienda(request, exigir_propietario=True)
        fields = ImageRequestSerializer(data=request.data)
        fields.is_valid(raise_exception=True)
        try:
            image = process_upload(fields.validated_data['imagen'], fields.validated_data['max_mb'])
        except ValidationError as error:
            raise serializers.ValidationError({'imagen': error.messages}) from error
        response = success_response(data={'url': image.url, 'mime': image.mime, 'ancho': image.width, 'alto': image.height, 'convertida': image.converted})
        response['Cache-Control'] = 'no-store'
        return response


class ImageRequestSerializer(serializers.Serializer):
    imagen = serializers.FileField()
    max_mb = serializers.ChoiceField(choices=(1, 2, 3), default=2)
