from typing import List, Dict, Any, Optional

from django.utils.text import slugify
from apps.catalog.application.services import VariantService
from apps.catalog.infrastructure.repositories import ProductRepository
from apps.core.models import Producto, Usuario, Carrito, ItemCarrito
from apps.core.infrastructure.mongo_client import get_mongo_db
from bson import ObjectId
from django.shortcuts import get_object_or_404
from apps.catalog.domain.stock import validate_stock

from dataclasses import dataclass
from apps.core.models import ItemCarrito, Producto
from apps.catalog.domain.exceptions import (
    CantidadInvalidaException,
    StockInsuficienteException,
    ItemCarritoNoEncontradoException,
    ProductoNoEncontradoException,
    VarianteNoEncontradaException,
)








class ListPublicProductsUseCase:

    def __init__(self, repository: ProductRepository):
        self.repository = repository

    def execute(
        self, tienda_id: str, atributos: Optional[Dict[str, List[str]]] = None
    ) -> List[Dict[str, Any]]:
        return self.repository.list_by_store(tienda_id, activo=True, atributos=atributos)

class GetPublicProductDetailUseCase:
    """Obtiene el detalle de un producto activo, identificado por su slug."""
 
    def __init__(self, repository: ProductRepository):
        self.repository = repository
 
    def execute(self, tienda_id: str, slug: str) -> Optional[Dict[str, Any]]:
        producto = self.repository.get_by_slug(tienda_id, slug)
        if producto is None or not producto.get("activo", False):
            return None
        return producto


