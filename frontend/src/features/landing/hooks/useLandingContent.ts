import { useEffect, useState } from 'react';
import { useStore } from '../../storefront/context/StoreContext';
import { fetchPublicProductDetail } from '../../storefront/services/catalogService';
import { normalizeLandingContent } from '../types/landingContent';

export function useLandingContent() {
  const { landing, landingProducts, landingCatalogError } = useStore();
  const content = normalizeLandingContent(landing?.contenido);
  const byId = new Map(landingProducts.map(p => [p.catalogId, p]));
  // OPENMIND_FEATURED_FULL_IMAGES_V2
  const baseFeatured = content.productos_destacados
    .map(id => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .slice(0, 6);

  const [fullImages, setFullImages] = useState<Record<string, string[]>>({});

  const featuredKey = baseFeatured
    .map(product => `${product.id}:${product.images.length}`)
    .join('|');

  useEffect(() => {
    const products = baseFeatured.filter(
      product => product.images.length < 2
    );

    if (!products.length) return;

    let active = true;
    const controller = new AbortController();

    void Promise.all(
      products.map(async product => {
        try {
          const detail = await fetchPublicProductDetail(
            product.id,
            { signal: controller.signal }
          );

          return {
            id: product.id,
            images: detail?.images?.filter(Boolean) ?? [],
          };
        } catch {
          return {
            id: product.id,
            images: [] as string[],
          };
        }
      })
    ).then(results => {
      if (!active) return;

      setFullImages(previous => {
        const next = { ...previous };

        for (const result of results) {
          if (result.images.length > 1) {
            next[result.id] = result.images;
          }
        }

        return next;
      });
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [featuredKey]);

  const featured = baseFeatured.map(product => ({
    ...product,
    images: fullImages[product.id]?.length
      ? fullImages[product.id]
      : product.images,
  }));
  const availableCategories = new Set(landingProducts.map(p => p.category));
  const categories = content.categorias.filter(c => availableCategories.has(c));
  return { content, featured, categories, catalogError: landingCatalogError };
}
