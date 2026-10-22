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
