import { API_BASE_URL } from '../../../api';
import { requestJson } from '../../../shared/services/apiRequest';

export type PaidStatus = 'disponible' | 'cerrada' | 'agotada' | 'iniciada' | 'finalizada';
export interface PaidQuote {
  titulo: string; tipo: 'taller' | 'servicio'; zona_horaria: string;
  inicio: string; termino: string; cierre: string; precio: number;
  venta: { cierre_minutos: number; tolerancia_minutos: number; cancelacion: 'evaluacion' | 'anticipada'; cancelacion_horas: number };
  condiciones: string[]; requisitos: string[]; modalidad: string[]; ubicacion: string[];
  version: string; cupos_disponibles: number; estado: PaidStatus; hora_servidor: string;
  modalidad_venta?: 'vivo' | 'grabado';
  acceso_dias?: number;
  compra_habilitada: boolean;
}
export const validActivityId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const int = (n: unknown, min: number, max: number) => typeof n === 'number' && Number.isSafeInteger(n) && n >= min && n <= max;
const instant = (x: unknown) => typeof x === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(x) && Number.isFinite(Date.parse(x));
export function validPaidQuote(value: unknown): value is PaidQuote {
  if (!value || typeof value !== 'object') return false;
  const q = value as PaidQuote;
  if (typeof q.titulo !== 'string' || !['taller','servicio'].includes(q.tipo) || typeof q.zona_horaria !== 'string' ||
      !instant(q.hora_servidor) || (q.modalidad_venta !== 'grabado' && (![q.inicio,q.termino,q.cierre].every(instant) || Date.parse(q.termino)<=Date.parse(q.inicio) || Date.parse(q.cierre)>Date.parse(q.inicio))) ||
      !int(q.precio,1,999999999999) || !int(q.cupos_disponibles,0,10000) || typeof q.version !== 'string' || !/^[a-f0-9]{64}$/.test(q.version) ||
      !['disponible','cerrada','agotada','iniciada','finalizada'].includes(q.estado) || typeof q.compra_habilitada !== 'boolean' ||
      !q.venta || !int(q.venta.cierre_minutos,0,10080) || !int(q.venta.tolerancia_minutos,0,120) || !int(q.venta.cancelacion_horas,0,720) ||
      !['evaluacion','anticipada'].includes(q.venta.cancelacion) || ![q.condiciones,q.requisitos,q.modalidad,q.ubicacion].every(a=>Array.isArray(a)&&a.every(x=>typeof x==='string'))) return false;
  if (q.modalidad_venta === 'grabado' && (!int(q.acceso_dias, 1, 3650) || q.tipo !== 'taller')) return false;
  try { new Intl.DateTimeFormat('es-CL',{timeZone:q.zona_horaria}).format(); } catch { return false; }
  return true;
}
export async function fetchPaidQuote(id: string, signal?: AbortSignal): Promise<PaidQuote> {
  if (!validActivityId(id)) throw new Error('Actividad no disponible.');
  const result = await requestJson(`${API_BASE_URL}/api/landing/actividades/${id}/disponibilidad/`, { cache:'no-store', signal });
  if (!validPaidQuote(result)) throw new Error('No pudimos verificar la disponibilidad.');
  return result;
}
export const paidStatusLabel: Record<PaidStatus,string> = { disponible:'Disponible', cerrada:'Inscripciones cerradas', agotada:'Sin cupos', iniciada:'Actividad en curso', finalizada:'Actividad finalizada' };
export function formatActivityDate(value:string, zone:string) {
  return new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',timeStyle:'short',timeZone:zone}).format(new Date(value));
}
export function canSelectPaidQuote(q:PaidQuote, quantity:number, version:string) {
  return q.estado==='disponible' && (q.modalidad_venta==='grabado'||Date.parse(q.hora_servidor)<Date.parse(q.cierre)) && q.version===version && int(quantity,1,q.cupos_disponibles);
}
