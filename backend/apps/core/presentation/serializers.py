from rest_framework import serializers
from apps.core.models import Producto, Tienda, Usuario

class ProductoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Producto
        fields = '__all__'

from apps.core.models import Producto, VarianteProducto


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
    id_variante = serializers.IntegerField()
    cantidad = serializers.IntegerField(min_value=1)


class CompraItemInputSerializer(serializers.Serializer):
    # El catálogo real vive en MongoDB e identifica cada variante por SKU,
    # no por un ID de la tabla VarianteProducto (que no se usa en la práctica).
    sku = serializers.CharField(max_length=100)
    cantidad = serializers.IntegerField(min_value=1)


class RegistrarCompraSerializer(serializers.Serializer):
    # Uno de los dos debe venir: id_usuario (cliente logueado) o los datos
    # de contacto de invitado.
    id_usuario = serializers.IntegerField(required=False, allow_null=True)
    nombre_contacto = serializers.CharField(max_length=150, required=False, allow_blank=True)
    correo_contacto = serializers.EmailField(max_length=320, required=False, allow_blank=True)
    telefono_contacto = serializers.CharField(max_length=30, required=False, allow_blank=True, default='')

    metodo_pago = serializers.CharField(
        required=True,
        error_messages={'required': 'Debe seleccionar un medio de pago.'}
    )
    items = CompraItemInputSerializer(many=True)

    def validate(self, data):
        if not data.get('id_usuario') and not data.get('correo_contacto'):
            raise serializers.ValidationError(
                "Debe iniciar sesión o completar los datos de contacto para continuar como invitado."
            )
        return data

    def validate_metodo_pago(self, value):
        tienda_id = self.context.get('tienda')
        if not tienda_id:
            raise serializers.ValidationError("Falta el identificador de la tienda en el contexto.")

        try:
            from apps.core.models import ConfiguracionPago
            config_pago = ConfiguracionPago.objects.get(tienda_id=tienda_id)
            metodo = config_pago.datos.get(value, {})

            if not metodo.get('enabled', False):
                raise serializers.ValidationError(
                    f"El método de pago '{value}' no está habilitado para esta tienda."
                )
        except ConfiguracionPago.DoesNotExist:
            raise serializers.ValidationError("La tienda no tiene medios de pago configurados.")

        return value

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError(
                "Debe incluir al menos un producto en la compra."
            )
        # La validación real de stock y existencia de cada SKU se hace contra
        # MongoDB dentro de la vista, en la misma transacción del descuento
        # de stock (para evitar condiciones de carrera).
        return items
class ConfiguracionPagoSerializer(serializers.Serializer):
    """ Valida que no se habiliten medios de pago sin sus campos obligatorios (SCRUM-306) """
    
    REQUIRED_FIELDS_BY_METHOD = {
        'transbank': ['api_key', 'commerce_id'],
        'mercadopago': ['access_token'],
        'paypal': ['client_id', 'client_secret'],
        'linkify': ['accountName', 'publicUrl', 'apiKey', 'webhookSecret'],
        'transfer': ['bank_name', 'account_type', 'account_number', 'holder_rut', 'holder_name', 'confirmation_email']
    }

    def to_internal_value(self, data):
        return data  # Permitimos la estructura dinámica del JSON

    def validate(self, data):
        if not isinstance(data, dict):
            raise serializers.ValidationError("La configuración debe ser un objeto JSON válido.")

        errores_metodos = {}

        for method_id, method_data in data.items():
            if not isinstance(method_data, dict):
                continue
                
            is_enabled = method_data.get('enabled')
            # Solo validamos si intentan guardarlo como habilitado
            if str(is_enabled).lower() == 'true' or is_enabled is True:
                fields = method_data.get('fields', {})
                required_fields = self.REQUIRED_FIELDS_BY_METHOD.get(method_id, [])
                
                # Buscamos campos vacíos o inexistentes
                missing = [key for key in required_fields if not str(fields.get(key, '')).strip()]
                
                if missing:
                    errores_metodos[method_id] = f"Faltan campos obligatorios para habilitarlo: {', '.join(missing)}."

        if errores_metodos:
            raise serializers.ValidationError(errores_metodos)

        return data