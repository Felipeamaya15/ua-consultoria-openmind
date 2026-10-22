import { API_BASE_URL } from '../../../api';
import { authService } from '../../auth/services/authService';

export interface HistoryLine {
  id_item_pedido: number; nombre_producto: string; sku: string; cantidad: number; precio_unitario: string;
  total_linea: string; descuento_linea: null; atributos: Record<string, unknown>; atributos_variante: unknown[];
}
export interface HistoryOrder {
  id_pedido: number; identificador: string | null; nombre_contacto: string; correo_contacto: string;
  monto_total: string; estado: string; estado_etiqueta: string; fecha_creacion: string; metodo_pago: string;
  pago_estado: 'confirmado' | 'pendiente' | 'cancelado'; moneda: 'CLP'; costo_envio: string; descuento: string;
  items: HistoryLine[]; entrega?: { metodo?: string; direccion?: Record<string, unknown>; retiro?: { address?: string; seleccion?: { fecha: string; hora: string } } };
}
export interface Pagination { pagina: number; tamano: number; total: number; total_paginas: number }
export interface Contact { email: string; cantidad_pedidos: number; ultimo_pedido: string; consentimiento: 'autorizado' | 'retirado' | 'sin_registro'; fecha_consentimiento: string | null }
export interface SalesHistory {
  resumen: { cantidad_ventas: number; total_vendido: string; ticket_promedio: string };
  importes: { bruto_productos: string; descuentos: string; neto_productos: string; envio: string; importe_confirmado: string; nota_fechas: string; nota_descuentos: string; pedidos_sin_lineas: number };
  agrupacion: 'dia' | 'mes'; serie: { periodo: string; cantidad_ventas: number; total_vendido: string }[]; ventas: HistoryOrder[];
  productos: { nombre: string; sku: string; cantidad: number; bruto_lineas: string }[];
}
export const emptyPagination: Pagination = { pagina: 1, tamano: 20, total: 0, total_paginas: 0 };
const orderKeys = ['fecha_desde', 'fecha_hasta', 'q', 'estado', 'entrega', 'pago', 'metodo_pago', 'orden', 'pagina', 'tamano', 'agrupacion'];
export function historyParams(source: URLSearchParams): URLSearchParams {
  return new URLSearchParams([...source].filter(([key, value]) => orderKeys.includes(key) && value !== '' && !(key === 'estado' && value === 'all')));
}
const money = (v: unknown): v is string => typeof v === 'string' && /^\d+\.\d{2}$/.test(v);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function validHistoryOrder(v: unknown): v is HistoryOrder {
  if (!record(v)) return false;
  return Number.isSafeInteger(v.id_pedido) && Number(v.id_pedido) > 0 && (typeof v.identificador === 'string' || v.identificador === null)
    && ['nombre_contacto', 'correo_contacto', 'estado', 'estado_etiqueta', 'metodo_pago', 'fecha_creacion'].every(k => typeof v[k] === 'string')
    && Number.isFinite(Date.parse(String(v.fecha_creacion))) && ['confirmado', 'pendiente', 'cancelado'].includes(String(v.pago_estado))
    && v.moneda === 'CLP' && money(v.monto_total) && money(v.descuento) && money(v.costo_envio)
    && Array.isArray(v.items) && v.items.every(i => record(i) && typeof i.nombre_producto === 'string' && typeof i.sku === 'string'
      && Number.isSafeInteger(i.cantidad) && Number(i.cantidad) > 0 && money(i.precio_unitario) && money(i.total_linea));
}
function validPage(v: unknown): v is Pagination {
  return record(v) && ['pagina', 'tamano', 'total', 'total_paginas'].every(k => Number.isSafeInteger(v[k]) && Number(v[k]) >= 0)
    && Number(v.pagina) >= 1 && Number(v.tamano) >= 1 && Number(v.tamano) <= 100;
}
async function response(path: string, params: URLSearchParams, signal?: AbortSignal) {
  const token = authService.getToken();
  if (!token) throw new Error('Inicia sesión como propietario para consultar esta información.');
  const result = await fetch(`${API_BASE_URL}/api/tienda/${path}?${params}`, { headers: { Authorization: `Token ${token}` }, cache: 'no-store', signal });
  if (!result.ok) {
    if (result.status === 401) throw new Error('Tu sesión venció. Vuelve a iniciar sesión.');
    if (result.status === 403) throw new Error('Solo el propietario activo puede consultar esta información.');
    if (result.status === 404) throw new Error('El pedido no está disponible en esta tienda.');
    if (result.status === 400) throw new Error('Revisa los filtros. Para archivos grandes, reduce el período de exportación.');
    throw new Error('No se pudo completar la consulta. Revisa tu conexión e intenta nuevamente.');
  }
  return result;
}
async function page(path: string, params: URLSearchParams, signal?: AbortSignal) {
  const result: unknown = await (await response(path, params, signal)).json();
  if (!record(result) || result.exito !== true || !validPage(result.paginacion)) throw new Error('El historial recibido no es válido.');
  return { data: result.data, paginacion: result.paginacion };
}
export async function getOrderHistory(params: URLSearchParams, signal?: AbortSignal) {
  const result = await page('pedidos/historial/', historyParams(params), signal);
  if (!Array.isArray(result.data) || !result.data.every(validHistoryOrder)) throw new Error('El historial de pedidos recibido no es válido.');
  return { data: result.data, paginacion: result.paginacion };
}
export async function getOrderDetail(id: number, signal?: AbortSignal) {
  const result = await (await response(`pedidos/${id}/detalle/`, new URLSearchParams(), signal)).json();
  if (result.exito !== true || !validHistoryOrder(result.data)) throw new Error('El detalle del pedido recibido no es válido.');
  return result.data as HistoryOrder;
}
export async function getSalesHistory(params: URLSearchParams, signal?: AbortSignal) {
  const result = await page('ventas/historial/', historyParams(params), signal);
  const v = result.data;
  if (!record(v) || !record(v.resumen) || !record(v.importes) || !Array.isArray(v.ventas) || !v.ventas.every(validHistoryOrder)
    || !Array.isArray(v.serie) || !Array.isArray(v.productos) || !money(v.resumen.total_vendido)
    || !['bruto_productos', 'descuentos', 'neto_productos', 'envio', 'importe_confirmado'].every(k => money((v.importes as Record<string, unknown>)[k])))
    throw new Error('El historial de ventas recibido no es válido.');
  return { data: v as unknown as SalesHistory, paginacion: result.paginacion };
}
export async function getContacts(params: URLSearchParams, signal?: AbortSignal) {
  const result = await page('contactos/', params, signal);
  if (!Array.isArray(result.data) || !result.data.every(v => record(v) && typeof v.email === 'string' && Number.isSafeInteger(v.cantidad_pedidos)
    && typeof v.ultimo_pedido === 'string' && Number.isFinite(Date.parse(v.ultimo_pedido)) && ['autorizado', 'retirado', 'sin_registro'].includes(String(v.consentimiento))))
    throw new Error('La lista de contactos recibida no es válida.');
  return { data: result.data as Contact[], paginacion: result.paginacion };
}
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export async function downloadCommercial(path: string, params: URLSearchParams, fallbackName: string, format: 'xlsx' | 'csv' = 'xlsx', signal?: AbortSignal) {
  const result = await response(path, params, signal);
  if (!result.headers.get('Content-Type')?.includes(format === 'xlsx' ? XLSX_MIME : 'text/csv')) throw new Error('El archivo recibido no tiene el formato solicitado.');
  const blob = await result.blob();
  if (!blob.size) throw new Error('El archivo recibido está vacío.');
  if (signal?.aborted) return;
  const suggested = result.headers.get('Content-Disposition')?.match(/filename="?([a-zA-Z0-9_-]+\.(?:xlsx|csv))"?/i)?.[1];
  const name = suggested || fallbackName;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
