import { API_BASE_URL } from '../../../api';
import { fetchInitialLoad } from '../../../core/http/initialLoad';
import { isRecord } from '../visual/resolveVisualConfig';
import type { StoreIdentity } from '../visual/storage';

/** Identity comes from the same tenant resolver as the public storefront APIs. */
export async function fetchStoreIdentity(signal?: AbortSignal): Promise<StoreIdentity> {
  const response = await fetchInitialLoad(`${API_BASE_URL}/api/visual-config/plantilla-seleccionada/`, { retry: true, signal });
  const body: unknown = await response.json();
  if (!response.ok || !isRecord(body) || body.exito !== true || !isRecord(body.data)) throw new Error('No se pudo confirmar la identidad de la tienda.');
  const id: unknown = body.data.tienda_id;
  if (typeof id === 'number' && !Number.isSafeInteger(id)) throw new Error('El backend devolvió una identidad fuera de rango.');
  if ((typeof id !== 'number' && typeof id !== 'string') || !/^[1-9]\d*$/.test(String(id))) throw new Error('El backend no devolvió una identidad válida de tienda.');
  return { apiBaseUrl: API_BASE_URL, storeId: String(id) };
}
