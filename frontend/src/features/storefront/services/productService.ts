import type { Product } from "../data/mockAdminData";

const API_URL =
  (import.meta as any).env.VITE_API_URL || "http://localhost:8000";

function toBackendPayload(product: Product) {
  return {
    nombre: product.name,
    descripcion: product.description,
    categoria: product.category,
    imagenes: product.images,
    atributos_generales: [],
    variantes: product.variants.map((variant) => {
      const hasOffer =
        variant.comparePrice !== undefined &&
        variant.comparePrice !== null &&
        variant.comparePrice > variant.price;

      return {
        sku: variant.sku,
        precio: hasOffer ? variant.comparePrice! : variant.price,
        precio_oferta: hasOffer ? variant.price : null,
        stock: Math.max(0, Math.round(Number(variant.stock) || 0)),
        atributos_variante: Object.entries(variant.attributes).map(
          ([nombre, valor]) => ({
            clave: nombre.toLowerCase(),
            etiqueta: nombre,
            valor,
          }),
        ),
      };
    }),
    seo: {
      meta_titulo: product.seoTitle || "",
      meta_descripcion: product.seoDescription || "",
    },
  };
}

export async function createPublicProduct(
  product: Product,
): Promise<string> {
  const response = await fetch(`${API_URL}/api/catalog/productos/crear/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toBackendPayload(product)),
  });

  const body = await response.json();

  if (!response.ok || !body.exito) {
    throw new Error(
      body?.mensaje || "No se pudo guardar el producto en el catálogo.",
    );
  }

  return body.data.id;
}