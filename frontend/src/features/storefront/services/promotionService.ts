import { API_BASE_URL } from '../../../api';

export interface ValidatedPromotion {
  code: string;
  type: 'percentage' | 'fixed' | 'free_shipping';
  discount: number;
  shipping: number;
  message: string;
}

export async function validatePromotion(code: string, subtotal: number, shipping: number): Promise<ValidatedPromotion> {
  const response = await fetch(`${API_BASE_URL}/api/promociones/validar/`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Accept: 'application/json'},
    body: JSON.stringify({code: code.trim(), subtotal, shipping}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.exito !== true || !body.data) {
    throw new Error(body.mensaje || 'El codigo promocional no es valido.');
  }
  const result = body.data;
  const discount = Number(result.discount), adjustedShipping = Number(result.shipping);
  if (!result.code || !['percentage', 'fixed', 'free_shipping'].includes(result.type)
      || !Number.isFinite(discount) || discount < 0
      || !Number.isFinite(adjustedShipping) || adjustedShipping < 0) {
    throw new Error('La respuesta de la promocion es invalida.');
  }
  return {...result, discount, shipping: adjustedShipping};
}
