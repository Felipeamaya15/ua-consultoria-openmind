import { API_BASE_URL } from '../../../api';
import { authService } from '../../auth/services/authService';

export interface ReportMonth { mes: number; etiqueta: string; ventas: string; pedidos: number; pagados: number }
export interface SalesReport {
  tienda: string; anio: number; mes: number | null; anios_disponibles: number[];
  fecha_desde: string; fecha_hasta: string; moneda: 'CLP'; zona_horaria: string;
  total_ventas: string; total_pedidos: number; pedidos_pagados: number; ticket_promedio: string | null;
  meses: ReportMonth[]; distribucion_estados: { estado: string; etiqueta: string; pedidos: number }[];
  mejores_meses: { ventas: number[]; pedidos: number[] }; nota_fechas: string;
}
export function reportFilename(year: number, month?: number | null) {
  return `informe-ventas-pedidos-${String(year).padStart(4, '0')}${month ? `-${String(month).padStart(2, '0')}` : ''}.pdf`;
}
async function request(year?: number, month?: number | null, pdf = false, signal?: AbortSignal) {
  const token = authService.getToken();
  if (!token) throw new Error('Inicia sesión como propietario para consultar los informes.');
  const params = new URLSearchParams();
  if (year !== undefined) params.set('anio', String(year));
  if (month) params.set('mes', String(month));
  const response = await fetch(`${API_BASE_URL}/api/tienda/informes/${pdf ? 'pdf/' : ''}?${params}`, {
    headers: { Authorization: `Token ${token}` }, signal, cache: 'no-store',
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Tu sesión venció. Vuelve a iniciar sesión.');
    if (response.status === 403) throw new Error('Solo el propietario activo puede consultar los informes.');
    throw new Error('No se pudo obtener el informe. Revisa el período e intenta nuevamente.');
  }
  return response;
}
const money = (value: unknown) => typeof value === 'string' && /^\d+\.\d{2}$/.test(value) && Number.isFinite(Number(value));
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
export function validReport(data: SalesReport): boolean {
  return !!data && typeof data.tienda === 'string' && Number.isInteger(data.anio) && data.anio >= 1
    && (data.mes === null || (Number.isInteger(data.mes) && data.mes >= 1 && data.mes <= 12))
    && data.moneda === 'CLP' && data.zona_horaria === 'America/Santiago'
    && typeof data.nota_fechas === 'string' && typeof data.fecha_desde === 'string' && typeof data.fecha_hasta === 'string'
    && money(data.total_ventas) && count(data.total_pedidos) && count(data.pedidos_pagados)
    && (data.ticket_promedio === null || money(data.ticket_promedio))
    && Array.isArray(data.anios_disponibles) && data.anios_disponibles.length > 0 && data.anios_disponibles.every(y => Number.isInteger(y) && y >= 1)
    && Array.isArray(data.meses) && data.meses.length === (data.mes ? 1 : 12)
    && data.meses.every((r, i) => r && r.mes === (data.mes || i + 1) && typeof r.etiqueta === 'string' && money(r.ventas) && count(r.pedidos) && count(r.pagados))
    && Array.isArray(data.distribucion_estados) && data.distribucion_estados.every(r => r && typeof r.estado === 'string' && typeof r.etiqueta === 'string' && count(r.pedidos))
    && !!data.mejores_meses && ['ventas', 'pedidos'].every(key => {
      const months = data.mejores_meses[key as 'ventas' | 'pedidos'];
      return Array.isArray(months) && months.every(m => Number.isInteger(m) && m >= 1 && m <= 12);
    });
}
export async function getReport(year?: number, month?: number | null, signal?: AbortSignal): Promise<SalesReport> {
  const body = await (await request(year, month, false, signal)).json();
  if (body.exito !== true || !validReport(body.data)) throw new Error('El informe recibido no es válido.');
  return body.data;
}
export async function downloadReport(year: number, month: number | null, signal?: AbortSignal) {
  const response = await request(year, month, true, signal);
  if (!response.headers.get('Content-Type')?.includes('application/pdf')) throw new Error('El servidor no devolvió un PDF válido.');
  const blob = await response.blob();
  if (!blob.size) throw new Error('El informe PDF está vacío.');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = reportFilename(year, month);
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
