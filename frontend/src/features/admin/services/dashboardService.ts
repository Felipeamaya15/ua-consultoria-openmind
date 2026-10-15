import { API_BASE_URL } from '../../../api';
import { authService } from '../../auth/services/authService';

export type DashboardPeriod = '7' | '30' | 'year';
export interface DashboardData {
  fecha_desde: string;
  fecha_hasta: string;
  zona_horaria: string;
  moneda: 'CLP';
  total_ventas: string;
  total_pedidos: number;
  por_despachar: number;
  historico: { fecha: string; ventas: string; pedidos: number }[];
  pedidos_pagados?: number;
  ticket_promedio?: string | null;
  distribucion_estados?: { estado: string; etiqueta: string; pedidos: number }[];
  comparacion?: {
    fecha_desde: string; fecha_hasta: string | null; total_ventas: string; total_pedidos: number;
    variacion_ventas: string | null; variacion_pedidos: string | null;
  };
}
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const money = (value: unknown) => typeof value === 'string' && /^\d+\.\d{2}$/.test(value) && Number.isFinite(Number(value));
const date = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
function valid(value: unknown): value is DashboardData {
  const percent = (v: unknown) => v === null || (typeof v === 'string' && /^-?\d+\.\d{2}$/.test(v) && Number.isFinite(Number(v)));
  return record(value) && date(value.fecha_desde) && date(value.fecha_hasta)
    && value.zona_horaria === 'America/Santiago' && value.moneda === 'CLP'
    && money(value.total_ventas) && count(value.total_pedidos) && count(value.por_despachar)
    && Array.isArray(value.historico) && value.historico.every(row =>
      record(row) && date(row.fecha) && money(row.ventas) && count(row.pedidos))
    && (value.pedidos_pagados === undefined || count(value.pedidos_pagados))
    && (value.ticket_promedio === undefined || value.ticket_promedio === null || money(value.ticket_promedio))
    && (value.distribucion_estados === undefined || (Array.isArray(value.distribucion_estados) && value.distribucion_estados.every(row =>
      record(row) && typeof row.estado === 'string' && typeof row.etiqueta === 'string' && count(row.pedidos))))
    && (value.comparacion === undefined || (record(value.comparacion) && date(value.comparacion.fecha_desde)
      && (value.comparacion.fecha_hasta === null || date(value.comparacion.fecha_hasta))
      && money(value.comparacion.total_ventas) && count(value.comparacion.total_pedidos)
      && percent(value.comparacion.variacion_ventas) && percent(value.comparacion.variacion_pedidos)));
}
/** La tienda se resuelve y autoriza en el servidor; el cliente solo envía el período. */
export async function getDashboard(period: DashboardPeriod, signal?: AbortSignal): Promise<DashboardData> {
  const token = authService.getToken();
  if (!token) throw new Error('Inicia sesión como propietario para consultar las estadísticas.');
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/tienda/dashboard/?periodo=${period}`, {
      headers: { Authorization: `Token ${token}` }, signal, cache: 'no-store',
    });
  } catch (error) {
    if (record(error) && error.name === 'AbortError') throw error;
    throw new Error('No se pudo conectar con el servidor. Revisa tu conexión e inténtalo nuevamente.');
  }
  let body: unknown;
  try { body = await response.json(); } catch { body = null; }
  if (response.status === 401) throw new Error('Tu sesión venció. Vuelve a iniciar sesión.');
  if (response.status === 403) throw new Error('Solo el propietario activo puede consultar las estadísticas.');
  if (!response.ok || !record(body) || body.exito !== true) {
    throw new Error(record(body) && typeof body.mensaje === 'string' ? body.mensaje : 'No se pudieron consultar las estadísticas.');
  }
  if (!valid(body.data)) throw new Error('Las estadísticas recibidas son inválidas.');
  return body.data;
}
