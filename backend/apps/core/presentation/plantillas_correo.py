"""Plantillas de correo de la tienda, editables únicamente por su propietario."""
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.core.domain.plantillas_correo import TIPOS, plantilla_de_tienda, construir_correo
from apps.core.domain.plantillas_correo.base import correo_comprador
from apps.core.domain.plantillas_correo.fields import FIELDS, REQUIRED, validate_markers, validate_template
from apps.core.infrastructure.email_service import correo_enmascarado, enviar_correo, correo_valido
from apps.core.infrastructure.notificaciones_pedido import enviar_correo_manual
from apps.core.infrastructure.tenant import resolver_tienda
from apps.core.models import ConfiguracionCorreo, Pedido
from apps.core.presentation.responses import error_response, success_response


def _variables_validas(texto):
    try:
        validate_markers(texto)
    except ValueError as error:
        raise serializers.ValidationError(str(error)) from error
    return texto


class PlantillaSerializer(serializers.Serializer):
    enabled = serializers.BooleanField()
    subject = serializers.CharField(max_length=200, validators=[_variables_validas])
    preheader = serializers.CharField(max_length=200, allow_blank=True, validators=[_variables_validas])
    body = serializers.CharField(max_length=5000, validators=[_variables_validas])


class PlantillasCorreoSerializer(serializers.Serializer):
    plantillas = serializers.DictField(child=PlantillaSerializer())

    def validate_plantillas(self, valor):
        desconocidos = set(valor) - set(TIPOS)
        if desconocidos:
            raise serializers.ValidationError(f'Tipos de correo desconocidos: {", ".join(sorted(desconocidos))}.')
        for tipo, plantilla in valor.items():
            try:
                validate_template(plantilla)
            except ValueError as error:
                raise serializers.ValidationError({tipo: str(error)}) from error
        return valor


def _plantillas_de(tienda):
    resultado = {}
    for tipo, (_, por_defecto) in TIPOS.items():
        personalizada, activa = plantilla_de_tienda(tienda, tipo)
        plantilla = personalizada or por_defecto
        resultado[tipo] = {
            'enabled': activa, 'subject': plantilla.asunto,
            'preheader': plantilla.preheader, 'body': plantilla.cuerpo,
        }
    return resultado


def _por_defecto():
    """Plantillas por defecto del sistema: lo que devuelve el botón «Restaurar plantilla»."""
    return {
        tipo: {'enabled': True, 'subject': p.asunto, 'preheader': p.preheader, 'body': p.cuerpo}
        for tipo, (_, p) in TIPOS.items()
    }


def _datos(tienda):
    return {'plantillas': _plantillas_de(tienda), 'por_defecto': _por_defecto(),
            'variables': FIELDS, 'obligatorias': {tipo: list(REQUIRED) for tipo in TIPOS}}


class PlantillasCorreoAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        response = success_response(data=_datos(tienda))
        response['Cache-Control'] = 'no-store'
        return response

    def put(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        serializer = PlantillasCorreoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        config, _ = ConfiguracionCorreo.objects.get_or_create(tienda=tienda)
        config.plantillas = {**config.plantillas, **serializer.validated_data['plantillas']}
        config.save()
        response = success_response(data=_datos(tienda), mensaje='Plantillas de correo guardadas.')
        response['Cache-Control'] = 'no-store'
        return response


class EnviarCorreoManualPedidoAPIView(APIView):
    """POST /api/tienda/pedidos/<id_pedido>/enviar-correo/ -> Envío manual de emergencia."""
    permission_classes = [IsAuthenticated]

    def post(self, request, id_pedido):
        tienda = resolver_tienda(request, exigir_propietario=True)
        tipo = request.data.get('tipo')
        if not tipo or tipo not in TIPOS:
            return error_response(
                mensaje=f"Tipo de correo no válido. Opciones: {', '.join(TIPOS.keys())}",
                codigo="TIPO_INVALIDO",
                status=status.HTTP_400_BAD_REQUEST,
            )

        pedido = get_object_or_404(
            Pedido.objects.filter(tienda=tienda).prefetch_related('itempedido_set'),
            id_pedido=id_pedido
        )

        destinatario_override = (request.data.get('destinatario') or '').strip() or None
        resultado = enviar_correo_manual(pedido, tipo, destinatario_override=destinatario_override)

        if resultado.enviado:
            destinatario_final = destinatario_override or correo_comprador(pedido)
            enmascarado = correo_enmascarado(destinatario_final)
            if resultado.codigo == 'enviado_local':
                msg = f"Correo enviado al buzón local Mailpit (http://localhost:8025). En producción se enviará a {enmascarado}."
            else:
                msg = f"Correo enviado exitosamente a {enmascarado}."
            return success_response(
                data={
                    'enviado': True,
                    'codigo': resultado.codigo,
                    'tipo': tipo,
                    'destinatario': enmascarado,
                    'notificaciones': (pedido.entrega or {}).get('notificaciones', {}),
                },
                mensaje=msg,
            )
        else:
            return error_response(
                mensaje=f"No se pudo enviar el correo: {resultado.detalle or resultado.codigo}",
                codigo="ERROR_ENVIO_CORREO",
                detalles={'codigo': resultado.codigo, 'detalle': resultado.detalle},
                status=status.HTTP_400_BAD_REQUEST,
            )


class ProbarCorreoEventoAPIView(APIView):
    """POST /api/tienda/correos/enviar-manual/ -> Envío manual/prueba desde el panel de correos."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tienda = resolver_tienda(request, exigir_propietario=True)
        tipo = request.data.get('tipo')
        if not tipo or tipo not in TIPOS:
            return error_response(
                mensaje=f"Tipo de correo no válido. Opciones: {', '.join(TIPOS.keys())}",
                codigo="TIPO_INVALIDO",
                status=status.HTTP_400_BAD_REQUEST,
            )

        id_pedido = request.data.get('id_pedido')
        destinatario = (request.data.get('destinatario') or '').strip()

        if id_pedido:
            pedido = Pedido.objects.filter(tienda=tienda, id_pedido=id_pedido).prefetch_related('itempedido_set').first()
            if not pedido:
                return error_response(
                    mensaje="El pedido especificado no existe en tu tienda.",
                    codigo="PEDIDO_NO_ENCONTRADO",
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            # Buscar el último pedido de la tienda para usar datos reales
            pedido = Pedido.objects.filter(tienda=tienda).prefetch_related('itempedido_set').order_by('-id_pedido').first()

        if pedido:
            resultado = enviar_correo_manual(pedido, tipo, destinatario_override=destinatario or None)
            destinatario_reportado = destinatario or correo_comprador(pedido)
        else:
            # Si la tienda aún no tiene pedidos, renderizar con datos de demostración
            if not destinatario or not correo_valido(destinatario):
                return error_response(
                    mensaje="Ingresa un correo electrónico de destino válido.",
                    codigo="DESTINATARIO_REQUERIDO",
                    status=status.HTTP_400_BAD_REQUEST,
                )
            renderizar, por_defecto = TIPOS[tipo]
            personalizada, _ = plantilla_de_tienda(tienda, tipo)
            plantilla = personalizada or por_defecto
            contexto = {
                'orderNumber': 'ORD-DEMO-001',
                'customerName': 'Cliente de Prueba',
                'customerEmail': destinatario,
                'orderTotal': '$24.990',
                'orderSummary': '- Producto de Demostración x 1: $24.990',
                'shippingMethod': 'Envío a Domicilio',
                'carrier': 'Starken',
                'trackingCode': 'STRK-12345678',
                'trackingLink': 'http://localhost:5173/seguimiento?orden=ORD-DEMO-001',
                'storeName': tienda.nombre or 'Mi Tienda',
            }
            correo_render = plantilla.renderizar(contexto)
            resultado = enviar_correo(
                destinatario, correo_render.asunto, correo_render.cuerpo,
                preheader=correo_render.preheader, nombre_remitente=tienda.nombre,
                referencia=f"demo {tipo}",
                reply_to=tienda.correo_negocio or '',
            )
            destinatario_reportado = destinatario

        if resultado.enviado:
            enmascarado = correo_enmascarado(destinatario_reportado)
            if resultado.codigo == 'enviado_local':
                msg = f"Correo de emergencia enviado al buzón local Mailpit (http://localhost:8025). En producción se enviará a {enmascarado}."
            else:
                msg = f"Correo de emergencia enviado exitosamente a {enmascarado}."
            return success_response(
                data={
                    'enviado': True,
                    'codigo': resultado.codigo,
                    'destinatario': enmascarado,
                },
                mensaje=msg,
            )
        else:
            return error_response(
                mensaje=f"No se pudo enviar el correo: {resultado.detalle or resultado.codigo}",
                codigo="ERROR_ENVIO_CORREO",
                detalles={'codigo': resultado.codigo, 'detalle': resultado.detalle},
                status=status.HTTP_400_BAD_REQUEST,
            )
