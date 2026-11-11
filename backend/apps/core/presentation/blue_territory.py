"""Catálogo territorial de Blue Express para el checkout."""

from hashlib import sha256

from django.conf import settings
from django.core.cache import cache

from rest_framework.permissions import AllowAny
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from apps.core.delivery import delivery_for_store
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.presentation.responses import error_response, success_response
from apps.shipping.infrastructure.blue_express.client import (
    BlueExpressAPIError,
    BlueExpressTimeoutError,
)
from apps.shipping.infrastructure.blue_express.config import (
    BlueExpressConfigurationError,
    get_service_config,
)
from apps.shipping.infrastructure.blue_express.geography import fetch_geography


TERRITORY_CACHE_SECONDS = 60 * 60


class BlueTerritoryThrottle(SimpleRateThrottle):
    scope = "blue_public_territory"
    rate = "20/min"

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class BlueTerritoryAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [BlueTerritoryThrottle]

    def get(self, request):
        tienda = resolver_tienda(request)

        enabled = delivery_for_store(tienda)["blue_express"]["enabled"]
        commercially_ready = getattr(
            settings,
            "BLUE_EXPRESS_CHECKOUT_TOTAL_CONFIRMED",
            False,
        )

        if not enabled or not commercially_ready:
            return error_response(
                "Blue Express no está disponible para esta compra.",
                "BLUE_NO_DISPONIBLE",
                status=503,
            )

        try:
            config = get_service_config("geo")

            # Separa la caché por tienda y configuración.
            # Los secretos no aparecen directamente en la clave.
            fingerprint = sha256(
                repr((
                    config["environment"],
                    config["url"],
                    config["client_account"],
                    config["usercode"],
                    config["token"],
                )).encode("utf-8")
            ).hexdigest()

            cache_key = f"blue:territory:v1:{tienda.pk}:{fingerprint}"
            regions = cache.get(cache_key)

            if regions is None:
                regions = fetch_geography()
                cache.set(
                    cache_key,
                    regions,
                    timeout=TERRITORY_CACHE_SECONDS,
                )

        except BlueExpressConfigurationError:
            return error_response(
                "El catálogo territorial de Blue no está disponible.",
                "BLUE_NO_DISPONIBLE",
                status=503,
            )
        except BlueExpressTimeoutError:
            return error_response(
                "Blue Express tardó demasiado. Intenta nuevamente.",
                "BLUE_TIMEOUT",
                status=504,
            )
        except BlueExpressAPIError:
            return error_response(
                "No se pudo obtener el catálogo territorial.",
                "BLUE_PROVEEDOR_ERROR",
                status=502,
            )

        return success_response(data={"regiones": regions})

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(
            request, response, *args, **kwargs
        )
        response["Cache-Control"] = "no-store"
        return response