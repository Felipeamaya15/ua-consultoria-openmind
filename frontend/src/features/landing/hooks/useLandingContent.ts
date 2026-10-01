import { useStore } from '../../storefront/context/StoreContext';
import { normalizeLandingContent } from '../types/landingContent';

export function useLandingContent() {
  const { landing, landingProducts, landingCatalogError } = useStore();
  const content = normalizeLandingContent(landing?.contenido);
  const byId = new Map(landingProducts.map(p => [p.catalogId, p]));
  const featured = content.productos_destacados.map(id => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p).slice(0, 6);
  const availableCategories = new Set(landingProducts.map(p => p.category));
  const categories = content.categorias.filter(c => availableCategories.has(c));
  return { content, featured, categories, catalogError: landingCatalogError };
}
