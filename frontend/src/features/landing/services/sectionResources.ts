import { API_BASE_URL } from '../../../api';
import { requestJson } from '../../../shared/services/apiRequest';
import { fetchMediaLibrary } from '../../marketing/services/mediaLibraryService';
import type { MediaResource } from '../../marketing/domain/mediaLibrary';

export type SectionResource = MediaResource & { imagen_publica?: string | null };
export async function fetchPublishedSectionResources(signal: AbortSignal): Promise<Record<string, SectionResource>> {
  const result = await requestJson(`${API_BASE_URL}/api/landing/multimedia-publica/`, { signal, cache: 'no-store' }) as { recursos?: Record<string, SectionResource> };
  if (!result?.recursos || typeof result.recursos !== 'object' || Array.isArray(result.recursos)) throw new Error('No pudimos confirmar los recursos publicados.');
  return result.recursos;
}
export async function fetchSectionLibrary(signal: AbortSignal): Promise<MediaResource[]> {
  const first = await fetchMediaLibrary(1, signal);
  const pages = await Promise.all(Array.from({ length: Math.min(8, Math.max(0, Math.ceil(first.total / 24) - 1)) }, (_, index) => fetchMediaLibrary(index + 2, signal)));
  return [...first.resultados, ...pages.flatMap(page => page.resultados)];
}
