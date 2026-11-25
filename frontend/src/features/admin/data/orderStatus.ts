
export type OrderBadgeVariant = 'default' | 'info' | 'warning' | 'success' | 'error';


export const CONFIRMED_ORDER_STATES = ['pagado', 'en_camino', 'entregado', 'preparando', 'en_origen', 'enviado', 'en_reparto'] as const;
export const DISPATCH_ORDER_STATES = ['pendiente', 'pagado', 'preparando', 'en_origen'] as const;

export interface OrderStatusBadge {
  label: string;
  variant: OrderBadgeVariant;
}

export const ORDER_STATUS_BADGE: Record<string, OrderStatusBadge> = {
  pendiente: { label: 'Pendiente', variant: 'warning' },
  pagado: { label: 'Pagado/En preparación', variant: 'info' },
  en_camino: { label: 'En camino', variant: 'info' },
  entregado: { label: 'Entregado', variant: 'success' },
  cancelado: { label: 'Cancelado', variant: 'error' },

  preparando: { label: 'Pagado/En preparación', variant: 'info' },
  en_origen: { label: 'En camino', variant: 'info' },
  enviado: { label: 'En camino', variant: 'info' },
  en_reparto: { label: 'En camino', variant: 'info' },
};


export function orderStatusBadge(estado: string, etiqueta = ''): OrderStatusBadge {
  if (Object.prototype.hasOwnProperty.call(ORDER_STATUS_BADGE, estado)) return ORDER_STATUS_BADGE[estado];
  return { label: etiqueta.trim() || 'Estado desconocido', variant: 'default' };
}
