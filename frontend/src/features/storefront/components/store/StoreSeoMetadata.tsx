import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../../context/StoreContext';
import { updateStoreSeo } from '../../services/seoService';

/** Sincroniza la configuración SEO de la tienda con el documento público actual. */
export function StoreSeoMetadata() {
  const { pathname } = useLocation();
  const { config } = useStore();

  useEffect(() => {
    // ProductDetail administra sus metadatos específicos y no debe ser sobrescrito.
    if (/\/producto\//.test(pathname)) return;
    return updateStoreSeo(config);
  }, [pathname, config.name, config.description, config.metaTitle, config.metaDescription]);

  return null;
}
