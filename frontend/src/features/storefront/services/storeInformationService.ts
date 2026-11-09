import { API_BASE_URL } from '../../../api';
import { authService } from '../../auth/services/authService';
import { requestJson } from '../../../shared/services/apiRequest';

export interface StoreInformation { nombre: string; descripcion: string | null; correo_negocio?:string; horas_expiracion_pedido_en_linea?:number; horas_expiracion_pedido_manual?:number }
export interface OrderExpirationSettings { horas_expiracion_pedido_en_linea: number; horas_expiracion_pedido_manual: number }
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

function readExpiration(data: unknown): OrderExpirationSettings {
  const value = data as Partial<OrderExpirationSettings> | null;
  if (!value || !Number.isInteger(value.horas_expiracion_pedido_en_linea) || !Number.isInteger(value.horas_expiracion_pedido_manual)) {
    throw new Error('No se pudo confirmar el plazo de los pedidos. Comprueba si se guardó antes de volver a intentarlo.');
  }
  return { horas_expiracion_pedido_en_linea: value.horas_expiracion_pedido_en_linea as number, horas_expiracion_pedido_manual: value.horas_expiracion_pedido_manual as number };
}
export async function fetchOrderExpiration(signal?: AbortSignal) {
  const token = authService.getToken();
  if (!token) throw new Error('Inicia sesión como propietario para ver el plazo de los pedidos.');
  return readExpiration(await requestJson(`${API_BASE_URL}/api/tienda/configuracion/`, { signal, cache: 'no-store', headers: { Authorization: `Token ${token}` } }));
}
export async function saveOrderExpiration(settings: OrderExpirationSettings) {
  const token = authService.getToken();
  if (!token) throw new Error('Inicia sesión como propietario para guardar el plazo de los pedidos.');
  return readExpiration(await requestJson(`${API_BASE_URL}/api/tienda/configuracion/`, {
    method: 'PATCH', headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(settings),
  }));
}
