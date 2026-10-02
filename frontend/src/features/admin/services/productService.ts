import type { Product } from "../data/mockAdminData";

const API_URL =
  (import.meta as any).env.VITE_API_URL || "http://localhost:8000";

interface CrearProductoResponse {
  mensaje: string;
  id_producto: number;
}

async function crearProductoBase(product: Product): Promise<number> {
  const precios = product.variants.map((v) => v.price);
  const stockTotal = product.variants.reduce(
    (total, v) => total + (Number(v.stock) || 0),
    0,
  );

  const response = await fetch(`${API_URL}/api/catalog/productos/crear/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre: product.name,
      descripcion: product.description,
      categoria: product.category,
      imagenes: product.images,
      precio: precios.length ? Math.min(...precios) : 0,
      stock: stockTotal,
      activo: true,
    }),
  });

  const body: CrearProductoResponse = await response.json();

  if (!response.ok) {
    throw new Error(
      (body as any)?.mensaje ||
        "No se pudo crear el producto. Revisa los datos ingresados.",
    );
  }

  return body.id_producto;
}

async function agregarVariante(idProducto: number, variant: Product["variants"][number]) {
  const response = await fetch(
    `${API_URL}/api/catalog/productos/${idProducto}/variantes/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sku: variant.sku,
        precio: variant.price,
        stock: Math.max(0, Math.round(Number(variant.stock) || 0)),
        nombre: `Variante ${variant.sku}`,
        atributos_variante: Object.entries(variant.attributes).map(
          ([nombre, valor]) => ({
            clave: nombre.toLowerCase(),
            etiqueta: nombre,
            valor,
          }),
        ),
      }),
    },
  );

  const body = await response.json();

  if (!response.ok) {
    throw new Error(
      body?.error ||
        body?.mensaje ||
        `No se pudo agregar la variante ${variant.sku}.`,
    );
  }
}

export async function createPublicProduct(product: Product): Promise<string> {
  const idProducto = await crearProductoBase(product);

  for (const variant of product.variants) {
    await agregarVariante(idProducto, variant);
  }

  return String(idProducto);
}

function adaptAdminProduct(item: any): Product {
  const variantes = item.variantes ?? [];

  const variants = variantes.map((v: any, index: number) => ({
    id: v.sku || `variante-${index}`,
    sku: v.sku,
    attributes: Object.fromEntries(
      (v.atributos_variante ?? []).map((a: any) => [a.etiqueta, a.valor]),
    ),
    price: v.precio ?? 0,
    comparePrice: v.precio_oferta ?? undefined,
    stock: v.stock ?? 0,
    available: (v.stock ?? 0) > 0,
  }));

  const prices = variants.map((v: any) => v.price);

  return {
    id: String(item.id_producto),
    name: item.nombre,
    description: item.descripcion || "",
    category: item.categoria || "",
    images: item.imagenes && item.imagenes.length ? item.imagenes : [],
    basePrice: prices.length ? Math.min(...prices) : 0,
    variants,
    attributes: {},
    tags: [],
    featured: false,
    status: item.activo ? "active" : "archived",
    seoTitle: item.seo?.meta_titulo,
    seoDescription: item.seo?.meta_descripcion,
    createdAt: "",
  };
}

export async function fetchAdminProducts(): Promise<Product[]> {
  const response = await fetch(`${API_URL}/api/catalog/productos/admin/`);
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body?.mensaje || "No se pudieron obtener los productos.");
  }

  return (body.productos ?? []).map(adaptAdminProduct);
}