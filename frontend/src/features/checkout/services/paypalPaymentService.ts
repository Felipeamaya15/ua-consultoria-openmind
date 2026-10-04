const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const paypalPaymentService = {
  iniciarPago: async (
    tienda_id: number | string,
    order_number: string,
    amount: number,
    return_url: string,
    cancel_url: string
  ) => {
    const response = await fetch(`${API_URL}/api/pagos/paypal/iniciar/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tienda_id,
        order_number,
        amount,
        return_url,
        cancel_url
      }),
    });

    return response.json();
  }
};