const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const post = async (path: string, body: Record<string, unknown>) => {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json();
};

export const paypalPaymentService = {
  // El monto lo toma el servidor del pedido; el cliente solo informa el pedido y las URLs de retorno.
  iniciarPago: (
    tienda_id: number | string,
    order_number: string,
    _amount: number,
    return_url: string,
    cancel_url: string,
  ) => post('/api/pagos/paypal/iniciar/', { tienda_id, order_number, return_url, cancel_url }),

  capturarPago: (tienda_id: number | string, order_number: string, order_id: string) =>
    post('/api/pagos/paypal/capturar/', { tienda_id, order_number, order_id }),
};
