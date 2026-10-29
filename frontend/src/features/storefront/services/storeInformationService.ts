import { API_BASE_URL } from '../../../api';
import { authService } from '../../auth/services/authService';
import { requestJson } from '../../../shared/services/apiRequest';

export interface StoreInformation { nombre: string; descripcion: string | null; correo_negocio?:string }
export const STORE_INFORMATION_CHANGED = 'openmind:store-information-changed';
function read(data: unknown): StoreInformation {
  const value = data as StoreInformation | null;
  if (!value || typeof value.nombre !== 'string' || !(value.descripcion === null || typeof value.descripcion === 'string')) {
    throw new Error('No se pudo confirmar la información del negocio. Comprueba si se guardó antes de volver a intentarlo.');
  }
  return value;
}
export async function fetchStoreInformation(signal?: AbortSignal, administrative=false) {
  return read(await requestJson(`${API_BASE_URL}/api/tienda/configuracion/`, { signal, cache: 'no-store', ...(administrative && authService.getToken()?{headers:{Authorization:`Token ${authService.getToken()}`}}:{}) }));
}
export async function saveStoreInformation(data: StoreInformation) {
  const token = authService.getToken();
  if (!token) throw new Error('Inicia sesión como propietario para guardar la configuración.');
  const result = read(await requestJson(`${API_BASE_URL}/api/tienda/configuracion/`, {
    method: 'PUT', headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }));
  window.dispatchEvent(new Event(STORE_INFORMATION_CHANGED));
  return result;
}
