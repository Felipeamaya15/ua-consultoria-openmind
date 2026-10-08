from rest_framework import serializers
# CAMBIO: Importamos el validador de Base64 que creamos para MongoDB
from apps.core.domain.validators import validate_base64_image
from apps.core.models import Producto
from apps.catalog.domain.stock import validate_stock


class StockValidationMixin:
    def validate_stock(self, value):
        try:
            validate_stock(value)
        except ValueError as error:
            raise serializers.ValidationError(str(error)) from error
        return value

class ProductPublicListItemSerializer(serializers.Serializer):
    id = serializers.CharField(source="_id")
    nombre = serializers.CharField()
    slug = serializers.CharField()
    categoria = serializers.CharField()
    imagen = serializers.SerializerMethodField()
    precio = serializers.SerializerMethodField()
    precio_oferta = serializers.SerializerMethodField()
    disponible = serializers.SerializerMethodField()

    def get_imagen(self, producto):
        imagenes = producto.get("imagenes") or []
        return imagenes[0] if imagenes else None

    def _variantes(self, producto):
        return producto.get("variantes") or []

    def get_precio(self, producto):
        precios = [v["precio"] for v in self._variantes(producto) if v.get("precio") is not None]
        return min(precios) if precios else None

    def get_precio_oferta(self, producto):
        ofertas = [
            v["precio_oferta"] for v in self._variantes(producto)
            if v.get("precio_oferta") is not None
        ]
        return min(ofertas) if ofertas else None

    def get_disponible(self, producto):
        return any((v.get("stock") or 0) > 0 for v in self._variantes(producto))


class VarianteSerializer(serializers.Serializer):
    sku = serializers.CharField()
    precio = serializers.FloatField(allow_null=True)
    precio_oferta = serializers.FloatField(allow_null=True, required=False)
    stock = serializers.IntegerField()
    atributos_variante = serializers.ListField(child=serializers.DictField(), required=False)


class AtributoGeneralSerializer(serializers.Serializer):
    clave = serializers.CharField()
    etiqueta = serializers.CharField()
    valor = serializers.CharField()


class SeoSerializer(serializers.Serializer):
    meta_titulo = serializers.CharField(required=False, allow_null=True)
    meta_descripcion = serializers.CharField(required=False, allow_null=True)


class ProductPublicDetailSerializer(serializers.Serializer):
    """
    No incluye tienda_id, activo ni fecha_creacion (son datos internos).
    """
    id = serializers.CharField(source="_id", required=False)
    nombre = serializers.CharField()
    slug = serializers.CharField()
    descripcion = serializers.CharField(required=False, allow_blank=True)
    categoria = serializers.CharField()
    imagenes = serializers.ListField(child=serializers.CharField(), required=False)
    atributos_generales = AtributoGeneralSerializer(many=True, required=False)
    variantes = VarianteSerializer(many=True, required=False)
    seo = SeoSerializer(required=False)


    def validate_imagenes(self, value):
        for img_b64 in value:

            if img_b64.startswith('http') or img_b64.startswith('/'):
                continue

            validate_base64_image(img_b64, max_size_mb=2)
        return value


class ProductAdminDetailSerializer(ProductPublicDetailSerializer):
    activo = serializers.BooleanField()
    fecha_creacion = serializers.DateTimeField(required=False)
    # El panel necesita todos los campos de las variantes, incluidos metadatos legacy.
    variantes = serializers.ListField(child=serializers.DictField(), required=False)
    revision = serializers.SerializerMethodField()

    def get_revision(self, product):
        from apps.catalog.infrastructure.repositories import ProductRepository
        return ProductRepository.revision(product)


class AtributoVarianteAgrupadoSerializer(serializers.Serializer):
    clave = serializers.CharField()
    etiqueta = serializers.CharField()
    valores = serializers.ListField(child=serializers.CharField())


class ProductPublicAttributesSerializer(serializers.Serializer):
    atributos_generales = AtributoGeneralSerializer(many=True)
    atributos_variante = AtributoVarianteAgrupadoSerializer(many=True)


class ProductImageSerializer(serializers.Serializer):

    imagen = serializers.CharField()


    def validate_imagen(self, value):
        if value.startswith('http') or value.startswith('/'):
            return value

        validate_base64_image(value, max_size_mb=2)
        return value

