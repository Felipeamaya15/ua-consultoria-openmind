import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../../context/StoreContext';
import { updateStoreSeo } from '../../services/seoService';


export function StoreSeoMetadata() {
  const { pathname } = useLocation();
  const { config } = useStore();

  useEffect(() => {

    if (/\/producto\//.test(pathname)) return;
    return updateStoreSeo(config);
  }, [pathname, config.name, config.description, config.metaTitle, config.metaDescription]);

  return null;
}
