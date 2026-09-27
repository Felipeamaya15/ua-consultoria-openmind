from rest_framework import serializers
# CAMBIO: Importamos el validador de Base64 que creamos para MongoDB
from apps.core.domain.validators import validate_base64_image


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