import { API_BASE_URL } from '../../../api';
import { fetchInitialLoad } from '../../../core/http/initialLoad';
import { authService } from '../../auth/services/authService';
import type { AdminConfig } from '../../admin/types';
import { nombreOficialRegion } from '../data/comunasChile';

const API_BASE = (API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

export type ShippingErrorKind = 'sin_tarifa' | 'no_disponible' | 'destino' | 'vencida' | 'temporal';

/**
 * Error de cotización con una categoría, para decidir qué mostrarle al comprador:
 * 'sin_tarifa' | 'no_disponible' | 'destino' -> cambiar de alternativa o de comuna (reintentar no sirve);
 * 'vencida' | 'temporal' -> volver a cotizar.
 */
export class ShippingError extends Error {
  kind: ShippingErrorKind;
  code?: string;

  constructor(message: string, kind: ShippingErrorKind, code?: string) {
    super(message);
    this.name = 'ShippingError';
    this.kind = kind;
    this.code = code;
  }
}

const KIND_BY_CODE: Record<string, ShippingErrorKind> = {
  TARIFA_NO_DISPONIBLE: 'sin_tarifa',
  TRANSPORTISTA_NO_HABILITADO: 'no_disponible',
  OPERADOR_INVALIDO: 'no_disponible',
  DESTINO_INVALIDO: 'destino',
  COTIZACION_VENCIDA: 'vencida',
  COTIZACION_INVALIDA: 'vencida',
  COTIZACION_CAMBIO: 'vencida',
};

const isAbort = (error: unknown) => (error as {name?: string} | null)?.name === 'AbortError';

/** Lee la respuesta como JSON sin dejar escapar errores técnicos (por ejemplo, una página HTML de error). */
async function readJson(response: Response): Promise<any> {
  try {
    const body = await response.json();
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

const messagesOf = (value: unknown): string[] => typeof value === 'string' ? [value]
  : value && typeof value === 'object' ? Object.values(value).flatMap(messagesOf) : [];

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

function isTrackingDetail(value: unknown, expectedTracking: string): value is DetalleSeguimiento {
  if (!value || typeof value !== 'object') return false;
  const detail = value as Record<string, unknown>;
  const events = detail.historial;
  return typeof detail.numero_seguimiento === 'string'
    && detail.numero_seguimiento.trim().toUpperCase() === expectedTracking.toUpperCase()
    && ['CHILEXPRESS', 'STARKEN', 'LOGISTICA_CENTRAL'].includes(String(detail.proveedor))
    && typeof detail.estado_actual === 'string'
    && typeof detail.descripcion_estado === 'string'
    && typeof detail.fecha_estimada_entrega === 'string'
    && Array.isArray(events)
    && events.every(event => event && typeof event === 'object'
      && ['fecha_hora', 'estado', 'descripcion', 'ubicacion'].every(
        field => typeof (event as Record<string, unknown>)[field] === 'string',
      ));
}

async function requestTracking(
  path: string,
  tracking: string,
  signal?: AbortSignal,
  expectedProvider?: DetalleSeguimiento['proveedor'],
): Promise<DetalleSeguimiento> {
  const response = await fetch(`${API_BASE}${path}`, { signal });
  const data = await response.json();
  if (!response.ok || !data.exito) {
    throw new Error(data.mensaje || 'No se encontró información de seguimiento para este código.');
  }
  if (!isTrackingDetail(data.data, tracking)
    || (expectedProvider && data.data.proveedor !== expectedProvider)) {
    throw new Error('La información de seguimiento recibida es inválida.');
  }
  return data.data;
}

export const shippingService = {
  async getTracking(numeroSeguimiento: string, signal?: AbortSignal): Promise<DetalleSeguimiento> {
    const cleanTracking = numeroSeguimiento.trim();
    if (!cleanTracking) throw new Error('Ingresa un número de seguimiento.');
    const isChilexpress = /^CHILEX/i.test(cleanTracking);
    const isStarken = /^(STK-|STARKEN-)/i.test(cleanTracking);
    const providerPath = isChilexpress ? '/chilexpress' : isStarken ? '/starken' : '';
    const expectedProvider = isChilexpress ? 'CHILEXPRESS' : isStarken ? 'STARKEN' : undefined;
    return requestTracking(
      `/api/logistica/seguimiento${providerPath}/${encodeURIComponent(cleanTracking)}/`,
      cleanTracking,
      signal,
      expectedProvider,
    );
  },

  async getChilexpressTracking(numeroSeguimiento: string, signal?: AbortSignal): Promise<DetalleSeguimiento> {
    const cleanTracking = numeroSeguimiento.trim();
    if (!cleanTracking) throw new Error('Ingresa una orden de transporte de Chilexpress.');
    return requestTracking(
      `/api/logistica/seguimiento/chilexpress/${encodeURIComponent(cleanTracking)}/`,
      cleanTracking,
      signal,
      'CHILEXPRESS',
    );
  },

  async getStarkenTracking(numeroSeguimiento: string, signal?: AbortSignal): Promise<DetalleSeguimiento> {
    const cleanTracking = numeroSeguimiento.trim();
    if (!cleanTracking) throw new Error('Ingresa una orden de flete de Starken.');
    return requestTracking(
      `/api/logistica/seguimiento/starken/${encodeURIComponent(cleanTracking)}/`,
      cleanTracking,
      signal,
      'STARKEN',
    );
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
export class ShippingConfigurationError extends Error {
  constructor(message: string, public fields: Record<string, string>) { super(message); }
}

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
  const body = await readJson(response);
  if (!body) throw new Error('No pudimos cargar la configuración de entregas en este momento. Intenta nuevamente.');
  if (!response.ok || body.exito !== true) {
    const details = body.error?.detalles;
    if (details && typeof details === 'object' && 'pickup' in details) {
      const fields: Record<string, string> = {};
      const flatten = (value: unknown, prefix = '') => {
        if (Array.isArray(value)) fields[prefix] = value.join(' ');
        else if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
        else if (typeof value === 'string') fields[prefix] = value;
      };
      flatten(details.pickup);
      throw new ShippingConfigurationError('Revisa los campos de retiro indicados.', fields);
    }
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
  let response: Response;
  try {
    response = await fetchInitialLoad(`${API_BASE_URL}/api/entregas/alternativas/`, { signal });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new Error('No pudimos conectar con el servidor para cargar las alternativas de entrega. Intenta nuevamente.');
  }
  return readConfiguration(response);
}

export async function getPickupAddressStatus(signal?: AbortSignal): Promise<{ configured: boolean }> {
  const response = await fetch(`${API_BASE_URL}/api/entregas/retiro/direcciones/`, { headers: adminHeaders(), signal });
  const body = await readJson(response);
  if (!response.ok || body?.exito !== true) throw new Error('No se pudo consultar el servicio de direcciones.');
  return { configured: body.data?.configured === true };
}

export async function searchPickupAddresses(region: string, comuna: string, query: string, signal?: AbortSignal): Promise<import('../../admin/services/pickupConfiguration').PickupLocation[]> {
  const response = await fetch(`${API_BASE_URL}/api/entregas/retiro/direcciones/`, {
    method: 'POST', headers: adminHeaders(), body: JSON.stringify({ region, comuna, query }), signal,
  });
  const body = await readJson(response);
  if (!response.ok || body?.exito !== true) throw new Error(body?.mensaje || 'No se pudieron buscar direcciones.');
  if (!Array.isArray(body.data) || !body.data.every((row: unknown) => row && typeof row === 'object' &&
    ['region', 'comuna', 'street', 'number', 'reference', 'verification'].every(key => typeof (row as Record<string, unknown>)[key] === 'string'))) {
    throw new Error('El proveedor devolvió direcciones inválidas.');
  }
  return body.data;
}

export type ShippingQuote = {
  operador: string; monto: number; plazo_dias: number | null; moneda: 'CLP';
  region: string; comuna: string; origen: 'configuracion_tienda'; cotizacion: string; vence_en: number;
};

export async function getShippingQuotes(operador: string, region: string, comuna: string, signal?: AbortSignal): Promise<ShippingQuote[]> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/entregas/cotizacion/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operador, region, comuna }),
      signal,
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new ShippingError('No pudimos conectar con el servidor para cotizar el envío. Revisa tu conexión e intenta nuevamente.', 'temporal');
  }
  const body = await readJson(response);
  if (!body) {
    throw new ShippingError('No pudimos obtener la tarifa de envío en este momento. Intenta nuevamente.', 'temporal');
  }
  if (!response.ok || body.exito !== true) {
    const details = body.error?.detalles;
    const code = typeof body.error?.codigo === 'string' ? body.error.codigo : undefined;
    const message = (details ? messagesOf(details).join(' ') : '') || body.mensaje || 'No se pudo cotizar el envío.';
    throw new ShippingError(message, (code && KIND_BY_CODE[code]) || 'temporal', code);
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
    throw new ShippingError('La cotización recibida es inválida. Vuelve a cotizar el envío.', 'temporal');
  }
  return tarifas.map(tarifa => ({ ...tarifa, monto: Number(tarifa.monto) }));
}
