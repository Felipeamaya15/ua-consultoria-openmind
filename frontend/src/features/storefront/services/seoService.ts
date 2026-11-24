

export const DEFAULT_STORE_SEO_TITLE = 'Tienda Online';
export const DEFAULT_STORE_SEO_DESCRIPTION = 'Descubre nuestro catálogo de productos y compra online con envío a todo Chile.';

const DOMAIN_SEO_DEFAULTS: Record<string, { title: string; description: string }> = {
  'tijax.cl': {
    title: 'La Magia de Tijax | Cosmética Natural y Productos Artesanales',
    description: 'Descubre productos artesanales, cosmética natural y cuidado capilar en La Magia de Tijax. Compra online con envío a todo Chile.',
  },
  'ecocrespo.cl': {
    title: 'EcoCrespo | Productos Sustentables y Cuidado Natural',
    description: 'Descubre productos sustentables, ecológicos y de cuidado natural en EcoCrespo. Compra online con envío a todo Chile.',
  },
};

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
  logo?: string;
}

export interface ResolvedSeoMetadata {
  title: string;
  description: string;
}

export function getDomainSeoDefaults(hostname?: string): ResolvedSeoMetadata {
  const rawHost =
    hostname ??
    (typeof window !== 'undefined' && window.location ? window.location.hostname : '');
  const cleanHost = rawHost.trim().toLowerCase().replace(/^www\./, '');
  return DOMAIN_SEO_DEFAULTS[cleanHost] ?? {
    title: DEFAULT_STORE_SEO_TITLE,
    description: DEFAULT_STORE_SEO_DESCRIPTION,
  };
}

export function resolveStoreSeoMetadata(store: StoreSeoData): ResolvedSeoMetadata {
  const defaults = getDomainSeoDefaults();
  return {
    title: store.metaTitle?.trim() || store.name?.trim() || defaults.title,
    description: store.metaDescription?.trim() || store.description?.trim() || defaults.description,
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

function getCurrentOgUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${window.location.pathname || '/'}`;
  }
  return '';
}

const DEFAULT_FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M9 20v-6h6v6"/></svg>',
  );

function setFavicon(href: string): () => void {
  // Siempre se declara un ícono: el logo de la tienda o uno neutro. Si no se
  // declara ninguno, el navegador conserva el ícono anterior en su caché.
  const trimmed = href.trim() || DEFAULT_FAVICON;
  let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
  const created = !link;
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'icon');
    document.head.appendChild(link);
  }
  const previousHref = link.getAttribute('href');
  const previousType = link.getAttribute('type');
  link.removeAttribute('type');
  link.setAttribute('href', trimmed);
  return () => {
    if (created) link?.parentNode?.removeChild(link);
    else {
      if (previousHref === null) link?.removeAttribute('href');
      else link?.setAttribute('href', previousHref);
      if (previousType !== null) link?.setAttribute('type', previousType);
    }
  };
}

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
  const restoreFavicon = setFavicon(store.logo || '');

  const currentUrl = getCurrentOgUrl();
  if (currentUrl) {
    entries.push(
      setMetaAttribute('meta[property="og:url"]', 'property', 'og:url', currentUrl),
    );
  }

  return () => {
    document.title = previousTitle;
    restoreFavicon();
    for (const { element, created, previous } of entries) {
      if (created) element.parentNode?.removeChild(element);
      else if (previous === null) element.removeAttribute('content');
      else element.setAttribute('content', previous);
    }
  };
}


export function updateProductSeo(product: ProductSeoData, storeName?: string): () => void {
  if (typeof document === 'undefined') return () => {};

  const previousTitle = document.title;
  const rawTitle = product.seoTitle?.trim() || product.name.trim() || 'Producto';
  const storeLabel = storeName?.trim();
  document.title = storeLabel && !rawTitle.includes(storeLabel)
    ? `${rawTitle} · ${storeLabel}`
    : rawTitle;

  const description = product.seoDescription?.trim() || product.description?.trim() || '';


  const entries = [
    setMetaAttribute('meta[name="description"]', 'name', 'description', description),
    setMetaAttribute('meta[property="og:title"]', 'property', 'og:title', rawTitle),
    setMetaAttribute('meta[property="og:description"]', 'property', 'og:description', description),
  ];

  const currentUrl = getCurrentOgUrl();
  if (currentUrl) {
    entries.push(
      setMetaAttribute('meta[property="og:url"]', 'property', 'og:url', currentUrl),
    );
  }

  return () => {
    document.title = previousTitle;
    for (const { element, created, previous } of entries) {
      if (created) element.parentNode?.removeChild(element);
      else if (previous === null) element.removeAttribute('content');
      else element.setAttribute('content', previous);
    }
  };
}
