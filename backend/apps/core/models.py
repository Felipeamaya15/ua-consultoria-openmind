from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models
from django.db.models import Q
from django.db.models.functions import Upper
from apps.core.promotion_dates import promotion_instant
from django.utils import timezone
from django.utils.crypto import get_random_string

from apps.core.infrastructure.encryption import EncryptedTextField

class Usuario(models.Model):
    ROL_CHOICES = [
        ('cliente', 'Cliente'),
        ('admin', 'Admin'),
    ]
    id_usuario = models.BigAutoField(primary_key=True)
    correo = models.EmailField(max_length=320, unique=True)
    password_hash = models.TextField()
    nombre = models.CharField(max_length=100)
    apellido = models.CharField(max_length=100)
    rol = models.CharField(max_length=20, choices=ROL_CHOICES)
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'usuario'

class TiendaQuerySet(models.QuerySet):
    def del_propietario(self, usuario):
        """Consulta de propiedad explícita; no resuelve tenants ni solicitudes."""
        if not isinstance(usuario, get_user_model()) or not usuario.is_active or usuario.pk is None:
            return self.none()
        return self.filter(id_usuario_propietario=usuario)


class Tienda(models.Model):
    id_tienda = models.BigAutoField(primary_key=True)
    id_usuario_propietario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        db_column='id_usuario_propietario',
        related_name='tiendas_propias',
    )
    nombre = models.CharField(max_length=150)
    descripcion = models.TextField(blank=True, null=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    objects = TiendaQuerySet.as_manager()

    class Meta:
        db_table = 'tienda'


class Promocion(models.Model):
    TIPO_PORCENTAJE = 'percentage'
    TIPO_MONTO_FIJO = 'fixed'
    TIPO_ENVIO_GRATIS = 'free_shipping'
    TIPO_PRECIO_OFERTA = 'precio_oferta'

    TIPOS_CODIGO = [
        (TIPO_PORCENTAJE, 'Descuento porcentual'),
        (TIPO_MONTO_FIJO, 'Descuento por monto fijo'),
        (TIPO_ENVIO_GRATIS, 'Envío gratuito'),
        ('descuento_porcentual', 'Descuento porcentual'),
        ('descuento_monto_fijo', 'Descuento por monto fijo'),
        ('envio_gratuito', 'Envío gratuito'),
    ]
    TIPOS = TIPOS_CODIGO + [
        (TIPO_PRECIO_OFERTA, 'Precio de oferta'),
    ]

    id_promocion = models.BigAutoField(primary_key=True)
    tienda = models.ForeignKey(Tienda, on_delete=models.CASCADE, related_name='promociones')
    nombre = models.CharField(max_length=150)
    tipo = models.CharField(max_length=30, choices=TIPOS)
    codigo = models.CharField(max_length=40, blank=True, default='')
    valor = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    monto_minimo = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    maximo_usos = models.PositiveIntegerField(null=True, blank=True)
    usos = models.PositiveIntegerField(default=0)
    activa = models.BooleanField(default=True)
    fecha_inicio = models.DateTimeField(null=True, blank=True)
    fecha_fin = models.DateTimeField(null=True, blank=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'promocion'
        constraints = [
            models.UniqueConstraint(
                Upper('codigo'), 'tienda',
                condition=~Q(codigo=''),
                name='uq_promocion_codigo_por_tienda',
            ),
            models.CheckConstraint(
                condition=(
                    Q(fecha_inicio__isnull=True)
                    | Q(fecha_fin__isnull=True)
                    | Q(fecha_fin__gte=models.F('fecha_inicio'))
                ),
                name='chk_promocion_fechas_validas',
            ),
            models.CheckConstraint(condition=Q(valor__gte=0), name='chk_promocion_valor_no_negativo'),
            models.CheckConstraint(condition=Q(monto_minimo__gte=0), name='chk_promocion_minimo_no_negativo'),
            models.CheckConstraint(condition=Q(tipo='precio_oferta') | ~Q(codigo=''), name='chk_promocion_codigo_cupon'),
            models.CheckConstraint(condition=Q(tipo__in=('percentage','fixed','free_shipping','descuento_porcentual','descuento_monto_fijo','envio_gratuito','precio_oferta')), name='chk_promocion_tipo_valido'),
            models.CheckConstraint(condition=(~Q(tipo__in=('percentage','descuento_porcentual')) | Q(valor__gt=0,valor__lte=100)) & (~Q(tipo__in=('fixed','descuento_monto_fijo')) | Q(valor__gt=0)), name='chk_promocion_descuento_valido'),
        ]

    def save(self, *args, **kwargs):
        # No cambia tipos/códigos históricos al editar otro atributo.
        self.fecha_inicio = promotion_instant(self.fecha_inicio)
        self.fecha_fin = promotion_instant(self.fecha_fin, end=True)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nombre} ({self.get_tipo_display()})"


class Producto(models.Model):
    id_producto = models.BigAutoField(primary_key=True)
    nombre = models.CharField(max_length=200)
    descripcion = models.TextField(blank=True, null=True)
    precio = models.DecimalField(max_digits=12, decimal_places=2)
    stock = models.IntegerField(default=0)
    activo = models.BooleanField(default=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    id_tienda = models.ForeignKey(db_column='id_tienda', on_delete=models.CASCADE, to='core.tienda')

    class Meta:
        db_table = 'producto'
        constraints = [
            models.CheckConstraint(check=Q(precio__gte=0), name='chk_precio_valido'),
            models.CheckConstraint(check=Q(stock__gte=0), name='chk_stock_valido'),
        ]


class Carrito(models.Model):
    id_carrito = models.BigAutoField(primary_key=True)
    # OneToOneField asegura que la relación sea ÚNICA (UK) como en tu diagrama
    id_usuario = models.OneToOneField(Usuario, on_delete=models.CASCADE, db_column='id_usuario')
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'carrito'

class ItemCarrito(models.Model):
    id_item_carrito = models.BigAutoField(primary_key=True)
    id_carrito = models.ForeignKey(Carrito, on_delete=models.CASCADE, db_column='id_carrito')
    id_producto = models.ForeignKey(Producto, on_delete=models.CASCADE, db_column='id_producto')
    cantidad = models.IntegerField()
    sku = models.CharField(max_length=100, null=True, blank=True)

    class Meta:
        db_table = 'item_carrito'
        constraints = [
            models.CheckConstraint(check=Q(cantidad__gt=0), name='chk_item_carrito_cantidad_valida'),
            models.UniqueConstraint(
                fields=['id_carrito', 'id_producto', 'sku'],
                name='uq_item_carrito_variante',
            ),
            models.UniqueConstraint(
                fields=['id_carrito', 'id_producto'],
                condition=Q(sku__isnull=True),
                name='uq_item_carrito_producto_base',
            ),
        ]

def generar_identificador_orden():
    fecha = timezone.now().strftime('%Y%m%d')
    codigo_random = get_random_string(4, allowed_chars='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
    return f"ORD-{fecha}-{codigo_random}"

class Pedido(models.Model):
    ESTADO_CHOICES = [
        ('pendiente', 'Pendiente'),
        ('pagado', 'Pagado'),
        ('preparando', 'En preparación'),
        ('en_origen', 'En origen'),
        ('enviado', 'Enviado/En tránsito'),
        ('en_reparto', 'En reparto'),
        ('entregado', 'Entregado'),
        ('cancelado', 'Cancelado'),
    ]
    # Ya pagado: un aviso o una confirmacion repetida del pago es inofensiva.
    ESTADOS_PAGADOS = ('pagado', 'preparando', 'en_origen', 'enviado', 'en_reparto', 'entregado')
    # Ya se empezo a preparar o despachar: revertir o reconciliar el pago exige revision manual.
    ESTADOS_EN_DESPACHO = ('preparando', 'en_origen', 'enviado', 'en_reparto', 'entregado')
    id_pedido = models.BigAutoField(primary_key=True)
    
    identificador = models.CharField(
        max_length=20, 
        unique=False,
        default=generar_identificador_orden, 
        editable=False,
        verbose_name="Número de Orden",
        null=True
    )
    
    id_usuario = models.ForeignKey(Usuario, on_delete=models.CASCADE, db_column='id_usuario', null=True, blank=True)
    comprador = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='pedidos_comprador',
    )
    nombre_contacto = models.CharField(max_length=150, blank=True, default='')
    correo_contacto = models.EmailField(max_length=320, blank=True, default='')
    telefono_contacto = models.CharField(max_length=30, blank=True, default='')
    metodo_pago = models.CharField(max_length=50, blank=True, default='')
    monto_total = models.DecimalField(max_digits=12, decimal_places=2)
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default='pendiente')
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    tienda = models.ForeignKey(Tienda, on_delete=models.PROTECT, null=True, blank=True)
    clave_checkout = models.UUIDField(unique=True, null=True, blank=True)
    huella_checkout = models.CharField(max_length=64, blank=True, default='')
    # Se conserva el inicio exitoso de Webpay para que un reintento no cree otro cobro.
    webpay_token = models.CharField(max_length=512, blank=True, default='')
    webpay_url = models.CharField(max_length=2048, blank=True, default='')
    contacto = models.JSONField(default=dict, blank=True)
    entrega = models.JSONField(default=dict, blank=True)
    medio_pago = models.CharField(max_length=40, blank=True, default='')
    costo_envio = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    descuento = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        db_table = 'pedido'
        constraints = [
            models.CheckConstraint(check=Q(monto_total__gte=0), name='chk_monto_total_valido'),
            models.CheckConstraint(
                check=(
                    Q(id_usuario__isnull=False)
                    | ~Q(correo_contacto='')
                    | Q(comprador__isnull=False)
                    | ~Q(contacto={})
                ),
                name='chk_pedido_tiene_comprador',
            ),
        ]

class ItemPedido(models.Model):
    id_item_pedido = models.BigAutoField(primary_key=True)
    id_pedido = models.ForeignKey(Pedido, on_delete=models.CASCADE, db_column='id_pedido')
    id_producto = models.ForeignKey(Producto, on_delete=models.CASCADE, db_column='id_producto', null=True, blank=True)
    producto_mongo_id = models.CharField(max_length=24, blank=True, default='')
    nombre_producto = models.CharField(max_length=200, blank=True, default='')
    sku = models.CharField(max_length=100, blank=True, default='')
    atributos_variante = models.JSONField(default=list, blank=True)
    atributos = models.JSONField(default=dict, blank=True)

    cantidad = models.IntegerField()
    precio_unitario = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = 'item_pedido'
        constraints = [
            models.CheckConstraint(check=Q(cantidad__gt=0), name='chk_item_pedido_cantidad_valida'),
            models.CheckConstraint(check=Q(precio_unitario__gte=0), name='chk_item_pedido_precio_valido'),
        ]


class ConsentimientoComercial(models.Model):
    """Evidencia separada de compras/cookies. Sin registro nunca significa autorizado.

    No hay API que permita al vendedor conceder consentimiento por el cliente.
    La captura del comprador exige texto aprobado y verificación de identidad.
    """
    tienda = models.ForeignKey(Tienda, on_delete=models.CASCADE)
    email = models.EmailField(max_length=320)
    estado = models.CharField(max_length=15, choices=[('autorizado', 'Autorizado'), ('retirado', 'Retirado')])
    version_texto = models.CharField(max_length=100, blank=True, default='')
    referencia_evidencia = models.CharField(max_length=250, blank=True, default='')
    fecha_actualizacion = models.DateTimeField(default=timezone.now)

    def save(self, *args, **kwargs):
        from django.core.exceptions import ValidationError
        from django.core.validators import validate_email
        self.email = self.email.strip().lower()
        validate_email(self.email)
        if self.estado == 'autorizado' and (not self.version_texto.strip() or not self.referencia_evidencia.strip()):
            raise ValidationError('La autorización requiere versión del texto y referencia de evidencia.')
        return super().save(*args, **kwargs)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['tienda', 'email'], name='uq_consentimiento_tienda_email'),
            models.CheckConstraint(condition=Q(estado='retirado') | (Q(estado='autorizado') & ~Q(version_texto='') & ~Q(referencia_evidencia='')), name='chk_consentimiento_evidencia'),
            models.CheckConstraint(condition=Q(email=models.functions.Lower(models.functions.Trim('email'))), name='chk_consentimiento_normalizado'),
        ]

