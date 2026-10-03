from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from django.utils.text import slugify
from django.shortcuts import get_object_or_404
from bson import ObjectId
from django.utils import timezone

from apps.core.models import (
    Producto,
    Usuario,
    Carrito,
    ItemCarrito,
    ConfiguracionTransbank,
    ConfiguracionPayPal,
    Tienda,
    ConfiguracionMercadoPago
)
from apps.core.infrastructure.mongo_client import get_mongo_db
from bson import ObjectId
from django.shortcuts import get_object_or_404

from apps.core.models import Usuario, Carrito, ItemCarrito, ConfiguracionTransbank, ConfiguracionPayPal, Tienda, ConfiguracionMercadoPago
from apps.catalog.application.services import VariantService
from apps.catalog.infrastructure.repositories import ProductRepository
from apps.catalog.infrastructure.adapters.transbank_adapter import TransbankWebpayAdapter
from apps.catalog.domain.stock import validate_stock
from apps.catalog.domain.exceptions import (
    CantidadInvalidaException,
    StockInsuficienteException,
    ItemCarritoNoEncontradoException,
    ProductoNoEncontradoException,
    VarianteNoEncontradaException,
    TransbankTransaccionException,
    TransbankRechazoException,
    TransbankConfiguracionFaltanteException,
    ConfiguracionPagoInvalidaException,
)

# CONFIGURACIÓN MERCADO PAGO (ADMIN)
# ==========================================================

class GuardarConfiguracionMercadoPagoDTO:
    def __init__(
        self,
        public_key: str = "",
        access_token: str = "",
        ambiente: str = "SANDBOX",
        activo: bool = False,
        id_tienda: Optional[int] = None,
        tienda_id: Optional[int] = None,
        *args,
        **kwargs,
    ):
        self.id_tienda = id_tienda if id_tienda is not None else tienda_id
        self.public_key = str(public_key).strip()
        self.access_token = str(access_token).strip()
        self.ambiente = str(ambiente).strip().upper()
        self.activo = bool(activo)
        self.tienda_id = self.id_tienda


class ObtenerConfiguracionMercadoPagoUseCase:
    """Recupera la configuración de Mercado Pago con el token enmascarado."""

    def execute(self, id_tienda: Any, *args, **kwargs) -> Dict[str, Any]:
        tienda_pk = getattr(id_tienda, "id_tienda", None) or getattr(id_tienda, "pk", None) or id_tienda
        config = ConfiguracionMercadoPago.objects.select_related("id_tienda").filter(id_tienda_id=tienda_pk).first()

        if not config:
            tienda = Tienda.objects.filter(pk=tienda_pk).first() or type("TiendaRef", (), {"id_tienda": tienda_pk})()
            return {
                "id_tienda": tienda,
                "public_key": "",
                "ambiente": "SANDBOX",
                "activo": False,
                "access_token_enmascarado": "",
                "fecha_actualizacion": None,
                "configurado": False,
            }

        return {
            "id_tienda": config.id_tienda,
            "public_key": config.public_key,
            "ambiente": config.ambiente,
            "activo": config.activo,
            "access_token_enmascarado": config.access_token_enmascarado,
            "fecha_actualizacion": config.fecha_actualizacion,
            "configurado": bool(config.public_key and config.access_token),
        }

    def ejecutar(self, *args, **kwargs) -> Dict[str, Any]:
        return self.execute(*args, **kwargs)


