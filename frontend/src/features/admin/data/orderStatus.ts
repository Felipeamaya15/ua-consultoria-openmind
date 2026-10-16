/** Cómo se muestra cada estado de un pedido en el panel del emprendedor. */
export type OrderBadgeVariant = 'default' | 'info' | 'warning' | 'success' | 'error';

/** Equivalentes a Pedido.ESTADOS_PAGADOS y al conteo por_despachar del dashboard. */
export const CONFIRMED_ORDER_STATES = ['pagado', 'preparando', 'en_origen', 'enviado', 'en_reparto', 'entregado'] as const;
export const DISPATCH_ORDER_STATES = ['pendiente', 'pagado', 'preparando', 'en_origen'] as const;

export interface OrderStatusBadge {
  label: string;
  variant: OrderBadgeVariant;
}

export const ORDER_STATUS_BADGE: Record<string, OrderStatusBadge> = {
  pendiente: { label: 'Pendiente', variant: 'warning' },
  pagado: { label: 'Pagado', variant: 'info' },
  preparando: { label: 'En preparación', variant: 'info' },
  en_origen: { label: 'En origen', variant: 'info' },
  enviado: { label: 'En tránsito', variant: 'info' },
  en_reparto: { label: 'En reparto', variant: 'info' },
  entregado: { label: 'Entregado', variant: 'success' },
  cancelado: { label: 'Cancelado', variant: 'error' },
};

/** Etiqueta y color de un estado; uno desconocido usa la etiqueta del servidor y nunca rompe la pantalla. */
export function orderStatusBadge(estado: string, etiqueta = ''): OrderStatusBadge {
  if (Object.prototype.hasOwnProperty.call(ORDER_STATUS_BADGE, estado)) return ORDER_STATUS_BADGE[estado];
  return { label: etiqueta.trim() || 'Estado desconocido', variant: 'default' };
}
