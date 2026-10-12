import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchStoreIdentity } from '../services/storeIdentityService';
import type { StoreIdentity } from '../visual/storage';

const StoreIdentityContext = createContext<{ identity: StoreIdentity | null; loading: boolean; error: string }>({ identity: null, loading: true, error: '' });

export function StoreIdentityProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<StoreIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetchStoreIdentity(controller.signal)
      .then(value => { if (!controller.signal.aborted) setIdentity(value); })
      .catch(() => { if (!controller.signal.aborted) setError('No se pudo confirmar la tienda. Recarga cuando el backend esté disponible.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  return <StoreIdentityContext.Provider value={{ identity, loading, error }}>{children}</StoreIdentityContext.Provider>;
}

export const useStoreIdentity = () => useContext(StoreIdentityContext);
