import type { CartItem } from '../context/CartContext';
import { authService, type CustomerOrder, type CustomerOrderItem } from '../../auth/services/authService';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
export type CreatedOrder = {
  id_pedido: number;
  identificador?: string | null;
  tienda_id: number;
  estado: string;
  monto_total: string;
  descuento: string;
  costo_envio: string;
  url_pago?: string;
};
export type CheckoutInput = {
  key: string; items: CartItem[]; contact: {name: string; email: string; phone: string};
  paymentMethod: string; shippingMethod: string; promoCode: string;
  address: {street: string; number: string; apt: string; city: string; region: string};
  shippingQuote?: string;
};


export interface LineaTiempoPaso {
  estado: string;
  etiqueta: string;
  completado: boolean;
  actual: boolean;
}

// Se mantienen estado_label y linea_tiempo para OrderTracking.tsx
export type TrackedOrder = Omit<CustomerOrder, 'items'>
  & Pick<CreatedOrder, 'identificador' | 'costo_envio' | 'descuento'> & {
    nombre_contacto: string;
    medio_pago: string;
    entrega: {metodo?: string};
    items: CustomerOrderItem[];
    estado_label: string;
    linea_tiempo: LineaTiempoPaso[];
  };

export const ORDER_NUMBER_FORMAT_MESSAGE = 'El número de orden debe tener el formato ORD-AAAAMMDD-XXXX.';

export function normalizeOrderNumber(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidOrderNumber(value: string): boolean {
  const normalized = normalizeOrderNumber(value);
  const match = /^ORD-(\d{4})(\d{2})(\d{2})-[A-Z0-9]{4}$/.exec(normalized);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() === Number(month) - 1
    && date.getUTCDate() === Number(day);
}

export const TRACKING_EMAIL_FORMAT_MESSAGE = 'Ingresa un correo electrónico válido.';

export function normalizeTrackingEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidTrackingEmail(value: string): boolean {
  const email = normalizeTrackingEmail(value);
  if (!email || email.length > 320 || /\s/.test(email)) return false;
  const separator = email.lastIndexOf('@');
  if (separator <= 0 || separator !== email.indexOf('@')) return false;
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) || domain.length > 255) return false;
  const labels = domain.split('.');
  return labels.length >= 2
    && labels[labels.length - 1].length >= 2
    && labels.every(label => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label));
}

export class OrderError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'OrderError';
    this.code = code;
  }
}

