import { API_BASE_URL } from '../../../api';
import { authService } from '../../auth/services/authService';
import { requestJson } from '../../../shared/services/apiRequest';

export type CommerceOptions = {cotizaciones: boolean; factura: boolean; recordatorios: boolean};
export type InvoiceRequest = {rut: string; razon_social: string; giro: string; direccion: string; comuna: string; email: string};

export function invoiceErrors(value: InvoiceRequest): Partial<Record<keyof InvoiceRequest, string>> {
  const labels: Record<keyof InvoiceRequest, string> = {rut: 'el RUT', razon_social: 'la razón social', giro: 'el giro', direccion: 'la dirección tributaria', comuna: 'la comuna', email: 'el correo para la factura'};
  const errors: Partial<Record<keyof InvoiceRequest, string>> = {};
  for (const key of Object.keys(labels) as (keyof InvoiceRequest)[]) if (!value[key].trim()) errors[key] = `Ingresa ${labels[key]}.`;
  if (value.rut.trim()) {
    const normalized = value.rut.replace(/[.\s]/g, '').toUpperCase();
    const parts = /^(\d{1,8})-([0-9K])$/.exec(normalized);
    let valid = false;
    if (parts && Number(parts[1]) > 0) {
      const total = [...parts[1]].reverse().reduce((sum, digit, index) => sum + Number(digit) * (2 + index % 6), 0);
      const check = 11 - total % 11;
      valid = parts[2] === (check === 10 ? 'K' : check === 11 ? '0' : String(check));
    }
    if (!valid) errors.rut = 'Ingresa un RUT válido con dígito verificador.';
  }
  if (value.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())) errors.email = 'Ingresa un correo válido para la factura.';
  return errors;
}

export async function commerceRequest<T>(path: string, method = 'GET', data?: unknown, signal?: AbortSignal): Promise<T> {
  const token = authService.getToken();
  return await requestJson(`${API_BASE_URL}/api/landing/${path}/`, {
    method, signal, credentials: 'include',
    headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Token ${token}`} : {})},
    ...(data === undefined ? {} : {body: JSON.stringify(data)}),
  }) as T;
}