class ProductoCreateSerializer(serializers.ModelSerializer):
    categoria = serializers.CharField(required=False, allow_blank=True, default='')
    descripcion = serializers.CharField(required=False, allow_blank=True, default='')
    imagenes = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )

    class Meta:
        model = Producto
        fields = ['nombre', 'precio', 'stock', 'activo', 'categoria', 'descripcion', 'imagenes']
        extra_kwargs = {
            'nombre': {
                'required': True,
                'allow_blank': False,
                'error_messages': {
                    'required': 'El campo nombre es obligatorio.',
                    'blank': 'El nombre no puede estar vacío.'
                }
            },
            'precio': {
                'required': True,
                'error_messages': {
                    'required': 'El campo precio es obligatorio.',
                    'invalid': 'El precio debe ser un número válido.'
                }
            },
            'stock': {
                'required': True,
                'error_messages': {
                    'required': 'El campo stock es obligatorio.',
                    'invalid': 'El stock debe ser un número válido.'
                }
            }
        }

    def validate_precio(self, value):
        if value < 0:
            raise serializers.ValidationError("El precio no puede ser negativo.")
        return value

    def validate_stock(self, value):
        if value < 0:
            raise serializers.ValidationError("El stock inicial no puede ser negativo.")
        return value

class ProductoAdminDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Producto
        fields = ['id_producto', 'nombre', 'precio', 'stock', 'activo', 'id_tienda']

class ProductoUpdateSerializer(StockValidationMixin, serializers.ModelSerializer):
    class Meta:
        model = Producto
        fields = ['nombre', 'precio', 'stock', 'activo']
        extra_kwargs = {
            'nombre': {
                'allow_blank': False,
                'error_messages': {
                    'blank': 'Si decides actualizar el nombre, no puede estar vacío.'
                }
            }
        }

    def validate_precio(self, value):
        if value < 0:
            raise serializers.ValidationError("El precio no puede ser negativo.")
        return value

class ProductoStockUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Producto
        fields = ['stock']

    def validate_stock(self, value):
        if value < 0:
            raise serializers.ValidationError("El stock no puede ser negativo o inválido.")
        return value


class VarianteStockUpdateSerializer(StockValidationMixin, serializers.Serializer):
    stock = serializers.IntegerField(required=True, min_value=0,
        error_messages={'min_value': 'El stock no puede ser negativo.', 'invalid': 'El stock debe ser un entero mayor o igual a cero.'})

    def to_internal_value(self, data):
        # DRF acepta 1.0 y True como enteros. El inventario no se redondea.
        if isinstance(data, dict) and 'stock' in data and (isinstance(data['stock'], bool) or isinstance(data['stock'], float)):
            raise serializers.ValidationError({'stock': 'El stock debe ser un entero mayor o igual a cero.'})
        return super().to_internal_value(data)

class VarianteInputSerializer(VarianteStockUpdateSerializer):
    sku = serializers.CharField()
    precio = serializers.FloatField(min_value=0)
    precio_oferta = serializers.FloatField(required=False, allow_null=True, min_value=0)
    stock = serializers.IntegerField(min_value=0)
    atributos_variante = serializers.ListField(
        child=serializers.DictField(), required=False, default=list
    )

    def validate_sku(self, value):
        return value.strip().upper()

    def validate(self, data):
        import math
        if any(not math.isfinite(data[field]) for field in ('precio', 'precio_oferta')
               if data.get(field) is not None):
            raise serializers.ValidationError("Los precios deben ser números finitos.")
        if data.get('precio_oferta') is not None and data['precio_oferta'] >= data['precio']:
            raise serializers.ValidationError("El precio de oferta debe ser menor al precio normal.")
        return data

    def validate_atributos_variante(self, value):
        from apps.catalog.application.services import VariantService
        try:
            return VariantService._normalizar_atributos_variante(value)
        except ValueError as error:
            raise serializers.ValidationError(str(error)) from error


class AtributoGeneralInputSerializer(serializers.Serializer):
    clave = serializers.CharField()
    etiqueta = serializers.CharField()
    valor = serializers.CharField()


class SeoInputSerializer(serializers.Serializer):
    meta_titulo = serializers.CharField(required=False, allow_blank=True)
    meta_descripcion = serializers.CharField(required=False, allow_blank=True)


