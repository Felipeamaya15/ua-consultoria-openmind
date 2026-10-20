import { API_BASE_URL } from '../../../api';
import { authService } from '../../auth/services/authService';

export interface StoreInformation { nombre: string; descripcion: string | null }
export const STORE_INFORMATION_CHANGED = 'openmind:store-information-changed';
async function read(response: Response): Promise<StoreInformation> {
  const body = await response.json();
  if (!response.ok || body.exito !== true || typeof body.data?.nombre !== 'string'
    || !(body.data.descripcion === null || typeof body.data.descripcion === 'string')) {
    throw new Error(body.mensaje || 'No se pudo consultar o guardar la información del negocio.');
  }
  return body.data;
}
export async function fetchStoreInformation(signal?: AbortSignal) {
  return read(await fetch(`${API_BASE_URL}/api/tienda/configuracion/`, { signal, cache: 'no-store' }));
}
export async function saveStoreInformation(data: StoreInformation) {
  const token = authService.getToken();
  if (!token) throw new Error('Inicia sesión como propietario para guardar la configuración.');
  const result = await read(await fetch(`${API_BASE_URL}/api/tienda/configuracion/`, {
    method: 'PUT', headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }));
  window.dispatchEvent(new Event(STORE_INFORMATION_CHANGED));
  return result;
}