class GuardarConfiguracionMercadoPagoUseCase:
    """Valida reglas de negocio y persiste las credenciales de Mercado Pago."""

    def execute(self, *args, **kwargs) -> Dict[str, Any]:
        id_tienda = kwargs.get("id_tienda") or kwargs.get("tienda_id")
        dto = kwargs.get("dto") or kwargs.get("datos")

        if args:
            if len(args) == 1:
                dto = args[0]
            elif len(args) >= 2:
                id_tienda = args[0]
                dto = args[1]

        if id_tienda is None and dto is not None:
            id_tienda = getattr(dto, "id_tienda", None) or getattr(dto, "tienda_id", None)
            if id_tienda is None and isinstance(dto, dict):
                id_tienda = dto.get("id_tienda")

        tienda_pk = getattr(id_tienda, "id_tienda", None) or getattr(id_tienda, "pk", None) or id_tienda

        if isinstance(dto, dict):
            public_key = str(dto.get("public_key", "")).strip()
            access_token = str(dto.get("access_token", "")).strip()
            ambiente = str(dto.get("ambiente", "SANDBOX")).strip().upper()
            activo = bool(dto.get("activo", False))
        else:
            public_key = str(getattr(dto, "public_key", "")).strip()
            access_token = str(getattr(dto, "access_token", "")).strip()
            ambiente = str(getattr(dto, "ambiente", "SANDBOX")).strip().upper()
            activo = bool(getattr(dto, "activo", False))

        if ambiente not in ["SANDBOX", "PRODUCCION"]:
            raise ConfiguracionPagoInvalidaException("El ambiente debe ser SANDBOX o PRODUCCION.")

        if activo and not public_key:
            raise ConfiguracionPagoInvalidaException("La Public Key es obligatoria para activar Mercado Pago.")

        config, _ = ConfiguracionMercadoPago.objects.get_or_create(
            id_tienda_id=tienda_pk,
            defaults={
                "public_key": public_key,
                "access_token": access_token,
                "ambiente": ambiente,
                "activo": activo,
            },
        )

        config.public_key = public_key
        config.ambiente = ambiente
        config.activo = activo

        if access_token and not access_token.startswith("****"):
            config.access_token = access_token

        config.save()

        return {
            "id_tienda": config.id_tienda,
            "public_key": config.public_key,
            "ambiente": config.ambiente,
            "activo": config.activo,
            "access_token_enmascarado": config.access_token_enmascarado,
            "fecha_actualizacion": config.fecha_actualizacion,
            "configurado": bool(config.public_key and config.access_token),
        }

    def ejecutar(self, *args, **kwargs) -> Dict[str, Any]:
        return self.execute(*args, **kwargs)








# ==========================================================
# CONFIGURACIÓN DE PAYPAL (ADMIN)
# ==========================================================

class GuardarConfiguracionPayPalDTO:
    """
    DTO flexible compatible con instanciación directa o desempaquetado de serializer.
    """
    def __init__(
        self,
        client_id: str = "",
        client_secret: str = "",
        ambiente: str = "SANDBOX",
        activo: bool = False,
        id_tienda: Optional[int] = None,
        tienda_id: Optional[int] = None,
        *args,
        **kwargs,
    ):
        self.id_tienda = id_tienda if id_tienda is not None else tienda_id
        self.client_id = str(client_id).strip()
        self.client_secret = str(client_secret).strip()
        self.ambiente = str(ambiente).strip().upper()
        self.activo = bool(activo)
        self.tienda_id = self.id_tienda


class ObtenerConfiguracionPayPalUseCase:
    """Recupera la configuración de PayPal con el Secret enmascarado."""

    def execute(self, id_tienda: Any, *args, **kwargs) -> Dict[str, Any]:
        tienda_pk = getattr(id_tienda, "id_tienda", None) or getattr(id_tienda, "pk", None) or id_tienda
        config = ConfiguracionPayPal.objects.select_related("id_tienda").filter(id_tienda_id=tienda_pk).first()

        if not config:
            tienda = Tienda.objects.filter(pk=tienda_pk).first() or type("TiendaRef", (), {"id_tienda": tienda_pk})()
            return {
                "id_tienda": tienda,
                "client_id": "",
                "ambiente": "SANDBOX",
                "activo": False,
                "client_secret_enmascarado": "",
                "fecha_actualizacion": None,
                "configurado": False,
            }

        return {
            "id_tienda": config.id_tienda,
            "client_id": config.client_id,
            "ambiente": config.ambiente,
            "activo": config.activo,
            "client_secret_enmascarado": config.client_secret_enmascarado,
            "fecha_actualizacion": config.fecha_actualizacion,
            "configurado": bool(config.client_id and config.client_secret),
        }

    def ejecutar(self, *args, **kwargs) -> Dict[str, Any]:
        return self.execute(*args, **kwargs)