class ProductCreateSerializer(serializers.Serializer):
    activo = serializers.BooleanField(required=False, default=True)
    nombre = serializers.CharField(
        max_length=200,
        required=True,
        allow_blank=False,
        error_messages={
            'required': 'El campo nombre es obligatorio.',
            'blank': 'El nombre no puede estar vacío.'
        }
    )
    descripcion = serializers.CharField(required=False, allow_blank=True)
    categoria = serializers.CharField(max_length=100)
    imagenes = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )
    atributos_generales = AtributoGeneralInputSerializer(
        many=True, required=False, default=list
    )
    variantes = VarianteInputSerializer(many=True)
    seo = SeoInputSerializer(required=False)

    def validate_imagenes(self, value):
        from django.core.exceptions import ValidationError
        for image in value:
            try:
                validate_base64_image(image, max_size_mb=2)
            except ValidationError as error:
                raise serializers.ValidationError(error.messages) from error
        return value

    def validate_variantes(self, value):
        if not value:
            raise serializers.ValidationError(
                "El producto debe tener al menos una variante."
            )
        skus = [v["sku"] for v in value]
        if len(skus) != len(set(skus)):
            raise serializers.ValidationError(
                "Los SKU de las variantes deben ser únicos."
            )
        schemas = [{attribute['clave'] for attribute in variant['atributos_variante']}
                   for variant in value]
        if any(schema != schemas[0] for schema in schemas[1:]):
            raise serializers.ValidationError(
                "Todas las variantes deben definir los mismos atributos del producto."
            )
        return value


    


class ModificarCantidadRequestSerializer(serializers.Serializer):
    cantidad = serializers.IntegerField(min_value=1, error_messages={
        'min_value': 'La cantidad mínima permitida es 1.',
        'invalid': 'Debe ingresar un número entero válido.'
    })

class ItemCarritoResponseSerializer(serializers.Serializer):
    id_item_carrito = serializers.IntegerField()
    id_producto = serializers.IntegerField(source='id_producto.id_producto')
    nombre_producto = serializers.CharField(source='id_producto.nombre')
    precio_unitario = serializers.SerializerMethodField()
    cantidad = serializers.IntegerField()
    subtotal = serializers.SerializerMethodField()
    sku = serializers.CharField(allow_null=True, required=False)
    stock_disponible = serializers.SerializerMethodField()
    slug = serializers.SerializerMethodField()
    producto_mongo_id = serializers.SerializerMethodField()
    imagen = serializers.SerializerMethodField()
    atributos = serializers.SerializerMethodField()

    @staticmethod
    def _precio(obj):
        precio = getattr(obj, 'precio_calculado', None)
        return precio if precio is not None else obj.id_producto.precio

    def get_precio_unitario(self, obj):
        return f"{self._precio(obj):.2f}"

    def get_subtotal(self, obj):
        return obj.cantidad * self._precio(obj)

    def get_stock_disponible(self, obj):
        # Los casos de uso calculan el stock real (variante o producto base).
        return getattr(obj, 'stock_disponible_calculado', obj.id_producto.stock)

    def get_imagen(self, obj):
        return getattr(obj, "imagen_calculada", "")

    def get_atributos(self, obj):
        return getattr(obj, "atributos_calculados", {})

    def get_producto_mongo_id(self, obj):
        return getattr(obj, "producto_mongo_id_calculado", None)

    def get_slug(self, obj):
        # La consulta del carrito lo resuelve desde el catálogo; puede ser None.
        return getattr(obj, 'slug_calculado', None)

class AgregarItemCarritoRequestSerializer(serializers.Serializer):
    id_producto = serializers.IntegerField(
        required=False,
        min_value=1,
        error_messages={
            "invalid": "El 'id_producto' debe ser un número entero válido."
        }
    )
    slug = serializers.SlugField(
        required=False,
        allow_blank=False,
        error_messages={
            "invalid": "El 'slug' del producto no es válido.",
            "blank": "El 'slug' del producto no puede estar vacío."
        }
    )
    cantidad = serializers.IntegerField(
        required=False,
        default=1,
        min_value=1,
        error_messages={
            "min_value": "La cantidad debe ser mayor a 0.",
            "invalid": "La cantidad debe ser un número entero válido."
        }
    )
    sku = serializers.CharField(
        required=False,
        allow_null=True,
        allow_blank=True,
        default=None
    )

    def validate(self, attrs):
        if attrs.get("id_producto") is None and not attrs.get("slug"):
            raise serializers.ValidationError(
                {"id_producto": "Debes indicar el 'id_producto' o el 'slug' del producto."}
            )
        return attrs

