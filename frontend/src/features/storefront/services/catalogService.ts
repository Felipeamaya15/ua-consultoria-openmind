import { fetchInitialLoad, type InitialLoadOptions } from '../../../core/http/initialLoad';
import type { Product } from '../data/mockData';

const API_URL =
  (import.meta as any).env.VITE_API_URL || 'http://localhost:8000';

interface BackendProductListItem {
  id: string;
  nombre: string;
  slug: string;
  categoria: string;
  imagen: string | null;
  precio: number | null;
  precio_oferta: number | null;
  disponible: boolean;
}

interface BackendEnvelope<T> {
  exito: boolean;
  mensaje: string;
  data: T;
}

const PLACEHOLDER_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="100%" height="100%" fill="#e5e7eb"/></svg>',
  );

function adaptProduct(item: BackendProductListItem): Product {
  const hasOffer =
    item.precio_oferta !== null &&
    item.precio_oferta !== undefined &&
    item.precio !== null &&
    item.precio_oferta < item.precio;

  const currentPrice = hasOffer
    ? item.precio_oferta!
    : (item.precio ?? 0);

  return {
    id: item.slug,
    catalogId: item.id,
    name: item.nombre,
    description: '',
    category: item.categoria,
    images: [item.imagen || PLACEHOLDER_IMAGE],
    basePrice: currentPrice,
    comparePrice: hasOffer ? item.precio! : undefined,
    variants: [
      {
        id: 'default',
        sku: item.id,
        attributes: {},
        price: currentPrice,
        comparePrice: hasOffer ? item.precio! : undefined,
        stock: item.disponible ? 1 : 0,
        available: item.disponible,
      },
    ],
    variantsLoaded: false,
    attributes: {},
    tags: [],
    featured: false,
    status: 'active',
    createdAt: '',
  };
}

export async function fetchPublicProducts(options?: InitialLoadOptions & { includeVariants?: boolean }): Promise<Product[]> {
  const response = await fetchInitialLoad(`${API_URL}/api/catalog/productos/`, options);

  if (!response.ok) {
    throw new Error('No se pudo obtener el listado de productos');
  }

  const body: BackendEnvelope<BackendProductListItem[]> =
    await response.json();

  if (!body.exito) {
    throw new Error(body.mensaje || 'Error al obtener productos');
  }

  if (!options?.includeVariants) return body.data.map(adaptProduct);
  // El listado no incluye SKUs: cargar detalle con concurrencia acotada.
  const products: Array<Product | null> = new Array(body.data.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, body.data.length) }, async () => {
    while (next < body.data.length) {
      const index = next++;
      products[index] = await fetchPublicProductDetail(body.data[index].slug, options);
    }
  }));
  return products.filter((product): product is Product => product !== null);
}

interface BackendAtributo {
  clave: string;
  etiqueta: string;
  valor: string;
}

interface BackendVariante {
  sku: string;
  precio: number | null;
  precio_oferta: number | null;
  stock: number;
  atributos_variante?: BackendAtributo[];
}

interface BackendProductDetail {
  id: string;
  nombre: string;
  slug: string;
  descripcion?: string;
  categoria: string;
  imagenes?: string[];
  atributos_generales?: BackendAtributo[];
  variantes?: BackendVariante[];
  seo?: { meta_titulo?: string; meta_descripcion?: string };
}

function adaptProductDetail(item: BackendProductDetail): Product {
  const images = item.imagenes?.length ? item.imagenes : [PLACEHOLDER_IMAGE];
  const variantesRaw = (item.variantes ?? []).map(v => ({ ...v,
    atributos_variante: (v.atributos_variante ?? []).filter(a => a.clave?.trim() && a.valor?.trim()),
  }));
  const attributeLabels: Record<string, string> = {};

  const variants = variantesRaw.map((v, index) => {
    const attributes: Record<string, string> = {};
    (v.atributos_variante ?? []).forEach((a) => {
      attributes[a.clave] = a.valor;
      attributeLabels[a.clave] = a.etiqueta?.trim() || a.clave;
    });

    const hasOffer =
      v.precio_oferta !== null &&
      v.precio_oferta !== undefined &&
      v.precio !== null &&
      v.precio_oferta < v.precio;

    const currentPrice = hasOffer ? v.precio_oferta! : (v.precio ?? 0);

    return {
      id: v.sku || `variant-${index}`,
      sku: v.sku,
      attributes,
      price: currentPrice,
      comparePrice: hasOffer ? v.precio! : undefined,
      stock: v.stock,
      available: v.stock > 0,
    };
  });

  // Agrupa los valores de cada atributo (talla, color, etc.) para armar los selectores
  const grouped: Record<string, Set<string>> = {};
  variantesRaw.forEach((v) => {
    (v.atributos_variante ?? []).forEach((a) => {
      if (!grouped[a.clave]) grouped[a.clave] = new Set();
      grouped[a.clave].add(a.valor);
    });
  });
  const attributes: Record<string, string[]> = {};
  Object.entries(grouped).forEach(([k, v]) => (attributes[k] = Array.from(v)));

  const prices = variants.map((v) => v.price).filter((p) => p != null);
  const basePrice = prices.length ? Math.min(...prices) : 0;

  const compareCandidates = variants
    .map((v) => v.comparePrice)
    .filter((p): p is number => p !== undefined);
  const comparePrice = compareCandidates.length ? Math.max(...compareCandidates) : undefined;

  return {
    id: item.slug,
    catalogId: item.id,
    name: item.nombre,
    description: item.descripcion ?? '',
    category: item.categoria,
    images,
    basePrice,
    comparePrice,
    variants,
    attributes,
    attributeLabels,
    variantsLoaded: true,
    tags: [],
    featured: false,
    status: 'active',
    seoTitle: item.seo?.meta_titulo ?? undefined,
    seoDescription: item.seo?.meta_descripcion ?? undefined,
    createdAt: '',
  };
}

export async function fetchPublicProductDetail(slug: string, options?: InitialLoadOptions): Promise<Product | null> {
  const response = await fetchInitialLoad(`${API_URL}/api/catalog/productos/${encodeURIComponent(slug)}/`, options);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error('No se pudo obtener el detalle del producto');
  }

  const body: BackendEnvelope<BackendProductDetail> = await response.json();

  if (!body.exito) {
    throw new Error(body.mensaje || 'Error al obtener el producto');
  }

  return adaptProductDetail(body.data);
}
