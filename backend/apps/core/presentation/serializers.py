from rest_framework import serializers

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


class RegistrarCompraSerializer(serializers.Serializer):
    id_usuario = serializers.IntegerField()
    items = CompraItemInputSerializer(many=True)

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError(
                "Debe incluir al menos un producto en la compra."
            )

        for item in items:
            id_variante = item['id_variante']
            cantidad = item['cantidad']

            try:
                variante = VarianteProducto.objects.get(
                    id_variante=id_variante,
                    id_producto__id_tienda=self.context['tienda'],
                )
            except VarianteProducto.DoesNotExist:
                raise serializers.ValidationError(
                    f"La variante con ID {id_variante} no existe."
                )

            if not variante.es_activa:
                raise serializers.ValidationError(
                    f"La variante '{variante.sku}' no está activa para la venta."
                )

            # Regla de negocio crítica: stock en 0 o insuficiente.
            if variante.stock == 0:
                raise serializers.ValidationError(
                    (
                        f"Operación rechazada: la variante "
                        f"'{variante.sku}' tiene stock 0 y no puede "
                        f"ser comprada."
                    )
                )

            if variante.stock < cantidad:
                raise serializers.ValidationError(
                    (
                        f"Stock insuficiente para '{variante.sku}'. "
                        f"Stock disponible: {variante.stock}, "
                        f"solicitado: {cantidad}."
                    )
                )

        return items
