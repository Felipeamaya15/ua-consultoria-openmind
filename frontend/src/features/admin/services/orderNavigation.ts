import { CONFIRMED_ORDER_STATES, DISPATCH_ORDER_STATES, ORDER_STATUS_BADGE } from '../data/orderStatus';

export type OrderFilter = string;
export interface OrderFilters { status: OrderFilter; from: string; to: string; selectedId: number | null; error: string }

export function ordersDestination(from: string, to: string, status = 'all', period?: string): string {
  const params = new URLSearchParams({ fecha_desde: from, fecha_hasta: to });
  if (status !== 'all') params.set('estado', status);
  if (period) params.set('periodo', period);
  return `/emprendedor/pedidos?${params}`;
}

export function orderDetailDestination(id: number): string {
  return `/emprendedor/pedidos?pedido=${id}`;
}

export function validOrderDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith('0000-') && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
}

export function readOrderFilters(params: URLSearchParams): OrderFilters {
  const status = params.get('estado') || 'all';
  const from = params.get('fecha_desde') || '', to = params.get('fecha_hasta') || '';
  const rawId = params.get('pedido');
  const selectedId = rawId && /^[1-9]\d*$/.test(rawId) && Number.isSafeInteger(Number(rawId)) ? Number(rawId) : null;
  let error = '';
  if (!['all', 'confirmed', 'dispatch'].includes(status) && !Object.prototype.hasOwnProperty.call(ORDER_STATUS_BADGE, status)) error = 'El filtro de estado no es válido.';
  if ((from && !validOrderDate(from)) || (to && !validOrderDate(to))) error = 'Indica fechas válidas con formato AAAA-MM-DD.';
  else if (from && to && from > to) error = 'La fecha inicial debe ser anterior o igual a la final.';
  if (rawId !== null && selectedId === null) error = 'El identificador del pedido no es válido.';
  if (['estado', 'fecha_desde', 'fecha_hasta', 'pedido'].some(key => params.getAll(key).length > 1)) error = 'Los filtros no pueden tener parámetros repetidos.';
  return { status, from, to, selectedId, error };
}

const chileDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' });
export function orderDateInChile(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = chileDate.formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Filtra el listado autorizado que ya entrega la API; no utiliza pedidos simulados. */
export function filterStoreOrders<T extends { estado: string; fecha_creacion: string }>(orders: T[], filters: OrderFilters): T[] {
  if (filters.error) return [];
  return orders.filter(order => {
    const status = order.estado.toLowerCase();
    const statusMatches = filters.status === 'all'
      || (filters.status === 'confirmed' ? CONFIRMED_ORDER_STATES.some(s => s === status)
        : filters.status === 'dispatch' ? DISPATCH_ORDER_STATES.some(s => s === status) : status === filters.status);
    const date = orderDateInChile(order.fecha_creacion);
    return statusMatches && !!date && (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to);
  });
}
