from typing import Dict, Any

from apps.catalog.infrastructure.repositories import ProductRepository
from apps.catalog.domain.stock import validate_stock


class VariantService:
    def __init__(self, repository=None):
        self.repo = repository if repository is not None else ProductRepository()

    @staticmethod
    def _normalizar_atributos_variante(atributos):
        if atributos is None:
            return []

        if not isinstance(atributos, list):
            raise ValueError(
                "Los atributos de la variante deben enviarse como una lista."
            )

        normalizados = []
        claves = set()

        for indice, atributo in enumerate(atributos, start=1):
            if not isinstance(atributo, dict):
                raise ValueError(
                    f"El atributo #{indice} debe ser un objeto válido."
                )

            clave = str(atributo.get("clave", "")).strip()
            etiqueta = str(atributo.get("etiqueta", "")).strip()
            valor = str(atributo.get("valor", "")).strip()

            faltantes = []

            if not clave:
                faltantes.append("clave")
            if not etiqueta:
                faltantes.append("etiqueta")
            if not valor:
                faltantes.append("valor")

            if faltantes:
                raise ValueError(
                    f"El atributo #{indice} está incompleto. "
                    f"Faltan: {', '.join(faltantes)}."
                )

            if clave in claves:
                raise ValueError(
                    f"El atributo '{clave}' está repetido en la variante."
                )

            claves.add(clave)

            normalizados.append({
                "clave": clave,
                "etiqueta": etiqueta,
                "valor": valor,
            })

        return normalizados


    def _obtener_esquema_atributos_producto(
        self,
        product_id: str,
        excluir_sku: str | None = None
    ):
        variantes = self.get_variants(product_id)

        # Primero intentamos obtener el esquema desde otra variante.
        for variante in variantes:
            sku_actual = str(variante.get("sku", "")).strip().upper()

            if excluir_sku and sku_actual == str(excluir_sku).strip().upper():
                continue

            atributos = (
                variante.get("atributos_variante")
                or variante.get("atributos")
                or []
            )

            if atributos:
                return {
                    str(attr.get("clave", "")).strip()
                    for attr in atributos
                    if isinstance(attr, dict)
                    and str(attr.get("clave", "")).strip()
                }

        # Si estamos actualizando la única variante del producto,
        # utilizamos su propio esquema actual como referencia.
        if excluir_sku:
            for variante in variantes:
                sku_actual = str(variante.get("sku", "")).strip().upper()

                if sku_actual == str(excluir_sku).strip().upper():
                    atributos = (
                        variante.get("atributos_variante")
                        or variante.get("atributos")
                        or []
                    )

                    if atributos:
                        return {
                            str(attr.get("clave", "")).strip()
                            for attr in atributos
                            if isinstance(attr, dict)
                            and str(attr.get("clave", "")).strip()
                        }

        return set()


    def _validar_atributos_contra_producto(
        self,
        product_id: str,
        atributos,
        excluir_sku: str | None = None
    ):
        atributos = self._normalizar_atributos_variante(atributos)

        esquema = self._obtener_esquema_atributos_producto(
            product_id,
            excluir_sku=excluir_sku
        )

        if not esquema:
            return atributos

        claves_recibidas = {
            atributo["clave"]
            for atributo in atributos
        }

        faltantes = sorted(esquema - claves_recibidas)
        desconocidos = sorted(claves_recibidas - esquema)

        errores = []

        if faltantes:
            errores.append(
                "faltan atributos requeridos: " + ", ".join(faltantes)
            )

        if desconocidos:
            errores.append(
                "se enviaron atributos no definidos para el producto: "
                + ", ".join(desconocidos)
            )

        if errores:
            raise ValueError("; ".join(errores))

        return atributos

    def get_variants(self, product_id: str) -> list:
        """Recupera todas las variantes asociadas a un producto."""
        producto = None

        if hasattr(self.repo, "get_by_id"):
            producto = self.repo.get_by_id(product_id)

        if not producto and hasattr(self.repo, "collection"):
            id_query = (
                self.repo._build_id_query(product_id)
                if hasattr(self.repo, "_build_id_query")
                else {"_id": product_id}
            )
            producto = self.repo.collection.find_one(id_query)

        if not producto:
            raise ValueError(f"No se encontró el producto con ID '{product_id}'.")

        return producto.get("variantes", [])
    

    def get_variant_by_sku(self, product_id: str, sku: str) -> dict:
        """Recupera una variante por SKU, id interno o índice numérico."""
        variantes = self.get_variants(product_id)

        if not variantes:
            raise ValueError(
                f"El producto con ID '{product_id}' no tiene variantes registradas."
            )

        clean_id = str(sku).strip().upper()

        for variante in variantes:
            if str(variante.get("sku", "")).strip().upper() == clean_id:
                return variante

        for variante in variantes:
            if (
                str(variante.get("id", "")).strip().upper() == clean_id
                or str(variante.get("id_variante", "")).strip().upper() == clean_id
            ):
                return variante

        if clean_id.isdigit():
            idx = int(clean_id)
            if 1 <= idx <= len(variantes):
                return variantes[idx - 1]

        raise ValueError(
            f"La variante con identificador/SKU '{sku}' no existe en este producto."
        )

    def delete_variant(self, product_id: str, sku: str, soft_delete: bool = False):
        """Elimina o desactiva una variante conservando la resolución flexible del SKU."""
        variante_existente = self.get_variant_by_sku(product_id, sku)
        sku_real = variante_existente.get("sku")

        if hasattr(self.repo, "delete_variant"):
            success = self.repo.delete_variant(
                product_id,
                sku_real,
                soft_delete=soft_delete,
            )
        else:
            id_query = (
                self.repo._build_id_query(product_id)
                if hasattr(self.repo, "_build_id_query")
                else {"_id": product_id}
            )

            if soft_delete:
                result = self.repo.collection.update_one(
                    {"$and": [id_query, {"variantes.sku": sku_real}]},
                    {
                        "$set": {
                            "variantes.$.es_activa": False,
                            "variantes.$.activo": False,
                        }
                    },
                )
            else:
                result = self.repo.collection.update_one(
                    id_query,
                    {"$pull": {"variantes": {"sku": sku_real}}},
                )

            success = result.modified_count > 0

        if not success:
            raise ValueError(
                f"No se pudo eliminar la variante con identificador/SKU '{sku}'."
            )

        return sku_real

    def create_variant(
        self,
        tienda_id_or_product_id: str,
        product_id_or_variant_data: Any,
        variant_data: Dict[str, Any] | None = None,
    ):
        """
        Crea una variante.

        Soporta las firmas:
        - create_variant(product_id, variant_data)
        - create_variant(tienda_id, product_id, variant_data)
        """
        if variant_data is None:
            tienda_id = None
            product_id = str(tienda_id_or_product_id)
            data = dict(product_id_or_variant_data)
        else:
            tienda_id = str(tienda_id_or_product_id)
            product_id = str(product_id_or_variant_data)
            data = dict(variant_data)

        data["sku"] = str(data["sku"]).strip().upper()

        atributos = data.get(
            "atributos_variante",
            data.pop("atributos", [])
        )

        data["atributos_variante"] = (
            self._validar_atributos_contra_producto(
                product_id,
                atributos
            )
        )

        if data.get("precio", 0) < 0:
            raise ValueError("El precio no puede ser negativo.")

        validate_stock(data.get("stock", 0))

        if tienda_id is None:
            success = self.repo.add_variant(product_id, data)
        else:
            success = self.repo.add_variant(tienda_id, product_id, data)

        if not success:
            raise ValueError("No se pudo agregar la variante o el producto no existe.")

        return data

    def update_variant(
        self,
        tienda_id_or_product_id: str,
        product_id_or_sku: str,
        sku_or_update_data: Any,
        update_data: Dict[str, Any] | None = None,
    ):
        """
        Actualiza una variante.

        Soporta las firmas:
        - update_variant(product_id, sku, update_data)
        - update_variant(tienda_id, product_id, sku, update_data)
        """
        if update_data is None:
            tienda_id = None
            product_id = str(tienda_id_or_product_id)
            sku = str(product_id_or_sku)
            data = dict(sku_or_update_data)
        else:
            tienda_id = str(tienda_id_or_product_id)
            product_id = str(product_id_or_sku)
            sku = str(sku_or_update_data)
            data = dict(update_data)

        if "precio" in data:
            try:
                precio = float(data["precio"])
            except (ValueError, TypeError) as error:
                raise ValueError("El precio debe ser un número válido.") from error

            if precio < 0:
                raise ValueError("El precio no puede ser negativo.")

            data["precio"] = precio

        if "stock" in data:
            try:
                stock = int(data["stock"])
            except (ValueError, TypeError) as error:
                raise ValueError("El stock debe ser un número entero válido.") from error

            validate_stock(stock)
            data["stock"] = stock

        variante_existente = self.get_variant_by_sku(product_id, sku)
        sku_real = variante_existente.get("sku")

        if "atributos" in data and "atributos_variante" not in data:
            data["atributos_variante"] = data.pop("atributos")

        if "atributos_variante" in data:
            data["atributos_variante"] = (
                self._validar_atributos_contra_producto(
                    product_id,
                    data["atributos_variante"],
                    excluir_sku=sku_real
                )
            )

        if tienda_id is None:
            success = self.repo.update_variant(product_id, sku_real, data)
        else:
            success = self.repo.update_variant(
                tienda_id,
                product_id,
                sku_real,
                data,
            )

        if not success:
            raise ValueError(f"No se encontró la variante '{sku}' o no hubo cambios.")

        return self.get_variant_by_sku(product_id, sku_real)

    def process_purchase(self, product_or_store_id: str, sku: str, cantidad: int = 1):
        """
        Procesa una compra/decremento de stock sin permitir valores negativos.

        Para el flujo nuevo de variantes, `product_or_store_id` es product_id y retorna
        la variante actualizada. Para compatibilidad con el flujo anterior basado en
        tienda, si no se puede resolver como producto se intenta el decremento por
        tienda y retorna True.
        """
        try:
            cantidad = int(cantidad)
        except (ValueError, TypeError) as error:
            raise ValueError("La cantidad a comprar debe ser un número entero válido.") from error

        validate_stock(cantidad)

        if cantidad <= 0:
            raise ValueError("La cantidad a comprar debe ser mayor a 0.")

        # Flujo nuevo: resolver producto + variante y devolver la variante actualizada.
        try:
            variante = self.get_variant_by_sku(product_or_store_id, sku)
        except ValueError:
            # Compatibilidad con el flujo anterior: primer argumento = tienda_id.
            actualizado = self.repo.decrease_stock(
                product_or_store_id,
                str(sku).strip().upper(),
                cantidad,
            )
            if not actualizado:
                raise ValueError(
                    f"Operación rechazada: La variante '{sku}' tiene stock 0 o insuficiente."
                )
            return True

        sku_real = variante.get("sku")
        stock_actual = int(variante.get("stock", 0))

        if stock_actual <= 0:
            raise ValueError(
                f"Operación rechazada: La variante '{sku_real}' tiene stock 0."
            )

        if stock_actual < cantidad:
            raise ValueError(
                "Operación rechazada: Stock insuficiente. "
                f"Stock disponible: {stock_actual}, solicitado: {cantidad}."
            )

        actualizado = self.repo.decrease_stock(sku_real, cantidad)
        if not actualizado:
            raise ValueError(
                f"Operación rechazada: La variante '{sku_real}' no tiene stock "
                "suficiente para completar la compra."
            )

        return self.get_variant_by_sku(product_or_store_id, sku_real)

    def update_stock(
        self,
        tienda_id: str,
        product_id: str,
        sku: str,
        stock: int,
    ):
        """Actualiza solo el stock de una variante de la tienda indicada."""
        validate_stock(stock)
        return self.repo.update_variant_stock(
            tienda_id,
            product_id,
            sku,
            stock,
        )
