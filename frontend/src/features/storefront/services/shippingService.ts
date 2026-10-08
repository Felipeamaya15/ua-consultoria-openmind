import { API_BASE_URL } from '../../../api';
import { fetchInitialLoad } from '../../../core/http/initialLoad';
import { authService } from '../../auth/services/authService';
import type { AdminConfig } from '../../admin/types';

export type ShippingConfiguration = AdminConfig['shippingConfiguration'];

function isConfiguration(value: unknown): value is ShippingConfiguration {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  return ['chilexpress', 'starken', 'pickup'].every(key => {
    const section = data[key];
    if (!section || typeof section !== 'object') return false;
    const fields = section as Record<string, unknown>;
    return typeof fields.enabled === 'boolean' && (key === 'pickup'
      ? typeof fields.address === 'string' && typeof fields.schedule === 'string'
      : typeof fields.accountId === 'string' && typeof fields.apiKey === 'string'
        && fields.status === 'not_configured');
  });
}

async function readConfiguration(response: Response): Promise<ShippingConfiguration> {
  const body = await response.json();
  if (!response.ok || body.exito !== true) {
    const details = body.error?.detalles;
    throw new Error((body.mensaje || body.detail || 'No se pudo consultar la configuración de entregas.')
      + (details ? ` ${JSON.stringify(details)}` : ''));
  }
  if (!isConfiguration(body.data)) throw new Error('La configuración de entregas recibida es inválida.');
  return body.data;
}

function adminHeaders(): Record<string, string> {
  const token = authService.getToken();
  if (!token) throw new Error('Inicia sesión como propietario para configurar las entregas.');
  return { Authorization: `Token ${token}`, 'Content-Type': 'application/json' };
}

export async function getShippingConfiguration(signal?: AbortSignal): Promise<ShippingConfiguration> {
  return readConfiguration(await fetch(`${API_BASE_URL}/api/entregas/configuracion/`, {
    headers: adminHeaders(), signal,
  }));
}

export async function saveShippingConfiguration(configuration: ShippingConfiguration): Promise<ShippingConfiguration> {
  return readConfiguration(await fetch(`${API_BASE_URL}/api/entregas/configuracion/`, {
    method: 'PUT', headers: adminHeaders(), body: JSON.stringify(configuration),
  }));
}

export async function getDeliveryAlternatives(signal?: AbortSignal): Promise<ShippingConfiguration> {
  return readConfiguration(await fetchInitialLoad(`${API_BASE_URL}/api/entregas/alternativas/`, { signal }));
}

export type ShippingQuote = { operador: string; monto: number; plazo_dias: number | null };

export async function getShippingQuotes(comuna: string, signal?: AbortSignal): Promise<ShippingQuote[]> {
  const response = await fetch(`${API_BASE_URL}/api/entregas/cotizacion/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comuna }),
    signal,
  });
  const body = await response.json();
  if (!response.ok || body.exito !== true) throw new Error(body.mensaje || 'No se pudo cotizar el envío.');
  return body.data.tarifas.map((tarifa: { operador: string; monto: string; plazo_dias: number | null }) => ({
    operador: tarifa.operador,
    monto: Number(tarifa.monto),
    plazo_dias: tarifa.plazo_dias,
  }));
}
