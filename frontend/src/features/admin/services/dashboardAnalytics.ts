import type { DashboardData } from './dashboardService';
import { formatBusinessDate } from './businessTime';
export interface ChartBucket { from: string; to: string; sales: number; orders: number; label: string }
export const displayDashboardDate = formatBusinessDate;

/** Cada registro diario participa exactamente una vez; nunca se recortan fechas al navegar. */
export function dashboardBuckets(history: DashboardData['historico']): { buckets: ChartBucket[]; granularity: string } {
  const monthly = history.length > 100, weekly = history.length > 31 && !monthly;
  const groups = new Map<string, ChartBucket>();
  history.forEach((day, index) => {
    const key = monthly ? day.fecha.slice(0, 7) : weekly ? String(Math.floor(index / 7)) : day.fecha;
    const existing = groups.get(key);
    if (existing) { existing.to = day.fecha; existing.sales += Number(day.ventas); existing.orders += day.pedidos; }
    else groups.set(key, { from: day.fecha, to: day.fecha, sales: Number(day.ventas), orders: day.pedidos,
      label: monthly ? `${day.fecha.slice(5, 7)}/${day.fecha.slice(0, 4)}` : `${day.fecha.slice(8)}/${day.fecha.slice(5, 7)}` });
  });
  return { buckets: [...groups.values()], granularity: monthly ? 'Totales mensuales' : weekly ? 'Intervalos de 7 días' : 'Totales diarios' };
}

export function dashboardPeak(history: DashboardData['historico'], field: 'ventas' | 'pedidos') {
  const maximum = Math.max(0, ...history.map(row => Number(row[field])));
  const matches = history.filter(row => Number(row[field]) === maximum);
  return maximum > 0 ? { date: matches[0].fecha, value: maximum, ties: matches.length } : null;
}

export function variationLabel(value: string | null | undefined): string {
  if (value === null || value === undefined) return 'Sin base anterior para comparar';
  const number = Number(value);
  return `${number > 0 ? '+' : ''}${number.toLocaleString('es-CL', { maximumFractionDigits: 2 })}% vs. período anterior`;
}