class GuardarConfiguracionPayPalUseCase:
    """Valida reglas de negocio y persiste las credenciales de PayPal."""

    def execute(self, *args, **kwargs) -> Dict[str, Any]:
        id_tienda = kwargs.get("id_tienda") or kwargs.get("tienda_id")
        dto = kwargs.get("dto") or kwargs.get("datos")

        if args:
            if len(args) == 1:
                dto = args[0]
            elif len(args) >= 2:
                id_tienda = args[0]
                dto = args[1]

        if id_tienda is None and dto is not None:
            id_tienda = getattr(dto, "id_tienda", None) or getattr(dto, "tienda_id", None)
            if id_tienda is None and isinstance(dto, dict):
                id_tienda = dto.get("id_tienda")

        tienda_pk = getattr(id_tienda, "id_tienda", None) or getattr(id_tienda, "pk", None) or id_tienda

        if isinstance(dto, dict):
            client_id = str(dto.get("client_id", "")).strip()
            client_secret = str(dto.get("client_secret", "")).strip()
            ambiente = str(dto.get("ambiente", "SANDBOX")).strip().upper()
            activo = bool(dto.get("activo", False))
        else:
            client_id = str(getattr(dto, "client_id", "")).strip()
            client_secret = str(getattr(dto, "client_secret", "")).strip()
            ambiente = str(getattr(dto, "ambiente", "SANDBOX")).strip().upper()
            activo = bool(getattr(dto, "activo", False))

        if ambiente not in ["SANDBOX", "LIVE"]:
            raise ConfiguracionPagoInvalidaException("El ambiente debe ser SANDBOX o LIVE.")

        if activo and not client_id:
            raise ConfiguracionPagoInvalidaException("El Client ID de PayPal es obligatorio para activar la pasarela.")

        config, _ = ConfiguracionPayPal.objects.get_or_create(
            id_tienda_id=tienda_pk,
            defaults={
                "client_id": client_id,
                "client_secret": client_secret,
                "ambiente": ambiente,
                "activo": activo,
            },
        )

        config.client_id = client_id
        config.ambiente = ambiente
        config.activo = activo

        # Solo actualizar secret si no viene enmascarado
        if client_secret and not client_secret.startswith("****"):
            config.client_secret = client_secret

        config.save()

        return {
            "id_tienda": config.id_tienda,
            "client_id": config.client_id,
            "ambiente": config.ambiente,
            "activo": config.activo,
            "client_secret_enmascarado": config.client_secret_enmascarado,
            "fecha_actualizacion": config.fecha_actualizacion,
            "configurado": bool(config.client_id and config.client_secret),
        }

    def ejecutar(self, *args, **kwargs) -> Dict[str, Any]:
        return self.execute(*args, **kwargs)

# ==========================================================
# CONFIGURACIÓN TRANSBANK (PANEL EMPRENDEDOR / ADMIN)
# ==========================================================

class GuardarConfiguracionTransbankDTO:
    """
    DTO flexible compatible con instanciación posicional o por kwargs,
    con o sin id_tienda provisto en el payload.
    """
    def __init__(
        self,
        codigo_comercio: str = "",
        api_key: str = "",
        ambiente: str = "INTEGRACION",
        activo: bool = True,
        id_tienda: Optional[int] = None,
        tienda_id: Optional[int] = None,
        *args,
        **kwargs,
    ):
        if isinstance(codigo_comercio, int):
            self.id_tienda = codigo_comercio
            self.codigo_comercio = str(api_key)
            self.api_key = str(ambiente)
            self.ambiente = str(activo) if isinstance(activo, str) else "INTEGRACION"
            self.activo = bool(kwargs.get("activo", True))
        else:
            self.id_tienda = id_tienda if id_tienda is not None else tienda_id
            self.codigo_comercio = str(codigo_comercio)
            self.api_key = str(api_key)
            self.ambiente = str(ambiente)
            self.activo = bool(activo)

        if "id_tienda" in kwargs and self.id_tienda is None:
            self.id_tienda = kwargs.get("id_tienda")
        if "tienda_id" in kwargs and self.id_tienda is None:
            self.id_tienda = kwargs.get("tienda_id")

        self.tienda_id = self.id_tienda

        for k, v in kwargs.items():
            setattr(self, k, v)


