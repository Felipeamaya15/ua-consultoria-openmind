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
    // Sin desglose real de variantes a nivel de listado (el backend no
    // lo entrega ahí). Al dejar esto vacío, la tarjeta del catálogo
    // permite agregar al carrito directo si hay stock, usando el precio
    // y disponibilidad general; el detalle real de tallas/colores se
    // confirma al entrar a la ficha del producto.
    attributes: {},
    tags: [],
    featured: false,
    status: 'active',
    createdAt: '',
  };
}

export async function fetchPublicProducts(options?: InitialLoadOptions): Promise<Product[]> {
  const response = await fetchInitialLoad(`${API_URL}/api/catalog/productos/`, options);

  if (!response.ok) {
    throw new Error('No se pudo obtener el listado de productos');
  }

  const body: BackendEnvelope<BackendProductListItem[]> =
    await response.json();

  if (!body.exito) {
    throw new Error(body.mensaje || 'Error al obtener productos');
  }

  return body.data.map(adaptProduct);
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
  const variantesRaw = item.variantes ?? [];

  const variants = variantesRaw.map((v, index) => {
    const attributes: Record<string, string> = {};
    (v.atributos_variante ?? []).forEach((a) => {
      attributes[a.clave] = a.valor;
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
    tags: [],
    featured: false,
    status: 'active',
    seoTitle: item.seo?.meta_titulo ?? undefined,
    seoDescription: item.seo?.meta_descripcion ?? undefined,
    createdAt: '',
  };
}

export async function fetchPublicProductDetail(slug: string): Promise<Product | null> {
  const response = await fetch(`${API_URL}/api/catalog/productos/${slug}/`);

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