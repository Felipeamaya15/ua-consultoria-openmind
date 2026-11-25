import { useEffect, useMemo, useState } from 'react';
import { comunasDeRegion } from '../data/comunasChile';
import { getComunasChilexpress, getComunasChilexpressAdmin } from '../services/shippingService';

const cache = new Map<string, string[]>();

interface Credenciales {
  clave?: string;
  ambiente?: string;
}

export function useComunasChilexpress(region: string, credenciales?: Credenciales): string[] {
  const clave = (credenciales?.clave || '').trim();
  const ambiente = credenciales?.ambiente || 'SANDBOX';
  const usaClave = clave !== '' && !clave.startsWith('*');
  const fallback = useMemo(() => comunasDeRegion(region), [region]);
  const [remote, setRemote] = useState<{ id: string; comunas: string[] } | null>(null);
  const id = `${region}|${usaClave ? ambiente : 'tienda'}`;

  useEffect(() => {
    if (!region) return;
    const cached = cache.get(id);
    if (cached) {
      setRemote({ id, comunas: cached });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const request = usaClave
        ? getComunasChilexpressAdmin(region, clave, ambiente, controller.signal)
        : getComunasChilexpress(region, controller.signal);
      request.then((comunas) => {
        if (controller.signal.aborted || !comunas) return;
        cache.set(id, comunas);
        setRemote({ id, comunas });
      });
    }, usaClave ? 600 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [id, region, usaClave, clave, ambiente]);

  return remote && remote.id === id ? remote.comunas : fallback;
}