class ObtenerConfiguracionTransbankUseCase:
    """Recupera la configuración de Transbank con la API Key enmascarada."""

    def execute(self, id_tienda: Any, *args, **kwargs) -> Dict[str, Any]:
        tienda_pk = getattr(id_tienda, "id_tienda", None) or getattr(id_tienda, "pk", None) or id_tienda
        config = ConfiguracionTransbank.objects.filter(id_tienda_id=tienda_pk).first()
        if not config:
            return {
                "id_tienda": tienda_pk,
                "codigo_comercio": "",
                "ambiente": "INTEGRACION",
                "activo": False,
                "api_key_enmascarada": "",
                "fecha_actualizacion": None,
                "configurado": False,
            }

        return {
            "id_tienda": config.id_tienda,
            "codigo_comercio": config.codigo_comercio,
            "ambiente": config.ambiente,
            "activo": config.activo,
            "api_key_enmascarada": config.api_key_enmascarada,
            "fecha_actualizacion": config.fecha_actualizacion,
            "configurado": True,
        }

    def ejecutar(self, *args, **kwargs) -> Dict[str, Any]:
        return self.execute(*args, **kwargs)


class GuardarConfiguracionTransbankUseCase:
    """Aplica reglas de negocio y persiste las credenciales de la tienda."""

    CODIGO_INTEGRACION = "597055555532"

    def execute(self, *args, **kwargs) -> Dict[str, Any]:
        id_tienda = kwargs.get("id_tienda") or kwargs.get("tienda_id") or kwargs.get("tienda")
        dto = kwargs.get("dto") or kwargs.get("datos") or kwargs.get("datos_validados")

        if args:
            if len(args) == 1:
                if isinstance(args[0], (int, str)) and str(args[0]).isdigit():
                    id_tienda = args[0]
                else:
                    dto = args[0]
            elif len(args) >= 2:
                id_tienda = args[0]
                dto = args[1]

        if id_tienda is None and dto is not None:
            id_tienda = getattr(dto, "id_tienda", None) or getattr(dto, "tienda_id", None)
            if id_tienda is None and isinstance(dto, dict):
                id_tienda = dto.get("id_tienda") or dto.get("tienda_id")

        tienda_pk = getattr(id_tienda, "id_tienda", None) or getattr(id_tienda, "pk", None) or id_tienda

        if dto is None:
            raise ConfiguracionPagoInvalidaException("Los datos de configuración son obligatorios.")

        if isinstance(dto, dict):
            codigo_comercio = str(dto.get("codigo_comercio", "")).strip()
            api_key = str(dto.get("api_key", "")).strip()
            ambiente = str(dto.get("ambiente", "INTEGRACION")).strip().upper()
            activo = bool(dto.get("activo", True))
        else:
            codigo_comercio = str(getattr(dto, "codigo_comercio", "")).strip()
            api_key = str(getattr(dto, "api_key", "")).strip()
            ambiente = str(getattr(dto, "ambiente", "INTEGRACION")).strip().upper()
            activo = bool(getattr(dto, "activo", True))

        if ambiente == "PRODUCCION":
            if codigo_comercio == self.CODIGO_INTEGRACION:
                raise ConfiguracionPagoInvalidaException(
                    "No puedes utilizar el código de comercio de pruebas en ambiente de PRODUCCIÓN."
                )
            if not api_key.startswith("****") and len(api_key) < 16:
                raise ConfiguracionPagoInvalidaException(
                    "La API Key de producción debe contener al menos 16 caracteres."
                )

        config, _ = ConfiguracionTransbank.objects.get_or_create(
            id_tienda_id=tienda_pk,
            defaults={
                "codigo_comercio": codigo_comercio,
                "api_key": api_key,
                "ambiente": ambiente,
                "activo": activo,
            },
        )

        config.codigo_comercio = codigo_comercio
        config.ambiente = ambiente
        config.activo = activo

        if api_key and not api_key.startswith("****"):
            config.api_key = api_key

        config.save()

        return {
            "id_tienda": config.id_tienda_id,
            "codigo_comercio": config.codigo_comercio,
            "ambiente": config.ambiente,
            "activo": config.activo,
            "api_key_enmascarada": config.api_key_enmascarada,
            "fecha_actualizacion": config.fecha_actualizacion,
            "configurado": True,
        }

    def ejecutar(self, *args, **kwargs) -> Dict[str, Any]:
        return self.execute(*args, **kwargs)


