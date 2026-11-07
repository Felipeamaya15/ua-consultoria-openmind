/** Cómo se muestra cada estado de un pedido en el panel del emprendedor. */
export type OrderBadgeVariant = 'default' | 'info' | 'warning' | 'success' | 'error';

/** Equivalentes a Pedido.ESTADOS_PAGADOS y al conteo por_despachar del dashboard. */
export const CONFIRMED_ORDER_STATES = ['pagado', 'en_camino', 'entregado'] as const;
export const DISPATCH_ORDER_STATES = ['pendiente', 'pagado'] as const;

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
  // Aliases para retrocompatibilidad
  preparando: { label: 'Pagado/En preparación', variant: 'info' },
  en_origen: { label: 'En camino', variant: 'info' },
  enviado: { label: 'En camino', variant: 'info' },
  en_reparto: { label: 'En camino', variant: 'info' },
};

/** Etiqueta y color de un estado; uno desconocido usa la etiqueta del servidor y nunca rompe la pantalla. */
export function orderStatusBadge(estado: string, etiqueta = ''): OrderStatusBadge {
  if (Object.prototype.hasOwnProperty.call(ORDER_STATUS_BADGE, estado)) return ORDER_STATUS_BADGE[estado];
  return { label: etiqueta.trim() || 'Estado desconocido', variant: 'default' };
}