class GetPublicProductAttributesUseCase:
    """
    Obtiene los atributos personalizados de un producto activo :
    - atributos_generales
    - atributos_variante
    """
 
    def __init__(self, repository: ProductRepository):
        self.repository = repository
 
    def execute(self, tienda_id: str, slug: str) -> Optional[Dict[str, Any]]:
        producto = self.repository.get_by_slug(tienda_id, slug)
        if producto is None or not producto.get("activo", False):
            return None
 
        return {
            "atributos_generales": producto.get("atributos_generales") or [],
            "atributos_variante": self._agrupar_atributos_variante(
                producto.get("variantes") or []
            ),
        }
 
    def _agrupar_atributos_variante(self, variantes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        agrupados: Dict[str, Dict[str, Any]] = {}
        for variante in variantes:
            for attr in variante.get("atributos_variante") or []:
                clave = attr.get("clave")
                if not clave:
                    continue
                entry = agrupados.setdefault(
                    clave, {"clave": clave, "etiqueta": attr.get("etiqueta"), "valores": []}
                )
                valor = attr.get("valor")
                if valor is not None and valor not in entry["valores"]:
                    entry["valores"].append(valor)
        return list(agrupados.values())
class SoftDeleteProductUseCase:
    def execute(self, id_producto: int, tienda_id: str) -> dict:
        # 1. Soft Delete en PostgreSQL
        try:
            producto_pg = Producto.objects.get(id_producto=id_producto, id_tienda=tienda_id)
            if not producto_pg.activo:
                raise ValueError("El producto ya se encuentra eliminado.")
            
            producto_pg.activo = False
            producto_pg.save(update_fields=['activo'])
        except Producto.DoesNotExist:
            raise ValueError("El producto no existe en el catálogo.")

        # 2. Soft Delete en MongoDB (Si existe ahí)
        db = get_mongo_db()
        productos_collection = db.productos
        
        # Actualizamos el estado 'activo' en Mongo asegurando que pertenezca a la misma tienda
        # En MongoDB los productos se guardan con id de la tienda en string (Ej: "tienda_id": "7")
        productos_collection.update_one(
            {"id_postgresql": id_producto, "tienda_id": str(tienda_id)}, 
            {"$set": {"activo": False}}
        )

        return {"exito": True, "mensaje": "Producto eliminado lógicamente de forma correcta."}
    
class CreateProductUseCase:
    """Crea un producto nuevo en el catálogo de la tienda (RF-03.4 / tarea de creación)."""

    def __init__(self, repository: ProductRepository):
        self.repository = repository

    def execute(self, tienda_id: str, data: Dict[str, Any]) -> str:
        slug = self._slug_disponible(tienda_id, slugify(data["nombre"]))

        producto = {
            "nombre": data["nombre"],
            "slug": slug,
            "descripcion": data.get("descripcion", ""),
            "categoria": data["categoria"],
            "activo": True,
            "imagenes": data.get("imagenes", []),
            "atributos_generales": data.get("atributos_generales", []),
            "variantes": data["variantes"],
            "seo": data.get("seo", {}),
        }

        return self.repository.create(tienda_id, producto)

    def _slug_disponible(self, tienda_id: str, base_slug: str) -> str:
        slug = base_slug or "producto"
        sufijo = 1
        while self.repository.get_by_slug(tienda_id, slug):
            sufijo += 1
            slug = f"{base_slug}-{sufijo}"
        return slug

class CrearProductoUseCase:
    def ejecutar(self, tienda, datos_validados):
        if 'stock' in datos_validados:
            validate_stock(datos_validados['stock'])
        producto = Producto.objects.create(
            id_tienda=tienda,
            **datos_validados
        )
        return producto

class ObtenerProductoAdminUseCase:
    def ejecutar(self, tienda, id_producto):
        producto = get_object_or_404(Producto, id_producto=id_producto, id_tienda=tienda)
        return producto

class ActualizarProductoAdminUseCase:
    def ejecutar(self, tienda, id_producto, datos_actualizados):
        if 'stock' in datos_actualizados:
            validate_stock(datos_actualizados['stock'])
        producto = get_object_or_404(Producto, id_producto=id_producto, id_tienda=tienda)
        
        for campo, valor in datos_actualizados.items():
            setattr(producto, campo, valor)
            
        producto.save()
        return producto

class ActualizarStockProductoUseCase:
    def ejecutar(self, tienda, id_producto, nuevo_stock):
        validate_stock(nuevo_stock)
        producto = get_object_or_404(Producto, id_producto=id_producto, id_tienda=tienda)
        
        producto.stock = nuevo_stock
        producto.save()
        
        return producto

class ValidarDisponibilidadProductoUseCase:
    def ejecutar(self, tienda_id, id_producto, cantidad_requerida=1):
        producto = get_object_or_404(Producto, id_producto=id_producto, id_tienda=tienda_id)
        
        if not producto.activo:
            raise ValueError("El producto no se encuentra disponible (inactivo).")
            
        if producto.stock <= 0:
            raise ValueError("El producto se encuentra agotado (stock 0).")
            
        if producto.stock < cantidad_requerida:
            raise ValueError(f"Stock insuficiente. Solo quedan {producto.stock} unidades.")
            
        return producto

@dataclass
class ModificarCantidadDTO:
    id_item_carrito: int
    nueva_cantidad: int
    usuario_id: int


class ModificarCantidadItemUseCase:
    """
    Reglas de negocio:
    1. Cantidad estrictamente mayor a 0 (si es 0, suele manejarse como eliminación).
    2. La cantidad solicitada no puede superar el stock físico del producto.
    3. El ítem debe pertenecer al carrito activo del usuario autenticado.
    """

    def execute(self, dto: ModificarCantidadDTO) -> ItemCarrito:
        # Validación 1: Cantidad válida
        if dto.nueva_cantidad <= 0:
            raise CantidadInvalidaException("La cantidad debe ser mayor a 0.")

        # Validación 2: Pertenencia e existencia del ítem en el carrito del usuario
        try:
            item = ItemCarrito.objects.select_related('id_producto', 'id_carrito').get(
                pk=dto.id_item_carrito,
                id_carrito__id_usuario_id=dto.usuario_id
            )
        except ItemCarrito.DoesNotExist:
            raise ItemCarritoNoEncontradoException("El producto no existe en tu carrito.")

        producto = item.id_producto

        # Validación 3: Stock suficiente disponible en inventario
        if not producto.activo:
            raise StockInsuficienteException("El producto ya no se encuentra disponible para la venta.")

        if dto.nueva_cantidad > producto.stock:
            raise StockInsuficienteException(
                f"No hay stock suficiente. Stock disponible: {producto.stock} unidades."
            )

        # Actualización de la cantidad y persistencia
        item.cantidad = dto.nueva_cantidad
        item.save(update_fields=['cantidad'])

        # Refrescar la fecha de actualización del carrito padre
        item.id_carrito.save(update_fields=['fecha_actualizacion'])

        return item
    
@dataclass
class AgregarItemCarritoDTO:
    usuario_id: int
    id_producto: int
    cantidad: int = 1
    sku: Optional[str] = None


class AgregarItemCarritoUseCase:
    """
    Caso de uso: Agregar productos base y variantes al carrito de compras.
    Reglas de negocio:
    1. Cantidad estrictamente mayor a 0.
    2. Si se proporciona SKU, valida existencia y stock contra VariantService (MongoDB).
    3. Si no se proporciona SKU, valida existencia y stock del Producto base (PostgreSQL).
    4. Si el ítem ya existe en el carrito, acumula la cantidad verificando que la suma no supere el stock.
    5. Si el ítem no existe, lo crea en el carrito del usuario.
    """

    def __init__(self, variant_service: Optional[VariantService] = None):
        self.variant_service = variant_service or VariantService()

    def execute(self, dto: AgregarItemCarritoDTO) -> ItemCarrito:
        # 1. Validación de cantidad inicial
        if dto.cantidad <= 0:
            raise CantidadInvalidaException("La cantidad agregada debe ser mayor a 0.")

        # 2. Obtener o vincular el Carrito del usuario autenticado
        usuario_core = Usuario.objects.filter(id_usuario=dto.usuario_id).first()
        if not usuario_core:
            # Fallback por si el usuario proviene de auth_user de Django
            from django.contrib.auth import get_user_model
            auth_u = get_user_model().objects.get(pk=dto.usuario_id)
            usuario_core, _ = Usuario.objects.get_or_create(
                id_usuario=auth_u.id,
                defaults={
                    "correo": auth_u.email,
                    "nombre": auth_u.first_name or "Cliente",
                    "apellido": auth_u.last_name or "QA",
                    "password_hash": auth_u.password,
                    "rol": "cliente"
                }
            )

        carrito, _ = Carrito.objects.get_or_create(id_usuario=usuario_core)

        # 3. Validar existencia del Producto en PostgreSQL
        try:
            producto = Producto.objects.get(pk=dto.id_producto, activo=True)
        except Producto.DoesNotExist:
            raise ProductoNoEncontradoException(
                f"El producto con ID '{dto.id_producto}' no existe o no se encuentra activo."
            )

        # 4. Validar Stock (Variante vs Producto Base)
        sku_normalizado = str(dto.sku).strip().upper() if dto.sku else None
        
        if sku_normalizado:
            try:
                variante = self.variant_service.get_variant_by_sku(str(producto.id_producto), sku_normalizado)
            except ValueError as e:
                raise VarianteNoEncontradaException(str(e))

            stock_disponible = int(variante.get("stock", 0))
            if stock_disponible <= 0:
                raise StockInsuficienteException(
                    f"La variante con SKU '{sku_normalizado}' se encuentra agotada."
                )
        else:
            stock_disponible = producto.stock
            if stock_disponible <= 0:
                raise StockInsuficienteException("El producto seleccionado se encuentra agotado.")

        # 5. Buscar si el ítem ya existe en el carrito
        filtro_item = {
            "id_carrito": carrito,
            "id_producto": producto,
        }
        # Soporte dinámico si el modelo ItemCarrito posee la columna sku
        tiene_columna_sku = hasattr(ItemCarrito, 'sku')
        if tiene_columna_sku and sku_normalizado:
            filtro_item["sku"] = sku_normalizado

        item_existente = ItemCarrito.objects.filter(**filtro_item).first()

        cantidad_final = dto.cantidad
        if item_existente:
            cantidad_final += item_existente.cantidad

        # Validar stock total acumulado
        if cantidad_final > stock_disponible:
            raise StockInsuficienteException(
                f"Stock insuficiente. Solicitado total: {cantidad_final}, disponible: {stock_disponible}."
            )

        # 6. Persistir en base de datos
        if item_existente:
            item_existente.cantidad = cantidad_final
            item_existente.save(update_fields=["cantidad"])
            item = item_existente
        else:
            datos_creacion = {
                "id_carrito": carrito,
                "id_producto": producto,
                "cantidad": cantidad_final
            }
            if tiene_columna_sku and sku_normalizado:
                datos_creacion["sku"] = sku_normalizado

            item = ItemCarrito.objects.create(**datos_creacion)

        # Actualizar timestamp del carrito
        carrito.save(update_fields=["fecha_actualizacion"])
        return item
    
@dataclass
class EliminarItemCarritoDTO:
    usuario_id: int
    id_item_carrito: int


class EliminarItemCarritoUseCase:
    """
    Reglas de negocio:
    1. El ítem debe existir en la base de datos.
    2. El ítem debe pertenecer al carrito activo del usuario autenticado (seguridad y aislamiento).
    3. Al eliminar el ítem, se debe refrescar la fecha_actualizacion del carrito padre.
    """

    def execute(self, dto: EliminarItemCarritoDTO) -> None:
        # Validación de existencia y pertenencia
        try:
            item = ItemCarrito.objects.select_related("id_carrito").get(
                pk=dto.id_item_carrito,
                id_carrito__id_usuario_id=dto.usuario_id
            )
        except ItemCarrito.DoesNotExist:
            raise ItemCarritoNoEncontradoException(
                "El producto no existe en tu carrito o no tienes permiso para eliminarlo."
            )

        carrito = item.id_carrito

        # Eliminación física del ítem
        item.delete()

        # Actualizar timestamp del carrito padre
        carrito.save(update_fields=["fecha_actualizacion"])