class ConfiguracionTransbankInputSerializer(serializers.Serializer):
    codigo_comercio = serializers.CharField(
        max_length=64,
        required=True,
        error_messages={"required": "El código de comercio es obligatorio."}
    )
    api_key = serializers.CharField(
        max_length=255,
        required=True,
        error_messages={"required": "La API Key o Secret es obligatoria."}
    )
    ambiente = serializers.ChoiceField(
        choices=["INTEGRACION", "PRODUCCION"],
        default="INTEGRACION"
    )
    activo = serializers.BooleanField(default=True)


class ConfiguracionTransbankResponseSerializer(serializers.Serializer):
    id_tienda = serializers.SerializerMethodField()
    codigo_comercio = serializers.CharField()
    ambiente = serializers.CharField()
    activo = serializers.BooleanField()
    api_key_enmascarada = serializers.CharField(allow_blank=True, required=False)
    fecha_actualizacion = serializers.DateTimeField(allow_null=True, required=False)
    configurado = serializers.BooleanField(default=True)

    def get_id_tienda(self, obj):
        val = obj.get("id_tienda") if isinstance(obj, dict) else getattr(obj, "id_tienda", None)
        return getattr(val, "id_tienda", val)


class IniciarPagoTransbankSerializer(serializers.Serializer):
    id_tienda = serializers.IntegerField(required=True)
    orden_compra = serializers.CharField(max_length=64, required=True)
    email = serializers.EmailField(required=True)
    monto = serializers.IntegerField(min_value=1, required=True)
    session_id = serializers.CharField(max_length=64, required=True)
    return_url = serializers.URLField(required=True)


    def validate_return_url(self, value):
        from urllib.parse import urlsplit
        from django.conf import settings
        target = urlsplit(value)
        allowed = {urlsplit(origin)._replace(path="", query="", fragment="").geturl().rstrip("/")
                   for origin in settings.CORS_ALLOWED_ORIGINS}
        origin = f"{target.scheme}://{target.netloc}"
        if target.username or target.password or origin not in allowed:
            raise serializers.ValidationError("El retorno debe pertenecer a la tienda configurada.")
        return value


class ConfirmarPagoTransbankSerializer(serializers.Serializer):
    id_tienda = serializers.IntegerField(required=True)
    token_ws = serializers.CharField(max_length=255, required=True)

class ConfiguracionPayPalInputSerializer(serializers.Serializer):
    client_id = serializers.CharField(max_length=255, required=False, allow_blank=True)
    client_secret = serializers.CharField(max_length=255, required=False, allow_blank=True)
    ambiente = serializers.ChoiceField(choices=['SANDBOX', 'LIVE'], default='SANDBOX')
    activo = serializers.BooleanField(default=False)


class ConfiguracionPayPalResponseSerializer(serializers.Serializer):
    id_tienda = serializers.SerializerMethodField()
    client_id = serializers.CharField(allow_blank=True)
    ambiente = serializers.CharField()
    activo = serializers.BooleanField()
    client_secret_enmascarado = serializers.CharField(allow_blank=True, required=False)
    fecha_actualizacion = serializers.DateTimeField(allow_null=True, required=False)
    configurado = serializers.BooleanField(default=False)

    def get_id_tienda(self, obj):
        val = obj.get("id_tienda") if isinstance(obj, dict) else getattr(obj, "id_tienda", None)
        return getattr(val, "id_tienda", val)

class ConfiguracionMercadoPagoInputSerializer(serializers.Serializer):
    public_key = serializers.CharField(max_length=255, required=False, allow_blank=True)
    access_token = serializers.CharField(max_length=255, required=False, allow_blank=True)
    ambiente = serializers.ChoiceField(choices=['SANDBOX', 'PRODUCCION'], default='SANDBOX')
    activo = serializers.BooleanField(default=False)


class ConfiguracionMercadoPagoResponseSerializer(serializers.Serializer):
    id_tienda = serializers.SerializerMethodField()
    public_key = serializers.CharField(allow_blank=True)
    ambiente = serializers.CharField()
    activo = serializers.BooleanField()
    access_token_enmascarado = serializers.CharField(allow_blank=True, required=False)
    fecha_actualizacion = serializers.DateTimeField(allow_null=True, required=False)
    configurado = serializers.BooleanField(default=False)

    def get_id_tienda(self, obj):
        val = obj.get("id_tienda") if isinstance(obj, dict) else getattr(obj, "id_tienda", None)
        return getattr(val, "id_tienda", val)
