from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView
from apps.authentication.presentation.profile import StrictSerializer
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import Pedido
from apps.core.presentation.responses import success_response, error_response
from apps.shipping.models import BlueShipment
from apps.shipping.application import blue_dispatch as service
from apps.shipping.infrastructure.blue_express.operations import pdf_content
from apps.shipping.infrastructure.blue_express.client import BlueExpressAPIError
from apps.shipping.infrastructure.blue_express.config import BlueExpressConfigurationError


class DispatchInput(StrictSerializer):
    accion = serializers.ChoiceField(choices=['emitir','seguimiento','etiquetas','conciliar'])
    bultos = serializers.JSONField(required=False)
    tracking = serializers.CharField(max_length=30, required=False)


class DispatchThrottle(UserRateThrottle):
    rate = '10/min'
    scope = 'blue_dispatch'


class BlueDispatchView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [DispatchThrottle]

    def order(self, request, order_id):
        store = resolver_tienda(request, exigir_propietario=True)
        return get_object_or_404(Pedido, pk=order_id, tienda=store)

    def get(self, request, order_id):
        order = self.order(request, order_id)
        shipment = BlueShipment.objects.filter(order=order).first()
        return success_response(data=service.public_state(shipment))

    def post(self, request, order_id):
        order = self.order(request, order_id)
        serializer = DispatchInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            if data['accion'] == 'emitir':
                shipment = service.emit(order_id=order.pk, store_id=order.tienda_id, packages=data.get('bultos'))
            else:
                shipment = get_object_or_404(BlueShipment, order=order)
                if data['accion'] == 'seguimiento':
                    shipment = service.refresh(shipment=shipment)
                elif data['accion'] == 'etiquetas':
                    shipment = service.retrieve_labels(shipment=shipment)
                else:
                    shipment = service.reconcile(shipment=shipment, number=data.get('tracking'))
        except BlueExpressConfigurationError as error:
            return error_response(str(error), 'BLUE_NO_DISPONIBLE', status=503)
        except service.DispatchConflict as error:
            return error_response(str(error), 'BLUE_DESPACHO_CONFLICTO', status=409)
        except ValueError as error:
            return error_response(str(error), 'BLUE_DATOS_INVALIDOS', status=400)
        except BlueExpressAPIError as error:
            return error_response(str(error), 'BLUE_PROVEEDOR_ERROR', status=502)
        return success_response(data=service.public_state(shipment))

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response['Cache-Control'] = 'no-store'
        return response


class BlueLabelView(BlueDispatchView):
    http_method_names = ['get', 'head', 'options']

    def get(self, request, order_id, index):
        order = self.order(request, order_id)
        shipment = get_object_or_404(BlueShipment, order=order, state='emitted')
        if index >= len(shipment.labels):
            from rest_framework.exceptions import NotFound
            raise NotFound('Etiqueta no encontrada.')
        response = HttpResponse(pdf_content(shipment.labels[index]), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="blue-{shipment.tracking_number}-{index + 1}.pdf"'
        response['X-Content-Type-Options'] = 'nosniff'
        return response
