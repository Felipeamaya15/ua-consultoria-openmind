import { API_BASE_URL } from '../../../api';
import type { AdminConfig } from '../types';

const endpoint = `${API_BASE_URL}/api/auth/configuracion-pagos/`;
const DEFAULT_TIENDA_ID = 1;

type PaymentConfiguration = AdminConfig['paymentConfiguration'];

async function readResponse(
  response: Response,
): Promise<PaymentConfiguration> {
  const body = await response.json();

  if (!response.ok || body.exito !== true) {
    const details = body.error?.detalles;
    throw new Error(
      `${body.mensaje || 'No se pudo guardar la configuracion de pagos.'}${
        details ? `: ${JSON.stringify(details)}` : ''
      }`,
    );
  }

  return body.data.metodos;
}

export async function savePaymentConfiguration(
  paymentConfiguration: PaymentConfiguration,
): Promise<PaymentConfiguration> {
  const token = localStorage.getItem('token');

  if (!token) {
    throw new Error(
      'Inicia sesion como propietario para guardar metodos de pago.',
    );
  }

  return readResponse(
    await fetch(endpoint, {
      method: 'PUT',
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tienda_id: DEFAULT_TIENDA_ID,
        metodos: paymentConfiguration,
      }),
    }),
  );
}
