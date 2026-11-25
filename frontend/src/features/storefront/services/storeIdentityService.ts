import { API_BASE_URL } from '../../../api';
import { fetchInitialLoad } from '../../../core/http/initialLoad';
import { isRecord, setServerSelectedTemplate, getServerSelectedTemplate } from '../visual/resolveVisualConfig';
import type { StoreIdentity } from '../visual/storage';

export { setServerSelectedTemplate, getServerSelectedTemplate };

export async function fetchStoreIdentity(signal?: AbortSignal): Promise<StoreIdentity> {
  const response = await fetchInitialLoad(`${API_BASE_URL}/api/visual-config/plantilla-seleccionada/`, { retry: true, signal });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('No se pudo acceder a la tienda. Revisa tu sesión e intenta nuevamente.');
    if (response.status === 503) throw new Error('La tienda todavía no está disponible. Revisa su configuración e intenta nuevamente.');
    throw new Error(`La tienda no pudo responder correctamente (${response.status}). Intenta nuevamente.`);
  }
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error('La tienda respondió con datos que no pudimos reconocer. Intenta nuevamente.'); }
  if (!response.ok || !isRecord(body) || body.exito !== true || !isRecord(body.data)) throw new Error('No se pudo confirmar la identidad de la tienda.');
  const id: unknown = body.data.tienda_id;
  if (typeof id === 'number' && !Number.isSafeInteger(id)) throw new Error('La identificación de la tienda no es válida.');
  if ((typeof id !== 'number' && typeof id !== 'string') || !/^[1-9]\d*$/.test(String(id))) throw new Error('No se recibió una identificación válida de tienda.');
  const identity: StoreIdentity = { apiBaseUrl: API_BASE_URL, storeId: String(id) };
  setServerSelectedTemplate(identity, body.data.plantilla_activa ?? body.data.plantilla_seleccionada);
  return identity;
}
