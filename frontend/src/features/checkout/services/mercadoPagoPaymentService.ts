const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const post = async (path: string, body: Record<string, unknown>) => {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json();
};

export const mercadoPagoPaymentService = {
  iniciarPago: (tienda_id: number | string, order_number: string, return_url: string) =>
    post('/api/pagos/mercadopago/iniciar/', { tienda_id, order_number, return_url }),

  confirmarPago: (tienda_id: number | string, order_number: string, payment_id: string) =>
    post('/api/pagos/mercadopago/confirmar/', { tienda_id, order_number, payment_id }),
};
