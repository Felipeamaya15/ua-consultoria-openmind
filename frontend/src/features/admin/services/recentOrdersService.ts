import { API_BASE_URL } from '../../../api';
import { authService } from '../../auth/services/authService';

/** Cantidad de órdenes recientes que muestra el dashboard. */
export const RECENT_ORDERS_LIMIT = 5;
const MAX_LIMIT = 20;

export interface RecentOrder {
  id_pedido: number;
  identificador: string | null;
  nombre_contacto: string;
  estado: string;
  estado_etiqueta: string;
  monto_total: string;
  fecha_creacion: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecentOrder(value: unknown): value is RecentOrder {
  if (!isRecord(value)) return false;
  return Number.isSafeInteger(value.id_pedido)
    && (typeof value.identificador === 'string' || value.identificador === null)
    && typeof value.nombre_contacto === 'string'
    && typeof value.estado === 'string' && typeof value.estado_etiqueta === 'string'
    && typeof value.monto_total === 'string' && value.monto_total.trim() !== '' && Number.isFinite(Number(value.monto_total))
    && typeof value.fecha_creacion === 'string' && !Number.isNaN(Date.parse(value.fecha_creacion));
}

function isAbort(error: unknown): boolean {
  return isRecord(error) && error.name === 'AbortError';
}

/** Trae las órdenes más recientes de la tienda (solo el propietario). */
export async function getRecentOrders(limit: number = RECENT_ORDERS_LIMIT, signal?: AbortSignal): Promise<RecentOrder[]> {
  const token = authService.getToken();
  if (!token) throw new Error('Inicia sesión como propietario para consultar las últimas órdenes.');
  const size = Number.isInteger(limit) && limit >= 1 && limit <= MAX_LIMIT ? limit : RECENT_ORDERS_LIMIT;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/tienda/pedidos/ultimos/?limite=${size}`, {
      headers: { Authorization: `Token ${token}` },
      signal,
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new Error('No se pudo conectar con el servidor. Revisa tu conexión e inténtalo nuevamente.');
  }
  let body: unknown = null;
  try { body = await response.json(); } catch { /* respuesta sin JSON: se informa más abajo */ }
  const data = isRecord(body) ? body : {};
  if (response.status === 401) throw new Error('Tu sesión venció. Vuelve a iniciar sesión.');
  if (response.status === 403) throw new Error('Solo el propietario de la tienda puede ver las últimas órdenes.');
  if (!response.ok || data.exito !== true) {
    throw new Error(typeof data.mensaje === 'string' && data.mensaje.trim() ? data.mensaje : 'No se pudieron consultar las últimas órdenes.');
  }
  if (!Array.isArray(data.data) || !data.data.every(isRecentOrder)) {
    throw new Error('El listado de últimas órdenes recibido es inválido.');
  }
  return data.data;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const twoDigits = (value: number) => String(value).padStart(2, '0');

/** "2026-10-13T18:30:00Z" -> "13 oct 2026, 15:30" (hora local). Devuelve '' si la fecha no es válida. */
export function formatRecentOrderDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}
