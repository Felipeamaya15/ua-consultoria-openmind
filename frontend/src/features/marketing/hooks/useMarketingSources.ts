import { useEffect, useState } from 'react';
import { useAdmin } from '../../admin/context/AdminContext';
import { resolveStoreVisualConfig } from '../../storefront/visual/resolveVisualConfig';
import { marketingPalette } from '../domain/brand';
import { fetchMarketingBrand, fetchMarketingProducts } from '../services/marketingService';
import type { BrandSource, MarketingProduct, StoreBrand } from '../domain/types';

export function useMarketingSources() {
  const { config } = useAdmin();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ loading: true, products: [] as MarketingProduct[], brand: null as BrandSource | null, productError: '', brandError: '' });
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, products: [], brand: null, productError: '', brandError: '' });
    void Promise.allSettled([fetchMarketingProducts(controller.signal), fetchMarketingBrand(controller.signal)]).then(([catalog, brand]) => {
      if (controller.signal.aborted) return;
      setState({ loading: false,
        products: catalog.status === 'fulfilled' ? catalog.value : [],
        brand: brand.status === 'fulfilled' ? brand.value : null,
        productError: catalog.status === 'rejected' ? (catalog.reason instanceof Error ? catalog.reason.message : 'No pudimos cargar tus productos. Intenta nuevamente.') : '',
        brandError: brand.status === 'rejected' ? (brand.reason instanceof Error ? brand.reason.message : 'No pudimos cargar la identidad de tu tienda.') : '',
      });
    });
    return () => controller.abort();
  }, [attempt]);
  const colors = resolveStoreVisualConfig(config, config.template).global.colors;
  const brand: StoreBrand | null = state.brand ? { name: state.brand.name, logo: state.brand.logo,
    palette: marketingPalette(colors.primary, colors.secondary) } : null;
  return { ...state, brand, brandWarning: state.brand?.warning || '', refresh: () => { setState(value => ({ ...value, loading: true })); setAttempt(n => n + 1); } };
}
