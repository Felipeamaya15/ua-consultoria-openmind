from rest_framework import serializers
from apps.core.models import Producto, Tienda, Usuario, VarianteProducto, Pedido, ItemPedido

class ProductoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Producto
        fields = '__all__'

class VarianteProductoSerializer(serializers.ModelSerializer):
    stock = serializers.IntegerField(min_value=0, required=False)

    class Meta:
        model = VarianteProducto
        fields = [
            'id_variante',
            'id_producto',
            'sku',
            'precio',
            'stock',
            'atributos',
            'es_activa',
            'fecha_creacion',
        ]
        read_only_fields = [
            'id_variante',
            'id_producto',
            'fecha_creacion',
        ]

    def validate_atributos(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError(
                "Los atributos de la variante deben enviarse como un objeto."
            )

        if not value:
            raise serializers.ValidationError(
                "La variante debe incluir al menos un atributo."
            )

        atributos_validados = {}

        for clave, valor in value.items():
            if not isinstance(clave, str) or not clave.strip():
                raise serializers.ValidationError(
                    "Cada atributo debe tener un nombre válido."
                )

            clave_limpia = clave.strip()

            if clave_limpia in atributos_validados:
                raise serializers.ValidationError(
                    f"El atributo '{clave_limpia}' está repetido."
                )

            if valor is None:
                raise serializers.ValidationError(
                    f"El atributo '{clave_limpia}' debe tener un valor."
                )

            if isinstance(valor, str):
                valor = valor.strip()

                if not valor:
                    raise serializers.ValidationError(
                        f"El atributo '{clave_limpia}' debe tener un valor."
                    )

            elif isinstance(valor, (dict, list)):
                raise serializers.ValidationError(
                    f"El atributo '{clave_limpia}' debe tener un valor simple."
                )

            atributos_validados[clave_limpia] = valor

        return atributos_validados

    def validate_sku(self, value):
        sku_formateado = value.strip().upper()

        if not sku_formateado:
            raise serializers.ValidationError(
                "El SKU no puede ser una cadena vacía."
            )

        return sku_formateado

    def validate(self, data):
        # Al crear una variante, los atributos deben estar definidos.
        if self.instance is None and 'atributos' not in data:
            raise serializers.ValidationError(
                {
                    "atributos": (
                        "La variante debe incluir al menos un atributo."
                    )
                }
            )

        # Determinamos el producto desde el contexto o desde
        # la instancia existente.
        id_producto = self.context.get('id_producto')

        if not id_producto and self.instance:
            id_producto = self.instance.id_producto

        # En una actualización parcial, si no se envían atributos,
        # se conservan los de la variante existente.
        atributos = data.get(
            'atributos',
            self.instance.atributos if self.instance else {},
        )

        # Se mantiene la validación existente para impedir
        # combinaciones de atributos duplicadas.
        if id_producto and atributos:
            consulta = VarianteProducto.objects.filter(
                id_producto=id_producto,
                atributos=atributos,
            )

            if self.instance:
                consulta = consulta.exclude(pk=self.instance.pk)

            if consulta.exists():
                raise serializers.ValidationError(
                    {
                        "atributos": (
                            "Ya existe otra variante con esta misma "
                            "combinación de atributos para este producto."
                        )
                    }
                )

        return data


class CompraItemInputSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if isinstance(data, dict) and (isinstance(data.get("cantidad"), bool) or not isinstance(data.get("cantidad"), int)):
            raise serializers.ValidationError({"cantidad": "La cantidad debe ser un entero positivo."})
        return super().to_internal_value(data)

    # El catálogo real vive en MongoDB e identifica cada variante por SKU,
    # no por un ID de la tabla VarianteProducto (que no se usa en la práctica).
    sku = serializers.CharField(max_length=100)
    cantidad = serializers.IntegerField(min_value=1)


from apps.authentication.presentation.profile import StrictSerializer


class RegistrarCompraSerializer(StrictSerializer):
    # Contacto de la compra; la identidad autenticada procede de request.user.
    clave_checkout = serializers.UUIDField(required=False)
    nombre_contacto = serializers.CharField(max_length=150, required=False, allow_blank=True)
    correo_contacto = serializers.EmailField(max_length=320, required=False, allow_blank=True)
    telefono_contacto = serializers.CharField(max_length=30, required=False, allow_blank=True, default='')

    metodo_pago = serializers.CharField(
        required=True,
        error_messages={'required': 'Debe seleccionar un medio de pago.'}
    )
    items = CompraItemInputSerializer(many=True)

    def validate(self, data):
        if not data.get('nombre_contacto') or not data.get('correo_contacto'):
            raise serializers.ValidationError(
                "Debe iniciar sesión o completar los datos de contacto para continuar como invitado."
            )
        return data

    def validate_metodo_pago(self, value):
        tienda_id = self.context.get('tienda')
        if not tienda_id:
            raise serializers.ValidationError(
                "Falta el identificador de la tienda en el contexto."
            )

        from apps.core.models import (
            ConfiguracionPago,
            ConfiguracionTransbank,
            ConfiguracionPayPal,
            ConfiguracionMercadoPago,
        )

        normalizado = str(value).strip().lower()
        if normalizado == 'transbank':
            habilitado = ConfiguracionTransbank.objects.filter(
                id_tienda_id=tienda_id,
                activo=True,
            ).exists()

        elif normalizado == 'paypal':
            habilitado = ConfiguracionPayPal.objects.filter(
                id_tienda_id=tienda_id,
                activo=True,
            ).exists()

        elif normalizado in {'mercadopago', 'mercado_pago', 'mercado pago'}:
            habilitado = ConfiguracionMercadoPago.objects.filter(
                id_tienda_id=tienda_id,
                activo=True,
            ).exists()

        elif normalizado in {'transferencia', 'transfer'}:
            try:
                config_pago = ConfiguracionPago.objects.get(tienda_id=tienda_id)
                datos = config_pago.datos or {}
                # La UI guarda 'transfer'; se acepta también la clave tal como llega ('Transferencia').
                metodo = datos.get('transfer') or datos.get(str(value), {})
                habilitado = (
                    isinstance(metodo, dict)
                    and metodo.get('enabled', False) is True
                )
            except ConfiguracionPago.DoesNotExist:
                habilitado = False

        else:
            habilitado = False

        if not habilitado:
            raise serializers.ValidationError(
                f"El método de pago '{value}' no está habilitado para esta tienda."
            )

        return value

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError(
                "Debe incluir al menos un producto en la compra."
            )
        return items


class DeliveryBooleanField(serializers.BooleanField):
    def to_internal_value(self, data):
        if not isinstance(data, bool):
            self.fail('invalid', input=data)
        return super().to_internal_value(data)


class DeliveryStringField(serializers.CharField):
    def to_internal_value(self, data):
        if not isinstance(data, str):
            self.fail('invalid')
        return super().to_internal_value(data)


class PickupLocationSerializer(StrictSerializer):
    region = DeliveryStringField(allow_blank=True, max_length=200)
    comuna = DeliveryStringField(allow_blank=True, max_length=200)
    street = DeliveryStringField(allow_blank=True, max_length=200)
    number = DeliveryStringField(allow_blank=True, max_length=50)
    reference = DeliveryStringField(allow_blank=True, max_length=500)
    verification = DeliveryStringField(allow_blank=True, max_length=4096)


class PickupDaySerializer(StrictSerializer):
    enabled = DeliveryBooleanField()
    start = DeliveryStringField(allow_blank=True, max_length=5)
    end = DeliveryStringField(allow_blank=True, max_length=5)


class PickupHoursSerializer(StrictSerializer):
    mon = PickupDaySerializer()
    tue = PickupDaySerializer()
    wed = PickupDaySerializer()
    thu = PickupDaySerializer()
    fri = PickupDaySerializer()
    sat = PickupDaySerializer()
    sun = PickupDaySerializer()


class PickupConfigurationSerializer(StrictSerializer):
    validation_method = serializers.CharField(read_only=True)
    enabled = DeliveryBooleanField()
    address = DeliveryStringField(allow_blank=True, max_length=1500)
    schedule = DeliveryStringField(allow_blank=True, max_length=500)
    version = serializers.ChoiceField(choices=[2], required=False)
    location = PickupLocationSerializer(required=False)
    hours = PickupHoursSerializer(required=False)
    legacy_address = DeliveryStringField(allow_blank=True, max_length=500, required=False)
    legacy_schedule = DeliveryStringField(allow_blank=True, max_length=500, required=False)

    def validate(self, data):
        if data.get('version') != 2 and len(data.get('address', '')) > 500:
            raise serializers.ValidationError({'address': 'La dirección antigua admite hasta 500 caracteres.'})
        return data


class ShippingRateSerializer(StrictSerializer):
    region = DeliveryStringField(max_length=100)
    comuna = DeliveryStringField(max_length=100)
    monto = serializers.IntegerField(min_value=0, max_value=9999999999)
    plazo_dias = serializers.IntegerField(min_value=1, max_value=365, allow_null=True, default=None)

    def validate(self, data):
        from apps.core.shipping import validate_destination
        if any(key not in data for key in ('region', 'comuna', 'monto')):
            raise serializers.ValidationError('Cada tarifa requiere región, comuna y monto, también en PATCH.')
        data['region'] = validate_destination(data['region'], data['comuna'])
        return data


class CarrierConfigurationSerializer(StrictSerializer):
    enabled = DeliveryBooleanField()
    tarifas = ShippingRateSerializer(many=True, required=False, max_length=1000)
    # Reservados para compatibilidad de forma; las credenciales reales quedan fuera de este sprint.
    accountId = DeliveryStringField(allow_blank=True, max_length=200, required=False)
    apiKey = DeliveryStringField(allow_blank=True, max_length=500, required=False)
    status = serializers.ChoiceField(choices=['not_configured'], required=False)

    def validate(self, data):
        if data.get('accountId') or data.get('apiKey'):
            raise serializers.ValidationError('El guardado de credenciales de transportistas todavía no está disponible.')
        destinations = [(rate['region'], rate['comuna']) for rate in data.get('tarifas', [])]
        if len(destinations) != len(set(destinations)):
            raise serializers.ValidationError({'tarifas': 'Solo puede existir una tarifa por región y comuna.'})
        return data


class ShippingConfigurationSerializer(StrictSerializer):
    chilexpress = CarrierConfigurationSerializer()
    starken = CarrierConfigurationSerializer()
    pickup = PickupConfigurationSerializer()


class ConfiguracionPagoSerializer(serializers.Serializer):
    """ Valida que no se habiliten medios de pago sin sus campos obligatorios (SCRUM-306) """

    REQUIRED_FIELDS_BY_METHOD = {
        'transbank': ['api_key', 'codigo_comercio'],
        'mercadopago': ['public_key', 'access_token'],
        'paypal': ['client_id', 'client_secret'],
        'linkify': ['idCuenta', 'clavePrivada'],
        'transfer': [
            'bank_name',
            'account_type',
            'account_number',
            'holder_rut',
            'holder_name',
            'confirmation_email',
        ],
    }
    FIELD_LABELS = {
        'idCuenta': 'ID de cuenta',
        'clavePrivada': 'Clave privada',
        'bank_name': 'Banco',
        'account_type': 'Tipo de cuenta',
        'account_number': 'N° de cuenta',
        'holder_rut': 'RUT del titular',
        'holder_name': 'Nombre del titular',
        'confirmation_email': 'Correo para comprobantes',
    }

    def to_internal_value(self, data):
        return data  # Permitimos la estructura dinámica del JSON

    def validate(self, data):
        if not isinstance(data, dict):
            raise serializers.ValidationError("La configuración debe ser un objeto JSON válido.")

        errores_metodos = {}

        for method_id, method_data in data.items():
            if not isinstance(method_data, dict):
                raise serializers.ValidationError({method_id: 'La configuración del método debe ser un objeto.'})
                
            is_enabled = method_data.get('enabled')
            if not isinstance(is_enabled, bool):
                raise serializers.ValidationError({method_id: 'enabled debe ser un booleano.'})
            fields = method_data.get('fields', {})
            if not isinstance(fields, dict):
                raise serializers.ValidationError({method_id: 'fields debe ser un objeto.'})
            if method_id == 'linkify':
                field_errors = []
                string_fields = (
                    'idCuenta', 'clavePrivada', 'environment', 'expirationHours',
                    'returnUrl', 'notificationEmail', 'syncApprovedPayments',
                    'emailCustomer', 'autoExpireLinks',
                )
                for field in string_fields:
                    if field in fields and not isinstance(fields[field], str):
                        field_errors.append(f'{field} debe ser texto.')

                environment = fields.get('environment')
                if isinstance(environment, str) and environment not in ('sandbox', 'production'):
                    field_errors.append('Ambiente no es válido.')

                id_cuenta = fields.get('idCuenta')
                if isinstance(id_cuenta, str) and len(id_cuenta) > 200:
                    field_errors.append('ID de cuenta no puede superar 200 caracteres.')

                clave_privada = fields.get('clavePrivada')
                if isinstance(clave_privada, str) and len(clave_privada) > 500:
                    field_errors.append('Clave privada no puede superar 500 caracteres.')

                expiration = fields.get('expirationHours')
                if isinstance(expiration, str) and (
                    not expiration.isdigit() or not 1 <= int(expiration) <= 8760
                ):
                    field_errors.append('Vencimiento del link debe ser un entero entre 1 y 8760 horas.')

                return_url = fields.get('returnUrl')
                if isinstance(return_url, str) and return_url:
                    try:
                        serializers.URLField().run_validation(return_url)
                        if not return_url.startswith('https://'):
                            field_errors.append('URL de retorno debe usar HTTPS.')
                    except serializers.ValidationError:
                        field_errors.append('URL de retorno no es válida.')

                notification_email = fields.get('notificationEmail')
                if isinstance(notification_email, str) and notification_email:
                    try:
                        serializers.EmailField().run_validation(notification_email)
                    except serializers.ValidationError:
                        field_errors.append('Correo de notificaciones no es válido.')

                for field in ('syncApprovedPayments', 'emailCustomer', 'autoExpireLinks'):
                    value = fields.get(field)
                    if isinstance(value, str) and value not in ('true', 'false'):
                        field_errors.append(f'{field} debe ser verdadero o falso.')

                if field_errors:
                    errores_metodos[method_id] = ' '.join(field_errors)

            # Las credenciales parciales tampoco pueden persistirse con Linkify deshabilitado.
            has_linkify_data = method_id == 'linkify' and any(
                fields.get(field) not in (None, '') for field in ('idCuenta', 'clavePrivada')
            )

            # Una transferencia parcialmente completada tampoco puede persistirse deshabilitada.
            required_fields = self.REQUIRED_FIELDS_BY_METHOD.get(method_id, [])
            has_transfer_data = method_id == 'transfer' and any(
                isinstance(value, str) and value.strip() for value in fields.values()
            )
            if is_enabled is True or has_linkify_data or has_transfer_data:

                # Buscamos campos vacíos o inexistentes
                missing = [key for key in required_fields
                           if not isinstance(fields.get(key), str) or not fields[key].strip()]

                if missing:
                    labels = [self.FIELD_LABELS.get(key, key) for key in missing]
                    missing_error = f"Faltan campos obligatorios: {', '.join(labels)}."
                    errores_metodos[method_id] = ' '.join(
                        filter(None, [errores_metodos.get(method_id), missing_error])
                    )

        if errores_metodos:
            raise serializers.ValidationError(errores_metodos)

        return data

class PedidoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pedido
        fields = [
            'id_pedido',
            'identificador',
            'id_usuario',
            'nombre_contacto',
            'correo_contacto',
            'telefono_contacto',
            'metodo_pago',
            'monto_total',
            'estado',
            'fecha_creacion'
        ]
        read_only_fields = ['identificador']

class TransferenciaPendienteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pedido
        fields = [
            'id_pedido', 'identificador', 'fecha_creacion', 'nombre_contacto',
            'correo_contacto', 'monto_total', 'medio_pago', 'estado',
        ]
        read_only_fields = fields


class ItemPedidoTiendaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemPedido
        fields = ['nombre_producto', 'cantidad', 'precio_unitario']

class PedidoTiendaSerializer(serializers.ModelSerializer):
    items = ItemPedidoTiendaSerializer(source='itempedido_set', many=True, read_only=True)
    
    class Meta:
        model = Pedido
        fields = [
            'id_pedido', 'identificador', 'nombre_contacto', 'correo_contacto', 
            'monto_total', 'estado', 'fecha_creacion', 'metodo_pago', 
            'costo_envio', 'descuento', 'items', 'entrega'
        ]

class PedidoEstadoDetalleSerializer(serializers.ModelSerializer):
    estado_label = serializers.SerializerMethodField()
    linea_tiempo = serializers.SerializerMethodField()
    items = ItemPedidoTiendaSerializer(source='itempedido_set', many=True, read_only=True)

    class Meta:
        model = Pedido
        fields = [
            'id_pedido',
            'identificador',
            'fecha_creacion',
            'monto_total',
            'metodo_pago',
            'costo_envio',
            'estado',
            'estado_label',
            'linea_tiempo',
            'items',
        ]

    def get_estado_label(self, obj):
        alias_estados = {'preparacion': 'preparando', 'despachado': 'enviado'}
        estado_actual = alias_estados.get(obj.estado, obj.estado)
        estados_map = {
            'pendiente': 'Pendiente de pago',
            'pagado': 'Pago confirmado',
            'preparando': 'En preparación',
            'en_origen': 'En origen',
            'enviado': 'Despachado / En tránsito',
            'en_reparto': 'En reparto',
            'entregado': 'Entregado',
            'cancelado': 'Cancelado',
        }
        return estados_map.get(estado_actual, str(obj.estado).capitalize())

    def get_linea_tiempo(self, obj):
        alias_estados = {'preparacion': 'preparando', 'despachado': 'enviado'}
        estado_actual = alias_estados.get(obj.estado, obj.estado)
        orden_estados = ['pendiente', 'pagado', 'preparando', 'en_origen', 'enviado', 'en_reparto', 'entregado']

        if estado_actual == 'cancelado':
            return [{'estado': 'cancelado', 'etiqueta': 'Cancelado', 'completado': True, 'actual': True}]

        try:
            indice_actual = orden_estados.index(estado_actual)
        except ValueError:
            indice_actual = 0

        pasos = [
            {'estado': 'pendiente', 'etiqueta': 'Recibido'},
            {'estado': 'pagado', 'etiqueta': 'Pago Confirmado'},
            {'estado': 'preparando', 'etiqueta': 'En Preparación'},
            {'estado': 'en_origen', 'etiqueta': 'En Origen'},
            {'estado': 'enviado', 'etiqueta': 'En Tránsito'},
            {'estado': 'en_reparto', 'etiqueta': 'En Reparto'},
            {'estado': 'entregado', 'etiqueta': 'Entregado'},
        ]

        for i, paso in enumerate(pasos):
            paso['completado'] = i <= indice_actual
            paso['actual'] = i == indice_actual

        return pasos


class PedidoEstadoUpdateSerializer(serializers.Serializer):
    estado = serializers.CharField(required=True)

    def validate_estado(self, value):
        alias_estados = {
            'preparacion': 'preparando',
            'despachado': 'enviado',
        }
        estado_normalizado = alias_estados.get(str(value).strip().lower(), str(value).strip().lower())
        estados_permitidos = [
            'pendiente', 'pagado', 'preparando', 'en_origen',
            'enviado', 'en_reparto', 'entregado', 'cancelado',
        ]
        if estado_normalizado not in estados_permitidos:
            raise serializers.ValidationError("Estado logístico no válido.")
        return estado_normalizado
