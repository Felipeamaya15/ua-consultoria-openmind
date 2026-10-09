import { API_BASE_URL } from '../../../api';
import { fetchInitialLoad } from '../../../core/http/initialLoad';
import { authService } from '../../auth/services/authService';
import type { AdminConfig } from '../../admin/types';
import { nombreOficialRegion } from '../data/comunasChile';

const API_BASE = (API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

export interface EventoSeguimiento {
  fecha_hora: string;
  estado: string;
  descripcion: string;
  ubicacion: string;
}

export interface DetalleSeguimiento {
  numero_seguimiento: string;
  proveedor: string;
  estado_actual: string;
  descripcion_estado: string;
  fecha_estimada_entrega: string;
  historial: EventoSeguimiento[];
}

export interface OpcionCotizacion {
  proveedor: string;
  servicio: string;
  costo: number;
  dias_habiles_entrega: number;
  es_cobertura_valida: boolean;
  es_gratis: boolean;
}

export interface ResultadoCotizacion {
  destino: {
    comuna: string;
    region: string;
  };
  total_items: number;
  total_carrito: number;
  opcion_recomendada: OpcionCotizacion | null;
  opciones: OpcionCotizacion[];
}

export interface CotizacionParams {
  region: string;
  comuna: string;
  total_carrito: number;
  total_items: number;
  peso_kg?: number;
  calle?: string;
  numero?: string;
  proveedor?: string;
}

export const shippingService = {
  async getTracking(numeroSeguimiento: string): Promise<DetalleSeguimiento> {
    const cleanTracking = numeroSeguimiento.trim();
    const response = await fetch(`${API_BASE}/api/logistica/seguimiento/${encodeURIComponent(cleanTracking)}/`);
    const data = await response.json();
    if (!response.ok || !data.exito) {
      throw new Error(data.mensaje || 'No se encontró información de seguimiento para este código.');
    }
    return data.data;
  },

  async quote(params: CotizacionParams): Promise<ResultadoCotizacion> {
    const response = await fetch(`${API_BASE}/api/logistica/cotizar/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...params,
        total_carrito: Number(params.total_carrito || 0).toFixed(2),
        proveedor: params.proveedor || 'todos',
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.exito) {
      throw new Error(data.mensaje || 'Error al cotizar envío.');
    }
    return data.data;
  },

  /**
   * Implementa la solicitud de cotización a Chilexpress
   */
  async quoteChilexpress(params: Omit<CotizacionParams, 'proveedor'>): Promise<ResultadoCotizacion> {
    const response = await fetch(`${API_BASE}/api/logistica/cotizar/chilexpress/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...params,
        total_carrito: Number(params.total_carrito || 0).toFixed(2),
        proveedor: 'chilexpress',
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.exito) {
      throw new Error(data.mensaje || 'Error al cotizar con Chilexpress.');
    }
    return data.data;
  },

  /**
   * Implementa la solicitud de cotización a Starken
   */
  async quoteStarken(params: Omit<CotizacionParams, 'proveedor'>): Promise<ResultadoCotizacion> {
    const response = await fetch(`${API_BASE}/api/logistica/cotizar/starken/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...params,
        total_carrito: Number(params.total_carrito || 0).toFixed(2),
        proveedor: 'starken',
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.exito) {
      throw new Error(data.mensaje || 'Error al cotizar con Starken.');
    }
    return data.data;
  },
};

// ── Métodos de develop para configuración y cotizaciones en tienda ─────────

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

export type ShippingQuote = {
  operador: string; monto: number; plazo_dias: number | null; moneda: 'CLP';
  region: string; comuna: string; origen: 'configuracion_tienda'; cotizacion: string; vence_en: number;
};

export async function getShippingQuotes(operador: string, region: string, comuna: string, signal?: AbortSignal): Promise<ShippingQuote[]> {
  const response = await fetch(`${API_BASE_URL}/api/entregas/cotizacion/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operador, region, comuna }),
    signal,
  });
  const body = await response.json();
  if (!response.ok || body.exito !== true) {
    const details = body.error?.detalles;
    const messages = (value: unknown): string[] => typeof value === 'string' ? [value]
      : value && typeof value === 'object' ? Object.values(value).flatMap(messages) : [];
    throw new Error((details ? messages(details).join(' ') : '') || body.mensaje || 'No se pudo cotizar el envío.');
  }
  const tarifas: unknown = body.data?.tarifas;
  if (!Array.isArray(tarifas) || tarifas.length !== 1 || !tarifas.every(tarifa => tarifa
    && tarifa.operador === operador && tarifa.comuna === comuna && typeof tarifa.region === 'string'
    && tarifa.region === nombreOficialRegion(region)
    && tarifa.moneda === 'CLP' && tarifa.origen === 'configuracion_tienda'
    && typeof tarifa.monto === 'string' && /^\d+$/.test(tarifa.monto)
    && Number.isSafeInteger(Number(tarifa.monto)) && Number(tarifa.monto) <= 9999999999
    && (tarifa.plazo_dias === null || (Number.isInteger(tarifa.plazo_dias) && tarifa.plazo_dias > 0))
    && typeof tarifa.cotizacion === 'string' && tarifa.cotizacion.length > 0
    && Number.isSafeInteger(tarifa.vence_en) && tarifa.vence_en > Date.now() / 1000)) {
    throw new Error('La cotización recibida es inválida. Vuelve a cotizar el envío.');
  }
  return tarifas.map(tarifa => ({ ...tarifa, monto: Number(tarifa.monto) }));
}
