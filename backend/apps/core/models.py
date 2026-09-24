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

class Tienda(models.Model):
    id_tienda = models.BigAutoField(primary_key=True)
    id_usuario_propietario = models.ForeignKey(Usuario, on_delete=models.CASCADE, db_column='id_usuario_propietario')
    nombre = models.CharField(max_length=150)
    descripcion = models.TextField(blank=True, null=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'tienda'

class Producto(models.Model):
    id_producto = models.BigAutoField(primary_key=True)
    id_tienda = models.ForeignKey(Tienda, on_delete=models.CASCADE, db_column='id_tienda')
    nombre = models.CharField(max_length=200)
    descripcion = models.TextField(blank=True, null=True)
    precio = models.DecimalField(max_digits=12, decimal_places=2)
    stock = models.IntegerField(default=0)
    fecha_creacion = models.DateTimeField(auto_now_add=True)

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
    
    cantidad = models.IntegerField()
    precio_unitario = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = 'item_pedido'
        constraints = [
            models.CheckConstraint(check=Q(cantidad__gt=0), name='chk_item_pedido_cantidad_valida'),
            models.CheckConstraint(check=Q(precio_unitario__gte=0), name='chk_item_pedido_precio_valido'),
        ]