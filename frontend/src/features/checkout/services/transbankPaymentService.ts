const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

export const transbankPaymentService = {
  async iniciarPago(idTienda: number, ordenCompra: string, monto: number, returnUrl: string) {
    const res = await fetch(`${API_BASE}/api/catalog/pagos/transbank/iniciar/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_tienda: idTienda,
        orden_compra: ordenCompra,
        monto: Math.round(monto),
        session_id: `SES-${Date.now()}`,
        return_url: returnUrl,
      }),
    });
    return res.json();
  },

  async confirmarPago(idTienda: number, tokenWs: string) {
    const res = await fetch(`${API_BASE}/api/catalog/pagos/transbank/confirmar/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_tienda: idTienda,
        token_ws: tokenWs,
      }),
    });
    return res.json();
  },

  // Redirige al cliente a la pantalla oficial de Webpay Plus
  redirigirAWebpay(url: string, token: string) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;

    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'token_ws';
    input.value = token;

    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
  },
};