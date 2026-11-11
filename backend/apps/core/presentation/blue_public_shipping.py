"""Cotización pública de Blue Express para el checkout."""

from django.conf import settings

from rest_framework import serializers
from apps.authentication.presentation.profile import StrictSerializer
from apps.core.presentation.blue_shipping import BlueDestinationSerializer
from apps.shipping.infrastructure.blue_express.cart import normalize_items, BlueExpressCartError as CartValidationError
from rest_framework.permissions import AllowAny
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from apps.core.delivery import delivery_for_store
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.presentation.blue_shipping import BlueQuoteSerializer
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
    quote_catalog_cart,
)


class BlueCartQuoteSerializer(StrictSerializer):
    items = serializers.JSONField()
    destino = BlueDestinationSerializer()

    def validate_items(self, value):
        try:
            return normalize_items(value)
        except CartValidationError as error:
            raise serializers.ValidationError(str(error)) from None


class BluePublicQuoteThrottle(SimpleRateThrottle):
    scope = "blue_public_quote"
    rate = "10/min"

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class BluePublicShippingQuoteAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [BluePublicQuoteThrottle]

    def post(self, request):
        tienda = resolver_tienda(request)

        delivery = delivery_for_store(tienda)
        commercially_ready = getattr(
            settings,
            "BLUE_EXPRESS_CHECKOUT_TOTAL_CONFIRMED",
            False,
        )

        if (
            not commercially_ready
            or not delivery["blue_express"]["enabled"]
        ):
            return error_response(
                "Blue Express no está disponible para esta compra.",
                "BLUE_NO_DISPONIBLE",
                status=503,
            )

        serializer_class = BlueCartQuoteSerializer if "items" in request.data else BlueQuoteSerializer
        serializer = serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            if "items" in data:
                quote = quote_catalog_cart(store_id=tienda.pk, items=data["items"], destination=data["destino"])
            else:
                quote = quote_catalog_product(
                    store_id=tienda.pk, product_id=data["producto_id"], sku=data["sku"],
                    quantity=data["cantidad"], destination=data["destino"],
                )
        except BlueExpressConfigurationError:
            return error_response(
                "Blue Express no está disponible.",
                "BLUE_NO_DISPONIBLE",
                status=503,
            )
        except BlueExpressTimeoutError:
            return error_response(
                "La cotización tardó demasiado. Intenta nuevamente.",
                "BLUE_TIMEOUT",
                status=504,
            )
        except BlueExpressAPIError:
            return error_response(
                "No se pudo obtener una cotización de Blue Express.",
                "BLUE_PROVEEDOR_ERROR",
                status=502,
            )
        except (
            BlueExpressDestinationError,
            BlueExpressOriginError,
            BlueExpressCatalogError,
            BlueExpressPackageError,
            BlueExpressCartError,
            CartValidationError,
            BlueExpressQuoteError,
        ):
            return error_response(
                "No se puede cotizar este carrito para el destino seleccionado.",
                "BLUE_DATOS_INVALIDOS",
                status=400,
            )

        return success_response(
            data=quote,
            mensaje="Cotización obtenida.",
        )

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(
            request, response, *args, **kwargs
        )
        response["Cache-Control"] = "no-store"
        return response