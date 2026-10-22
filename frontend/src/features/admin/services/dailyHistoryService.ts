import { API_BASE_URL } from '../../../api';
import { authService } from '../../auth/services/authService';
import type { DashboardData } from './dashboardService';

export type DailyRow = DashboardData['historico'][number];

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const money = (value: unknown) => typeof value === 'string' && /^\d+\.\d{2}$/.test(value) && Number.isFinite(Number(value));
const day = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

async function getSerie(path: string, from: string, to: string, signal?: AbortSignal): Promise<{ serie: unknown[]; data: unknown }> {
  const token = authService.getToken();
  if (!token) throw new Error('Inicia sesión como propietario para consultar el historial.');
  const params = new URLSearchParams({ fecha_desde: from, fecha_hasta: to, agrupacion: 'dia', pagina: '1', tamano: '1' });
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}?${params}`, { headers: { Authorization: `Token ${token}` }, signal, cache: 'no-store' });
  } catch (error) {
    if (record(error) && error.name === 'AbortError') throw error;
    throw new Error('No se pudo conectar con el servidor. Revisa tu conexión e inténtalo nuevamente.');
  }
  let body: unknown = null;
  try { body = await response.json(); } catch { }
  if (response.status === 401) throw new Error('Tu sesión venció. Vuelve a iniciar sesión.');
  if (response.status === 403) throw new Error('Solo el propietario de la tienda puede consultar el historial.');
  if (!response.ok || !record(body) || body.exito !== true) {
    throw new Error(record(body) && typeof body.mensaje === 'string' && body.mensaje.trim() ? body.mensaje : 'No se pudo consultar el historial.');
  }
  const serie = record(body.data) ? body.data.serie : body.serie;
  if (!Array.isArray(serie)) throw new Error('El historial recibido es inválido.');
  return { serie, data: body.data };
}

/** Días AAAA-MM-DD entre dos fechas, ambas incluidas. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let time = Date.parse(`${from}T00:00:00Z`); time <= Date.parse(`${to}T00:00:00Z`); time += 86_400_000) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  return days;
}

export async function getDailyHistory(from: string, to: string, signal?: AbortSignal): Promise<DailyRow[]> {
  const [sales, orders] = await Promise.all([
    getSerie('/api/tienda/ventas/historial/', from, to, signal),
    getSerie('/api/tienda/pedidos/historial/', from, to, signal),
  ]);
  const sold = new Map<string, string>(), placed = new Map<string, number>();
  for (const row of sales.serie) {
    if (!record(row) || !day(row.periodo) || !count(row.cantidad_ventas) || !money(row.total_vendido)) throw new Error('El historial de ventas recibido es inválido.');
    sold.set(row.periodo as string, row.total_vendido as string);
  }
  for (const row of orders.serie) {
    if (!record(row) || !day(row.periodo) || !count(row.cantidad_pedidos)) throw new Error('El historial de pedidos recibido es inválido.');
    placed.set(row.periodo as string, row.cantidad_pedidos as number);
  }
  return daysBetween(from, to).map(fecha => ({ fecha, ventas: sold.get(fecha) ?? '0.00', pedidos: placed.get(fecha) ?? 0 }));
}
