import type { Product } from "../data/mockAdminData";

const API_URL =
  (import.meta as any).env.VITE_API_URL || "http://localhost:8000";

export interface CatalogAttribute { clave: string; etiqueta: string; valor: string }
export type AdminProduct = Product & {
  revision?: string;
  generalAttributes?: CatalogAttribute[];
  attributeLabels?: Record<string, string>;
};

function toBackendPayload(product: AdminProduct) {
  return {
    nombre: product.name,
    descripcion: product.description,
    categoria: product.category,
    activo: product.status === "active",
    imagenes: product.images,
    atributos_generales: product.generalAttributes ?? [],
    variantes: product.variants.map((variant) => {
      const hasOffer =
        variant.comparePrice !== undefined &&
        variant.comparePrice !== null &&
        variant.comparePrice > variant.price;

      return {
        sku: variant.sku.trim().toUpperCase(),
        precio: hasOffer ? variant.comparePrice! : variant.price,
        precio_oferta: hasOffer ? variant.price : null,
        stock: variant.stock,
        atributos_variante: Object.entries(variant.attributes).map(
          ([nombre, valor]) => ({
            clave: nombre.toLowerCase(),
            etiqueta: product.attributeLabels?.[nombre] || nombre,
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
  const token = (localStorage.getItem("token") || sessionStorage.getItem("token"));
  if (!token) throw new Error("Inicia sesión para crear productos.");
  const response = await fetch(`${API_URL}/api/catalog/productos/crear/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Token ${token}` },
    body: JSON.stringify(toBackendPayload(product)),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok || !body?.exito || !body?.data?.id) {
    throw new Error(
      body?.mensaje || (body ? JSON.stringify(body) : "No se pudo guardar el producto en el catálogo."),
    );
  }

  return body.data.id;
}

export async function deleteCatalogProduct(productId: string): Promise<void> {
  const token = (localStorage.getItem("token") || sessionStorage.getItem("token"));
  if (!token) throw new Error("Inicia sesión para eliminar productos.");
  const response = await fetch(`${API_URL}/api/catalog/productos/${productId}/eliminar/`, {
    method: "DELETE",
    headers: { Authorization: `Token ${token}` },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.exito) {
    throw new Error(body?.mensaje || "No se pudo eliminar el producto.");
  }
}


function adaptAdminProduct(item: any): AdminProduct {
  if (!/^[a-f0-9]{24}$/i.test(item.id)) throw new Error("El backend devolvió un ID de producto inválido.");
  const attributes: Record<string, string[]> = {};
  const labels: Record<string, string> = {};
  const variants = (item.variantes ?? []).map((v: any, index: number) => {
    const values: Record<string, string> = {};
    for (const a of v.atributos_variante ?? []) {
      values[a.clave] = a.valor;
      labels[a.clave] = a.etiqueta;
      attributes[a.clave] ??= [];
      if (!attributes[a.clave].includes(a.valor)) attributes[a.clave].push(a.valor);
    }
    const offer = v.precio_oferta != null && v.precio_oferta < v.precio;
    return { id: `variant-${index}`, sku: v.sku, attributes: values,
      price: offer ? v.precio_oferta : v.precio, comparePrice: offer ? v.precio : undefined,
      stock: v.stock, available: v.stock > 0 };
  });
  return {
    id: item.id, catalogId: item.id, revision: item.revision,
    name: item.nombre, description: item.descripcion ?? '', category: item.categoria,
    images: item.imagenes ?? [], variants, attributes, attributeLabels: labels,
    generalAttributes: item.atributos_generales ?? [],
    basePrice: variants.length ? Math.min(...variants.map((v: any) => v.price)) : 0,
    tags: [], featured: false, status: item.activo ? 'active' : 'archived',
    seoTitle: item.seo?.meta_titulo ?? '', seoDescription: item.seo?.meta_descripcion ?? '',
    createdAt: item.fecha_creacion ?? '',
  };
}

async function adminRequest(path: string, options: RequestInit = {}): Promise<any> {
  const token = (localStorage.getItem('token') || sessionStorage.getItem('token'));
  if (!token) throw new Error('Inicia sesión para administrar productos.');
  const response = await fetch(`${API_URL}/api/catalog/productos/${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Token ${token}` },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.exito) {
    throw new Error(body?.mensaje || (body ? JSON.stringify(body) : 'No se pudo consultar o guardar el catálogo.'));
  }
  return body.data;
}

export async function fetchAdminProducts(): Promise<AdminProduct[]> {
  const data = await adminRequest('admin/listado/');
  if (!Array.isArray(data)) throw new Error('Listado administrativo inválido.');
  return data.map(adaptAdminProduct);
}

export async function fetchAdminProduct(id: string): Promise<AdminProduct> {
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new Error('Este ID local o SQL no identifica un producto Mongo. Abre un producto del listado real.');
  return adaptAdminProduct(await adminRequest(`${id}/admin/`));
}

export async function updateCatalogProduct(product: AdminProduct): Promise<AdminProduct> {
  if (!/^[a-f0-9]{24}$/i.test(product.id) || !product.revision) {
    throw new Error('Recarga el producto desde el catálogo antes de editar.');
  }
  const data = await adminRequest(`${product.id}/actualizar/`, {
    method: 'PUT', body: JSON.stringify({ ...toBackendPayload(product), revision: product.revision }),
  });
  if (data?.id !== product.id) throw new Error('El backend no confirmó el producto actualizado.');
  return adaptAdminProduct(data);
}
