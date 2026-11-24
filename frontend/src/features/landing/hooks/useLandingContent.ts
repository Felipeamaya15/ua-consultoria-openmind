import { useEffect, useState } from 'react';
import type { Product } from '../../storefront/data/mockData';
import { useStore } from '../../storefront/context/StoreContext';
import { fetchPublicProductDetail } from '../../storefront/services/catalogService';
import { normalizeLandingContent } from '../types/landingContent';

export function useLandingContent() {
  const { landing, landingProducts, landingCatalogError } = useStore();
  const content = normalizeLandingContent(landing?.contenido);
  const byId = new Map(landingProducts.map(p => [p.catalogId, p]));

  const baseFeatured = content.productos_destacados
    .map(id => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .slice(0, 6);

  const [details,setDetails]=useState<{key:string;products:Record<string,Product>}>({key:'',products:{}});

  const featuredKey = baseFeatured
    .map(product => `${landing?.tienda}:${product.catalogId}:${product.id}:${product.images.length}:${product.variantsLoaded}`)
    .join('|');

  useEffect(() => {
    const products = baseFeatured.filter(
      product => product.variantsLoaded === false || product.images.length < 2
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

          return detail;
        } catch {
          return null;
        }
      })
    ).then(results => {
      if (!active) return;

      const products:Record<string,Product>={};
      for(const product of results)if(product)products[product.id]=product;
      setDetails({key:featuredKey,products});
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [featuredKey]);

  const featured = baseFeatured.map(product => ({...product,...(details.key===featuredKey?details.products[product.id]:undefined)}));
  const availableCategories = new Set(landingProducts.map(p => p.category));
  const categories = content.categorias.filter(c => availableCategories.has(c));
  return { content, featured, categories, catalogError: landingCatalogError };
}
