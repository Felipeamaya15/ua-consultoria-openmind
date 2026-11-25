import { authService } from '../../auth/services/authService';
import { transbankPaymentService } from './transbankPaymentService';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

export type DestinoPago = {
  metodo: string;
  accion: 'formulario' | 'redirigir';
  url: string;
  token?: string;
};

export const pagarPedidoService = {
  async iniciar(params: { orderNumber: string; email?: string; returnUrl: string; conSesion?: boolean }): Promise<DestinoPago> {
    const token = params.conSesion ? authService.getToken() : null;
    const res = await fetch(`${API_BASE}/api/pagos/pedido/pagar/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Token ${token}` } : {}) },
      body: JSON.stringify({
        order_number: params.orderNumber,
        ...(params.email ? { email: params.email } : {}),
        return_url: params.returnUrl,
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.exito || !body.data?.url) {
      throw new Error(body?.mensaje || body?.detail || 'No pudimos iniciar el pago. Intenta nuevamente.');
    }
    return body.data as DestinoPago;
  },

  ir(destino: DestinoPago) {
    if (destino.accion === 'formulario' && destino.token) {
      transbankPaymentService.redirigirAWebpay(destino.url, destino.token);
    } else {
      window.location.href = destino.url;
    }
  },
};
