import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchStoreIdentity } from '../services/storeIdentityService';
import type { StoreIdentity } from '../visual/storage';

const StoreIdentityContext = createContext<{ identity: StoreIdentity | null; loading: boolean; error: string; retry: () => void }>({ identity: null, loading: true, error: '', retry: () => {} });

export function StoreIdentityProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<StoreIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const retry = () => { setLoading(true); setError(''); setAttempt(value => value + 1); };
  useEffect(() => {
    const controller = new AbortController();
    fetchStoreIdentity(controller.signal)
      .then(value => { if (!controller.signal.aborted) setIdentity(value); })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error && error.name !== 'TypeError' ? error.message : 'No pudimos conectar con tu tienda. Comprueba la conexión e intenta nuevamente.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  return <StoreIdentityContext.Provider value={{ identity, loading, error, retry }}>{children}</StoreIdentityContext.Provider>;
}

export const useStoreIdentity = () => useContext(StoreIdentityContext);