# ==========================================================
# PROCESAMIENTO WEBPAY PLUS (CHECKOUT)
# ==========================================================

@dataclass
class IniciarPagoTransbankDTO:
    id_tienda: int
    orden_compra: str
    monto: int
    session_id: str
    return_url: str


class IniciarPagoTransbankUseCase:
    """Valida la configuración de la tienda y delega el inicio de pago al adaptador."""

    def execute(self, dto: Any, *args, **kwargs) -> Dict[str, Any]:
        if dto is None and "dto" in kwargs:
            dto = kwargs["dto"]

        if isinstance(dto, dict):
            monto = dto.get("monto", 0)
            id_tienda = dto.get("id_tienda")
            orden_compra = dto.get("orden_compra")
            session_id = dto.get("session_id")
            return_url = dto.get("return_url")
        else:
            monto = getattr(dto, "monto", 0)
            id_tienda = getattr(dto, "id_tienda", None)
            orden_compra = getattr(dto, "orden_compra", "")
            session_id = getattr(dto, "session_id", "")
            return_url = getattr(dto, "return_url", "")

        if monto <= 0:
            raise ConfiguracionPagoInvalidaException("El monto a pagar debe ser mayor a 0.")

        tienda_pk = getattr(id_tienda, "id_tienda", None) or getattr(id_tienda, "pk", None) or id_tienda

        config = ConfiguracionTransbank.objects.filter(id_tienda_id=tienda_pk).first()
        if not config or not config.activo:
            raise TransbankConfiguracionFaltanteException(
                "La tienda no tiene habilitada la pasarela de pagos Transbank Webpay."
            )

        adaptador = TransbankWebpayAdapter(
            codigo_comercio=config.codigo_comercio,
            api_key=config.api_key,
            ambiente=config.ambiente,
        )

        return adaptador.iniciar_transaccion(
            orden_compra=orden_compra,
            session_id=session_id,
            monto=monto,
            return_url=return_url,
        )

    def ejecutar(self, *args, **kwargs) -> Dict[str, Any]:
        return self.execute(*args, **kwargs)


class ConfirmarPagoTransbankUseCase:
    """Confirma el resultado del pago mediante el token emitido por Webpay."""

    def execute(self, id_tienda: Any = None, token_ws: str = "", *args, **kwargs) -> Dict[str, Any]:
        if args:
            if len(args) == 1:
                token_ws = args[0]
            elif len(args) >= 2:
                id_tienda = args[0]
                token_ws = args[1]

        if "token_ws" in kwargs:
            token_ws = kwargs["token_ws"]
        if "id_tienda" in kwargs:
            id_tienda = kwargs["id_tienda"]

        if not token_ws:
            raise ConfiguracionPagoInvalidaException("El token de Webpay (token_ws) es obligatorio.")

        tienda_pk = getattr(id_tienda, "id_tienda", None) or getattr(id_tienda, "pk", None) or id_tienda

        config = ConfiguracionTransbank.objects.filter(id_tienda_id=tienda_pk).first()
        if not config:
            raise TransbankConfiguracionFaltanteException("Configuración de tienda no encontrada.")

        adaptador = TransbankWebpayAdapter(
            codigo_comercio=config.codigo_comercio,
            api_key=config.api_key,
            ambiente=config.ambiente,
        )

        return adaptador.confirmar_transaccion(token_ws=token_ws)

    def ejecutar(self, *args, **kwargs) -> Dict[str, Any]:
        return self.execute(*args, **kwargs)


