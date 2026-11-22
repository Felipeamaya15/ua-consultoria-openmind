import { useEffect, useState } from 'react';
import { getSectoresChilexpress, type SectorChilexpress } from '../services/shippingService';

const cache = new Map<string, Record<string, SectorChilexpress[]>>();
const SIN_SECTORES: Record<string, SectorChilexpress[]> = {};

export function useSectoresChilexpress(region: string, activo = true): Record<string, SectorChilexpress[]> {
  const [remote, setRemote] = useState<{ region: string; sectores: Record<string, SectorChilexpress[]> } | null>(null);

  useEffect(() => {
    if (!region || !activo) return;
    const cached = cache.get(region);
    if (cached) {
      setRemote({ region, sectores: cached });
      return;
    }
    const controller = new AbortController();
    getSectoresChilexpress(region, controller.signal).then((sectores) => {
      if (controller.signal.aborted || !sectores) return;
      cache.set(region, sectores);
      setRemote({ region, sectores });
    });
    return () => controller.abort();
  }, [region, activo]);

  return activo && remote && remote.region === region ? remote.sectores : SIN_SECTORES;
}