export const orderService = {
  async track(identificador: string, email: string, signal?: AbortSignal): Promise<TrackedOrder> {
    const orderNumber = normalizeOrderNumber(identificador);
    if (!isValidOrderNumber(orderNumber)) throw new Error(ORDER_NUMBER_FORMAT_MESSAGE);
    const normalizedEmail = normalizeTrackingEmail(email);
    if (!isValidTrackingEmail(normalizedEmail)) throw new Error(TRACKING_EMAIL_FORMAT_MESSAGE);

    const response = await fetch(`${API_BASE}/api/pedidos/seguimiento/`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({identificador: orderNumber, email: normalizedEmail}),
      signal,
    });

    const body = await response.json();
    if (!response.ok || body.exito !== true) {
      throw new Error(body.detail || body.mensaje || 'No se pudo consultar el pedido. Verifica el número y correo.');
    }

    const order: unknown = body.data;
    if (!order || typeof order !== 'object') throw new Error('La respuesta del pedido es inválida.');
    const data = order as Record<string, unknown>;

    const hasValidLabel = typeof data.estado_label === 'string' || typeof data.estado_etiqueta === 'string';
    const hasValidTimeline = data.linea_tiempo === undefined || Array.isArray(data.linea_tiempo);

    if (!Number.isSafeInteger(data.id_pedido)
      || typeof data.identificador !== 'string'
      || normalizeOrderNumber(data.identificador) !== orderNumber
      || !['pendiente', 'pagado', 'preparando', 'en_origen', 'enviado', 'en_reparto', 'entregado', 'cancelado'].includes(String(data.estado))
      || !['nombre_contacto', 'medio_pago', 'fecha_creacion'].every(key => typeof data[key] === 'string')
      || !hasValidLabel
      || !hasValidTimeline
      || !['monto_total', 'descuento', 'costo_envio'].every(key => typeof data[key] === 'string'
        && String(data[key]).trim() !== '' && Number.isFinite(Number(data[key])) && Number(data[key]) >= 0)
      || !data.entrega || typeof data.entrega !== 'object'
      || ('metodo' in data.entrega && typeof data.entrega.metodo !== 'string')
      || !Array.isArray(data.items) || !data.items.every(item => item && typeof item === 'object'
        && typeof item.nombre === 'string' && Number.isInteger(item.cantidad) && item.cantidad > 0
        && typeof item.precio_unitario === 'string' && item.precio_unitario.trim() !== ''
        && Number.isFinite(Number(item.precio_unitario)) && Number(item.precio_unitario) >= 0
        && (item.atributos_variante === undefined || (Array.isArray(item.atributos_variante)
          && item.atributos_variante.every((attribute: unknown) => attribute && typeof attribute === 'object'
            && 'valor' in attribute && typeof attribute.valor === 'string'))))) {
      throw new Error('La respuesta del pedido es inválida.');
    }
    return order as TrackedOrder;
  },

  async create(input: CheckoutInput): Promise<CreatedOrder> {
    const token = authService.getToken();
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/api/checkout/pedidos/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Token ${token}`} : {})},
        body: JSON.stringify({
          clave_checkout: input.key,
          items: input.items.map(item => ({producto_id: item.productId, sku: item.sku, cantidad: item.quantity})),
          contacto: {nombre: input.contact.name, email: input.contact.email.trim(), telefono: input.contact.phone},
          medio_pago: input.paymentMethod, metodo_entrega: input.shippingMethod,
          direccion: input.address, codigo_promocional: input.promoCode,
          ...(input.shippingMethod !== 'Retiro' && input.shippingQuote ? {cotizacion: input.shippingQuote} : {}),
        }),
      });
    } catch {
      throw new OrderError('No pudimos conectar con el servidor. Revisa tu conexión e intenta nuevamente.');
    }

    let body: any = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!body || typeof body !== 'object') {
      throw new OrderError('No pudimos registrar tu pedido en este momento. Intenta nuevamente.');
    }
    if (!response.ok || body.exito !== true) {
      const messages = (value: unknown): string[] => typeof value === 'string' ? [value]
        : value && typeof value === 'object' ? Object.values(value).flatMap(messages) : [];
      const details = body.error?.detalles;
      const message = (details ? messages(details).join(' ') : '') || body.mensaje || body.detail || messages(body).join(' ');
      throw new OrderError(message || 'No se pudo registrar el pedido.',
        typeof body.error?.codigo === 'string' ? body.error.codigo : undefined);
    }

    const order: unknown = body.data;
    if (!order || typeof order !== 'object') throw new Error('La respuesta del pedido es inválida.');
    const data = order as Record<string, unknown>;
    if (!Number.isSafeInteger(data.id_pedido) || !Number.isSafeInteger(data.tienda_id)
      || !['pendiente', 'pagado', 'preparando', 'en_origen', 'enviado', 'en_reparto', 'entregado', 'cancelado'].includes(String(data.estado))
      || !(data.identificador === undefined || data.identificador === null || typeof data.identificador === 'string')
      || !(data.url_pago === undefined || typeof data.url_pago === 'string')
      || !['monto_total', 'descuento', 'costo_envio'].every(key => typeof data[key] === 'string'
        && String(data[key]).trim() !== '' && Number.isFinite(Number(data[key])) && Number(data[key]) >= 0)
      || (input.shippingMethod === 'Retiro' && Number(data.costo_envio) !== 0)) {
      throw new Error('La respuesta del pedido es inválida.');
    }
    return order as CreatedOrder;
  },
};