# ==========================================================
# CASOS DE USO EXISTENTES DE CATÁLOGO Y CARRITO
# ==========================================================

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
    Obtiene los atributos personalizados de un producto activo:
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
        # Los productos documentales se desactivan por su ObjectId y tienda.
        if ObjectId.is_valid(str(id_producto)):
            repository = ProductRepository()
            product = repository.get_by_id(str(tienda_id), str(id_producto))
            if product is None:
                raise ValueError("El producto no existe en el catálogo.")
            if not product.get('activo', False):
                raise ValueError("El producto ya se encuentra eliminado.")
            if not repository.update(str(tienda_id), str(id_producto), {'activo': False}):
                raise ValueError("No se pudo desactivar el producto.")
            return {"exito": True, "mensaje": "Producto eliminado lógicamente de forma correcta."}
        try:
            id_producto = int(id_producto)
        except (TypeError, ValueError):
            raise ValueError("El producto no existe en el catálogo.") from None
        # 1. Soft Delete en PostgreSQL
        try:
            producto_pg = Producto.objects.get(id_producto=id_producto, id_tienda=tienda_id)
            if not producto_pg.activo:
                raise ValueError("El producto ya se encuentra eliminado.")

            producto_pg.activo = False
            producto_pg.save(update_fields=['activo'])
        except Producto.DoesNotExist:
            raise ValueError("El producto no existe en el catálogo.")

        db = get_mongo_db()
        productos_collection = db.productos

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
        for variant in data['variantes']:
            if self.repository.get_by_sku(tienda_id, variant['sku']):
                raise ValueError(f"El SKU '{variant['sku']}' ya existe en esta tienda.")
        slug = self._slug_disponible(tienda_id, slugify(data["nombre"]))

        producto = {
            "nombre": data["nombre"],
            "slug": slug,
            "descripcion": data.get("descripcion", ""),
            "categoria": data["categoria"],
            "activo": data.get("activo", True),
            "fecha_creacion": timezone.now(),
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
            slug = f"{base_slug or 'producto'}-{sufijo}"
        return slug


class CrearProductoUseCase:
    def ejecutar(self, tienda, datos_validados):
        if 'stock' in datos_validados:
            validate_stock(datos_validados['stock'])

        # Separamos los campos que sí pertenecen al modelo Producto (Postgres)
        # de los que solo existen para el catálogo (Mongo).
        datos = dict(datos_validados)
        categoria = datos.pop('categoria', '') or 'Sin categoría'
        descripcion = datos.pop('descripcion', '')
        imagenes = datos.pop('imagenes', [])

        producto = Producto.objects.create(
            id_tienda=tienda,
            **datos
        )

        # Creamos el documento equivalente en Mongo, vinculado por id_producto,
        # para que el catálogo público y la gestión de variantes funcionen.
        slug_base = slugify(producto.nombre) or f"producto-{producto.id_producto}"
        slug = slug_base
        sufijo = 1
        repositorio = ProductRepository()
        while repositorio.get_by_slug(str(tienda.pk), slug):
            sufijo += 1
            slug = f"{slug_base}-{sufijo}"

        repositorio.create(str(tienda.pk), {
            'id_producto': producto.id_producto,
            'nombre': producto.nombre,
            'slug': slug,
            'descripcion': descripcion,
            'categoria': categoria,
            'activo': producto.activo,
            'imagenes': imagenes,
            'atributos_generales': [],
            'variantes': [],
            'seo': {},
        })

        return producto


class ProductEditConflict(ValueError):
    pass


class UpdateCatalogProductUseCase:
    def __init__(self, repository: ProductRepository):
        self.repository = repository

    def execute(self, tienda_id, original, data, revision):
        if revision != self.repository.revision(original):
            raise ProductEditConflict("El producto cambió desde que lo abriste. Recarga antes de guardar.")
        for variant in data.get('variantes', []):
            existing = self.repository.get_by_sku(tienda_id, variant['sku'])
            if existing and existing['_id'] != original['_id']:
                raise ValueError(f"El SKU '{variant['sku']}' ya existe en esta tienda.")
        # Mantener metadatos legacy de variantes que siguen existiendo.
        if 'variantes' in data:
            previous = {v['sku']: v for v in original.get('variantes', [])}
            data = {**data, 'variantes': [
                {**previous.get(v['sku'], {}), **v} for v in data['variantes']
            ]}
        product = self.repository.update_catalog(tienda_id, original, data)
        if product is None:
            raise ProductEditConflict("El producto cambió durante el guardado. Recarga antes de guardar.")
        return product

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
    1. Cantidad estrictamente mayor a 0.
    2. La cantidad solicitada no puede superar el stock físico del producto.
    3. El ítem debe pertenecer al carrito activo del usuario autenticado.
    """

    def execute(self, dto: ModificarCantidadDTO) -> ItemCarrito:
        if dto.nueva_cantidad <= 0:
            raise CantidadInvalidaException("La cantidad debe ser mayor a 0.")

        try:
            item = ItemCarrito.objects.select_related('id_producto', 'id_carrito').get(
                pk=dto.id_item_carrito,
                id_carrito__id_usuario_id=dto.usuario_id
            )
        except ItemCarrito.DoesNotExist:
            raise ItemCarritoNoEncontradoException("El producto no existe en tu carrito.")

        producto = item.id_producto

        if not producto.activo:
            raise StockInsuficienteException("El producto ya no se encuentra disponible para la venta.")

        if dto.nueva_cantidad > producto.stock:
            raise StockInsuficienteException(
                f"No hay stock suficiente. Stock disponible: {producto.stock} unidades."
            )

        item.cantidad = dto.nueva_cantidad
        item.save(update_fields=['cantidad'])

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
        if dto.cantidad <= 0:
            raise CantidadInvalidaException("La cantidad agregada debe ser mayor a 0.")

        usuario_core = Usuario.objects.filter(id_usuario=dto.usuario_id).first()
        if not usuario_core:
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

        try:
            producto = Producto.objects.get(pk=dto.id_producto, activo=True)
        except Producto.DoesNotExist:
            raise ProductoNoEncontradoException(
                f"El producto con ID '{dto.id_producto}' no existe o no se encuentra activo."
            )

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

        filtro_item = {
            "id_carrito": carrito,
            "id_producto": producto,
        }
        tiene_columna_sku = hasattr(ItemCarrito, 'sku')
        if tiene_columna_sku and sku_normalizado:
            filtro_item["sku"] = sku_normalizado

        item_existente = ItemCarrito.objects.filter(**filtro_item).first()

        cantidad_final = dto.cantidad
        if item_existente:
            cantidad_final += item_existente.cantidad

        if cantidad_final > stock_disponible:
            raise StockInsuficienteException(
                f"Stock insuficiente. Solicitado total: {cantidad_final}, disponible: {stock_disponible}."
            )

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
    2. El ítem debe pertenecer al carrito activo del usuario autenticado.
    3. Al eliminar el ítem, se debe refrescar la fecha_actualizacion del carrito padre.
    """

    def execute(self, dto: EliminarItemCarritoDTO) -> None:
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
        item.delete()
        carrito.save(update_fields=["fecha_actualizacion"])
