"""Cotización administrativa de Blue Express."""

from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.authentication.presentation.profile import StrictSerializer
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.presentation.responses import error_response, success_response

from apps.shipping.infrastructure.blue_express.client import (
    BlueExpressAPIError,
    BlueExpressTimeoutError,
)
from apps.shipping.infrastructure.blue_express.config import (
    BlueExpressConfigurationError,
)
from apps.shipping.infrastructure.blue_express.geography import (
    BlueExpressDestinationError,
)
from apps.shipping.infrastructure.blue_express.origin import (
    BlueExpressOriginError,
)
from apps.shipping.infrastructure.blue_express.packages import (
    BlueExpressCatalogError,
)
from apps.shipping.infrastructure.blue_express.quotation import (
    BlueExpressPackageError,
)
from apps.shipping.infrastructure.blue_express.quote_tokens import (
    BlueExpressQuoteError,
)
from apps.shipping.infrastructure.blue_express.service import (
    BlueExpressCartError,
    quote_catalog_product,
)


class BlueDestinationSerializer(StrictSerializer):
    region_code = serializers.IntegerField(min_value=1)
    commune_code = serializers.IntegerField(min_value=1)
    district_code = serializers.CharField(max_length=3)


class BlueQuoteSerializer(StrictSerializer):
    producto_id = serializers.CharField(max_length=100)
    sku = serializers.CharField(max_length=100)
    cantidad = serializers.IntegerField(min_value=1, max_value=1)
    destino = BlueDestinationSerializer()

    def validate(self, data):
        if type(self.initial_data.get("cantidad")) is not int:
            raise serializers.ValidationError({
                "cantidad": "La cantidad debe ser el entero 1."
            })
        return data


class BlueShippingQuoteAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # La tienda se resuelve en el backend y se verifica su propietario.
        tienda = resolver_tienda(request, exigir_propietario=True)

        serializer = BlueQuoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            quote = quote_catalog_product(
                store_id=tienda.pk,
                product_id=data["producto_id"],
                sku=data["sku"],
                quantity=data["cantidad"],
                destination=data["destino"],
            )
        except BlueExpressConfigurationError:
            return error_response(
                "Blue Express no está habilitado o su configuración está incompleta.",
                "BLUE_NO_DISPONIBLE",
                status=503,
            )
        except BlueExpressTimeoutError:
            return error_response(
                "Blue Express tardó demasiado en responder.",
                "BLUE_TIMEOUT",
                status=504,
            )
        except BlueExpressAPIError:
            return error_response(
                "No se pudo obtener una cotización válida de Blue Express.",
                "BLUE_PROVEEDOR_ERROR",
                status=502,
            )
        except (
            BlueExpressDestinationError,
            BlueExpressOriginError,
            BlueExpressCatalogError,
            BlueExpressPackageError,
            BlueExpressCartError,
            BlueExpressQuoteError,
        ) as error:
            return error_response(
                str(error),
                "BLUE_DATOS_INVALIDOS",
                status=400,
            )

        response = success_response(
            data=quote,
            mensaje="Cotización obtenida. No se ha generado un despacho.",
        )
        response["Cache-Control"] = "no-store"
        return response