class ConfiguracionTransbank(models.Model):
    AMBIENTE_CHOICES = [
        ('INTEGRACION', 'Integración'),
        ('PRODUCCION', 'Producción'),
    ]

    id_configuracion = models.BigAutoField(primary_key=True)
    id_tienda = models.OneToOneField(
        'core.Tienda',
        on_delete=models.CASCADE,
        db_column='id_tienda',
        related_name='configuracion_transbank'
    )
    codigo_comercio = models.CharField(max_length=64)
    api_key = EncryptedTextField()
    ambiente = models.CharField(
        max_length=20,
        choices=AMBIENTE_CHOICES,
        default='INTEGRACION'
    )
    activo = models.BooleanField(default=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'configuracion_transbank'

    def api_key_enmascarada(self) -> str:
        if not self.api_key:
            return ""
        if len(self.api_key) <= 4:
            return "****"
        return f"{'*' * (len(self.api_key) - 4)}{self.api_key[-4:]}"

class ConfiguracionPayPal(models.Model):
    AMBIENTE_CHOICES = [
        ('SANDBOX', 'Sandbox (Pruebas)'),
        ('LIVE', 'Live (Producción)'),
    ]

    id_tienda = models.OneToOneField(
        Tienda,
        on_delete=models.CASCADE,
        related_name='configuracion_paypal',
        primary_key=True,
        db_column='id_tienda',
    )
    client_id = models.CharField(max_length=255, blank=True, default='')
    client_secret = EncryptedTextField(blank=True, default='')
    ambiente = models.CharField(max_length=20, choices=AMBIENTE_CHOICES, default='SANDBOX')
    activo = models.BooleanField(default=False)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'configuracion_paypal'
        verbose_name = 'Configuración PayPal'
        verbose_name_plural = 'Configuraciones PayPal'

    @property
    def client_secret_enmascarado(self) -> str:
        if not self.client_secret:
            return ''
        if len(self.client_secret) <= 8:
            return '********'
        return f"{'*' * (len(self.client_secret) - 4)}{self.client_secret[-4:]}"

    def __str__(self):
        return f"PayPal Tienda {self.id_tienda_id} ({self.ambiente}) - {'Activo' if self.activo else 'Inactivo'}"

class ConfiguracionMercadoPago(models.Model):
    AMBIENTE_CHOICES = [
        ('SANDBOX', 'Sandbox (Pruebas)'),
        ('PRODUCCION', 'Producción (Real)'),
    ]

    id_tienda = models.OneToOneField(
        Tienda,
        on_delete=models.CASCADE,
        related_name='configuracion_mercadopago',
        primary_key=True,
        db_column='id_tienda',
    )
    public_key = models.CharField(max_length=255, blank=True, default='')
    access_token = EncryptedTextField(blank=True, default='')
    ambiente = models.CharField(max_length=20, choices=AMBIENTE_CHOICES, default='SANDBOX')
    activo = models.BooleanField(default=False)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'configuracion_mercadopago'
        verbose_name = 'Configuración Mercado Pago'
        verbose_name_plural = 'Configuraciones Mercado Pago'

    @property
    def access_token_enmascarado(self) -> str:
        if not self.access_token:
            return ''
        if len(self.access_token) <= 8:
            return '********'
        return f"{'*' * (len(self.access_token) - 4)}{self.access_token[-4:]}"

    def __str__(self):
        return f"Mercado Pago Tienda {self.id_tienda_id} ({self.ambiente}) - {'Activo' if self.activo else 'Inactivo'}"

class VarianteProducto(models.Model):
    id_variante = models.BigAutoField(primary_key=True)
    id_producto = models.ForeignKey(Producto, on_delete=models.CASCADE, db_column='id_producto')
    sku = models.CharField(max_length=100)
    precio = models.DecimalField(max_digits=12, decimal_places=2)
    stock = models.IntegerField(default=0)
    atributos = models.JSONField(default=dict)
    es_activa = models.BooleanField(default=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'variante_producto'
        constraints = [
            models.CheckConstraint(check=models.Q(precio__gte=0), name='chk_variante_precio_valido'),
            models.CheckConstraint(check=models.Q(stock__gte=0), name='chk_variante_stock_valido'),
        ]

class ConfiguracionPago(models.Model):
    tienda = models.OneToOneField(
        'core.Tienda',
        on_delete=models.CASCADE,
        related_name='configuracion_pago'
    )
    # Almacenará el JSON con los métodos (Transbank, PayPal, etc.) y su estado 'enabled'
    datos = models.JSONField(default=dict, blank=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'configuracion_pago'

class ConfiguracionEntrega(models.Model):
    tienda = models.OneToOneField(
        'core.Tienda',
        on_delete=models.CASCADE,
        related_name='configuracion_entrega'
    )

    datos = models.JSONField(default=dict, blank=True)

    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'configuracion_entrega'

    def __str__(self):
        return f"Configuración de entrega - Tienda {self.tienda_id}"

class ConfiguracionLegal(models.Model):
    tienda = models.OneToOneField(
        'core.Tienda',
        on_delete=models.CASCADE,
        related_name='configuracion_legal',
    )
    datos = models.JSONField(default=dict, blank=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'configuracion_legal'
        verbose_name = 'Configuración legal'
        verbose_name_plural = 'Configuraciones legales'

    def __str__(self):
        return f"Configuración legal - Tienda {self.tienda_id}"

class ConfiguracionCorreo(models.Model):
    tienda = models.OneToOneField(
        'core.Tienda',
        on_delete=models.CASCADE,
        related_name='configuracion_correo',
    )
    plantillas = models.JSONField(default=dict, blank=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'configuracion_correo'
        verbose_name = 'Configuración de correo'
        verbose_name_plural = 'Configuraciones de correo'
