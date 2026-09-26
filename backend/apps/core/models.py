from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models
from django.db.models import Q

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

class VarianteProducto(models.Model):
    id_variante = models.BigAutoField(primary_key=True)
    id_producto = models.ForeignKey(
        Producto, 
        on_delete=models.CASCADE, 
        db_column='id_producto',
        related_name='variantes'
    )
    sku = models.CharField(max_length=64, unique=True)
    precio = models.DecimalField(max_digits=12, decimal_places=2)
    stock = models.IntegerField(default=0)
    atributos = models.JSONField(
        default=dict, 
        help_text="Ejemplo: {'color': 'Negro', 'talla': 'M'}"
    )
    es_activa = models.BooleanField(default=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'variante_producto'
        constraints = [
            models.CheckConstraint(check=Q(precio__gte=0), name='chk_variante_precio_valido'),
            models.CheckConstraint(check=Q(stock__gte=0), name='chk_variante_stock_valido'),
        ]

    def __str__(self):
        return f"{self.id_producto.nombre} - {self.sku}"

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

    class Meta:
        db_table = 'item_carrito'
        constraints = [
            models.CheckConstraint(check=Q(cantidad__gt=0), name='chk_item_carrito_cantidad_valida'),
        ]

class Pedido(models.Model):
    ESTADO_CHOICES = [
        ('pendiente', 'Pendiente'),
        ('pagado', 'Pagado'),
        ('enviado', 'Enviado'),
        ('cancelado', 'Cancelado'),
    ]
    id_pedido = models.BigAutoField(primary_key=True)
    id_usuario = models.ForeignKey(Usuario, on_delete=models.CASCADE, db_column='id_usuario')
    monto_total = models.DecimalField(max_digits=12, decimal_places=2)
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default='pendiente')
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pedido'
        constraints = [
            models.CheckConstraint(check=Q(monto_total__gte=0), name='chk_monto_total_valido'),
        ]

class ItemPedido(models.Model):
    id_item_pedido = models.BigAutoField(primary_key=True)
    id_pedido = models.ForeignKey(Pedido, on_delete=models.CASCADE, db_column='id_pedido')
    id_producto = models.ForeignKey(Producto, on_delete=models.CASCADE, db_column='id_producto')
    id_variante = models.ForeignKey(
        'VarianteProducto', 
        on_delete=models.PROTECT, 
        db_column='id_variante', 
        null=True, 
        blank=True,
        related_name='items_pedido'
    )
    
    cantidad = models.IntegerField()
    precio_unitario = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = 'item_pedido'
        constraints = [
            models.CheckConstraint(check=Q(cantidad__gt=0), name='chk_item_pedido_cantidad_valida'),
            models.CheckConstraint(check=Q(precio_unitario__gte=0), name='chk_item_pedido_precio_valido'),
        ]
