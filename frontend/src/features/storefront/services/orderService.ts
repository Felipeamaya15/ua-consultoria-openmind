import type { CartItem } from '../context/CartContext';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
export type CreatedOrder = { id_pedido: number; tienda_id: number; estado: string; monto_total: string; descuento: string; costo_envio: string };
export type CheckoutInput = {
  key: string; items: CartItem[]; contact: {name: string; email: string; phone: string};
  paymentMethod: string; shippingMethod: string; promoCode: string;
  address: {street: string; number: string; apt: string; city: string; region: string};
};

export const orderService = {
  async create(input: CheckoutInput): Promise<CreatedOrder> {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/api/checkout/pedidos/`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Token ${token}`} : {})},
      body: JSON.stringify({
        clave_checkout: input.key,
        items: input.items.map(item => ({producto_id: item.productId, sku: item.sku, cantidad: item.quantity})),
        contacto: {nombre: input.contact.name, email: input.contact.email.trim(), telefono: input.contact.phone},
        medio_pago: input.paymentMethod, metodo_entrega: input.shippingMethod,
        direccion: input.address, codigo_promocional: input.promoCode,
      }),
    });
    const body = await response.json();
    if (!response.ok || body.exito !== true) {
      const messages = (value: unknown): string[] => typeof value === 'string' ? [value]
        : value && typeof value === 'object' ? Object.values(value).flatMap(messages) : [];
      const details = body.error?.detalles;
      const message = (details ? messages(details).join(' ') : '') || body.mensaje || body.detail || messages(body).join(' ');
      throw new Error(message || 'No se pudo registrar el pedido.');
    }
    return body.data;
  },
};
