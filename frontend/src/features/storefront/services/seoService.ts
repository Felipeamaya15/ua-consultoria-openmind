/**
 * Servicio SEO para actualización dinámica de títulos y meta-etiquetas
 * en el navegador y motores de búsqueda.
 */

export interface ProductSeoData {
  name: string;
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
}

export interface StoreSeoData {
  name?: string;
  description?: string;
  metaTitle?: string;
  metaDescription?: string;
}

export interface ResolvedSeoMetadata {
  title: string;
  description: string;
}

/** Consulta y normaliza los metadatos SEO configurados para la tienda. */
export function resolveStoreSeoMetadata(store: StoreSeoData): ResolvedSeoMetadata {
  return {
    title: store.metaTitle?.trim() || store.name?.trim() || 'Tienda en línea',
    description: store.metaDescription?.trim() || store.description?.trim() || '',
  };
}

function setMetaAttribute(
  selector: string,
  attribute: 'name' | 'property',
  attributeValue: string,
  content: string,
): { element: HTMLMetaElement; created: boolean; previous: string | null } {
  let element = document.querySelector(selector) as HTMLMetaElement | null;
  const created = !element;
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, attributeValue);
    document.head.appendChild(element);
  }
  const previous = element.getAttribute('content');
  element.setAttribute('content', content);
  return { element, created, previous };
}

/** Aplica el SEO general en páginas públicas que no tienen metadatos más específicos. */
export function updateStoreSeo(store: StoreSeoData): () => void {
  if (typeof document === 'undefined') return () => {};

  const metadata = resolveStoreSeoMetadata(store);
  const previousTitle = document.title;
  document.title = metadata.title;

  const entries = [
    setMetaAttribute('meta[name="description"]', 'name', 'description', metadata.description),
    setMetaAttribute('meta[property="og:title"]', 'property', 'og:title', metadata.title),
    setMetaAttribute('meta[property="og:description"]', 'property', 'og:description', metadata.description),
  ];

  return () => {
    document.title = previousTitle;
    for (const { element, created, previous } of entries) {
      if (created) element.parentNode?.removeChild(element);
      else if (previous === null) element.removeAttribute('content');
      else element.setAttribute('content', previous);
    }
  };
}

/**
 * Actualiza dinámicamente el document.title y las meta-etiquetas de descripción y OpenGraph.
 * Retorna una función de limpieza para restaurar los valores anteriores.
 */
export function updateProductSeo(product: ProductSeoData, storeName?: string): () => void {
  if (typeof document === 'undefined') return () => {};

  const previousTitle = document.title;
  const rawTitle = product.seoTitle?.trim() || product.name.trim() || 'Producto';
  const storeLabel = storeName?.trim();
  document.title = storeLabel && !rawTitle.includes(storeLabel)
    ? `${rawTitle} · ${storeLabel}`
    : rawTitle;

  const description = product.seoDescription?.trim() || product.description?.trim() || '';
  // Siempre reemplazar contenido, también cuando esté vacío, para no heredar
  // la descripción de otra página o de un producto visitado previamente.
  const entries = [
    setMetaAttribute('meta[name="description"]', 'name', 'description', description),
    setMetaAttribute('meta[property="og:title"]', 'property', 'og:title', rawTitle),
    setMetaAttribute('meta[property="og:description"]', 'property', 'og:description', description),
  ];

  return () => {
    document.title = previousTitle;
    for (const { element, created, previous } of entries) {
      if (created) element.parentNode?.removeChild(element);
      else if (previous === null) element.removeAttribute('content');
      else element.setAttribute('content', previous);
    }
  };
}
