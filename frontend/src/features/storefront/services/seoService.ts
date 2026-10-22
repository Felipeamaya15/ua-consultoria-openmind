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
  if (typeof document === 'undefined') {
    return () => {};
  }

  const previousTitle = document.title;

  const rawTitle = (product.seoTitle && product.seoTitle.trim()) || product.name;
  const title = storeName && !rawTitle.includes(storeName)
    ? `${rawTitle} · ${storeName}`
    : rawTitle;

  document.title = title;

  const description = (product.seoDescription && product.seoDescription.trim())
    || (product.description && product.description.trim())
    || '';

  // Actualizar o crear meta description
  let descMeta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
  const previousDesc = descMeta ? descMeta.getAttribute('content') : null;
  const createdDescMeta = !descMeta;

  if (description) {
    if (!descMeta) {
      descMeta = document.createElement('meta');
      descMeta.setAttribute('name', 'description');
      document.head.appendChild(descMeta);
    }
    descMeta.setAttribute('content', description);
  }

  // Actualizar o crear og:title y og:description
  let ogTitle = document.querySelector('meta[property="og:title"]') as HTMLMetaElement | null;
  const prevOgTitle = ogTitle ? ogTitle.getAttribute('content') : null;
  if (!ogTitle) {
    ogTitle = document.createElement('meta');
    ogTitle.setAttribute('property', 'og:title');
    document.head.appendChild(ogTitle);
  }
  ogTitle.setAttribute('content', rawTitle);

  let ogDesc = document.querySelector('meta[property="og:description"]') as HTMLMetaElement | null;
  const prevOgDesc = ogDesc ? ogDesc.getAttribute('content') : null;
  if (description) {
    if (!ogDesc) {
      ogDesc = document.createElement('meta');
      ogDesc.setAttribute('property', 'og:description');
      document.head.appendChild(ogDesc);
    }
    ogDesc.setAttribute('content', description);
  }

  return () => {
    document.title = previousTitle;
    if (createdDescMeta && descMeta && descMeta.parentNode) {
      descMeta.parentNode.removeChild(descMeta);
    } else if (descMeta && previousDesc !== null) {
      descMeta.setAttribute('content', previousDesc);
    }

    if (ogTitle) {
      if (prevOgTitle !== null) ogTitle.setAttribute('content', prevOgTitle);
      else if (ogTitle.parentNode) ogTitle.parentNode.removeChild(ogTitle);
    }

    if (ogDesc) {
      if (prevOgDesc !== null) ogDesc.setAttribute('content', prevOgDesc);
      else if (ogDesc.parentNode) ogDesc.parentNode.removeChild(ogDesc);
    }
  };
}
