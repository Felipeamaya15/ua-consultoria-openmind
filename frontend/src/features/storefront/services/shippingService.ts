import { API_BASE_URL } from '../../../api';
import { fetchInitialLoad } from '../../../core/http/initialLoad';
import { authService } from '../../auth/services/authService';
import type { AdminConfig } from '../../admin/types';
import { comunasDeRegion, nombreOficialRegion } from '../data/comunasChile';

const API_BASE = (API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

export type ShippingErrorKind = 'sin_tarifa' | 'no_disponible' | 'destino' | 'vencida' | 'temporal';


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
  SECTOR_INVALIDO: 'destino',
  SECTOR_SIN_REPARTO: 'destino',
  COTIZACION_VENCIDA: 'vencida',
  COTIZACION_INVALIDA: 'vencida',
  COTIZACION_CAMBIO: 'vencida',
  ENVIO_A_COORDINAR: 'no_disponible',
  CARRITO_REQUERIDO: 'temporal',
  CARRITO_INVALIDO: 'temporal',
};

const isAbort = (error: unknown) => (error as {name?: string} | null)?.name === 'AbortError';


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

function isOpcionCotizacion(value: unknown): value is OpcionCotizacion {
  if (!value || typeof value !== 'object') return false;
  const option = value as Record<string, unknown>;
  return typeof option.proveedor === 'string' && option.proveedor.trim().length > 0
    && typeof option.servicio === 'string' && option.servicio.trim().length > 0
    && typeof option.costo === 'number' && Number.isFinite(option.costo) && option.costo >= 0
    && typeof option.dias_habiles_entrega === 'number' && Number.isInteger(option.dias_habiles_entrega) && option.dias_habiles_entrega >= 0
    && typeof option.es_cobertura_valida === 'boolean'
    && typeof option.es_gratis === 'boolean';
}

function isResultadoCotizacion(value: unknown): value is ResultadoCotizacion {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  const destino = result.destino as Record<string, unknown> | null;
  return Boolean(destino && typeof destino === 'object'
    && typeof destino.comuna === 'string'
    && typeof destino.region === 'string')
    && typeof result.total_items === 'number' && Number.isInteger(result.total_items) && result.total_items > 0
    && typeof result.total_carrito === 'number' && Number.isFinite(result.total_carrito) && result.total_carrito >= 0
    && (result.opcion_recomendada === null || isOpcionCotizacion(result.opcion_recomendada))
    && Array.isArray(result.opciones)
    && result.opciones.every(isOpcionCotizacion);
}

async function requestTracking(
  path: string,
  tracking: string,
  signal?: AbortSignal,
  expectedProvider?: DetalleSeguimiento['proveedor'],
): Promise<DetalleSeguimiento> {
  const response = await fetch(`${API_BASE}${path}`, { signal });
  const data = await readJson(response);
  if (!data) {
    throw new Error('La información de seguimiento recibida es inválida.');
  }
  if (!response.ok || !data.exito) {
    throw new Error(data.mensaje || 'No se encontró información de seguimiento para este código.');
  }
  if (!isTrackingDetail(data.data, tracking)
    || (expectedProvider && data.data.proveedor !== expectedProvider)) {
    throw new Error('La información de seguimiento recibida es inválida.');
  }
  return data.data;
}

async function requestCarrierQuote(
  path: string,
  payload: Record<string, unknown>,
  fallbackError: string,
): Promise<ResultadoCotizacion> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await readJson(response);
  if (!data) {
    throw new Error('La respuesta de cotización recibida es inválida.');
  }
  if (!response.ok || !data.exito) {
    throw new Error(data.mensaje || fallbackError);
  }
  if (!isResultadoCotizacion(data.data)) {
    throw new Error('La respuesta de cotización recibida es inválida.');
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
    return requestCarrierQuote(
      '/api/logistica/cotizar/',
      {
        ...params,
        total_carrito: Number(params.total_carrito || 0).toFixed(2),
        proveedor: params.proveedor || 'todos',
      },
      'Error al cotizar envío.',
    );
  },


  async quoteChilexpress(params: Omit<CotizacionParams, 'proveedor'>): Promise<ResultadoCotizacion> {
    return requestCarrierQuote(
      '/api/logistica/cotizar/chilexpress/',
      {
        ...params,
        total_carrito: Number(params.total_carrito || 0).toFixed(2),
        proveedor: 'chilexpress',
      },
      'Error al cotizar con Chilexpress.',
    );
  },


  async quoteStarken(params: Omit<CotizacionParams, 'proveedor'>): Promise<ResultadoCotizacion> {
    return requestCarrierQuote(
      '/api/logistica/cotizar/starken/',
      {
        ...params,
        total_carrito: Number(params.total_carrito || 0).toFixed(2),
        proveedor: 'starken',
      },
      'Error al cotizar con Starken.',
    );
  },
};


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
        && (fields.status === 'not_configured' || (key === 'chilexpress' && fields.status === 'configured')));
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

export async function saveChilexpressCredentials(
  chilexpress: Pick<ShippingConfiguration['chilexpress'], 'ambiente' | 'credenciales'>,
): Promise<ShippingConfiguration> {
  return readConfiguration(await fetch(`${API_BASE_URL}/api/entregas/configuracion/`, {
    method: 'PATCH', headers: adminHeaders(),
    body: JSON.stringify({ chilexpress: { ambiente: chilexpress.ambiente, credenciales: chilexpress.credenciales } }),
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
  region: string; comuna: string; origen: 'configuracion_tienda' | 'api_transportista'; cotizacion: string; vence_en: number;
  peso_kg?: string; peso_estimado?: boolean;
};

export type ShippingQuoteItem = { productId: string; sku: string; quantity: number };

export async function getShippingQuotes(operador: string, region: string, comuna: string, items: ShippingQuoteItem[], signal?: AbortSignal, sector = ''): Promise<ShippingQuote[]> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/entregas/cotizacion/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operador, region, comuna, ...(sector ? { sector } : {}),
        items: items.map(item => ({ producto_id: item.productId, sku: item.sku, cantidad: item.quantity })) }),
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
    && tarifa.moneda === 'CLP' && (tarifa.origen === 'configuracion_tienda' || tarifa.origen === 'api_transportista')
    && typeof tarifa.monto === 'string' && /^\d+$/.test(tarifa.monto)
    && Number.isSafeInteger(Number(tarifa.monto)) && Number(tarifa.monto) <= 9999999999
    && (tarifa.plazo_dias === null || (Number.isInteger(tarifa.plazo_dias) && tarifa.plazo_dias > 0))
    && typeof tarifa.cotizacion === 'string' && tarifa.cotizacion.length > 0
    && Number.isSafeInteger(tarifa.vence_en) && tarifa.vence_en > Date.now() / 1000)) {
    throw new ShippingError('La cotización recibida es inválida. Vuelve a cotizar el envío.', 'temporal');
  }
  return tarifas.map(tarifa => ({ ...tarifa, monto: Number(tarifa.monto) }));
}

const claveComuna = (texto: string) =>
  texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

const PALABRAS_MENORES = new Set(['de', 'del', 'la', 'las', 'los', 'y']);

const capitalizar = (texto: string) => texto.toLowerCase().split(/(\s+|-)/).map((parte, index) =>
  index > 0 && PALABRAS_MENORES.has(parte) ? parte : parte.charAt(0).toUpperCase() + parte.slice(1)).join('');

export type SectorChilexpress = { codigo: string; nombre: string; reparto: boolean };

const nombreDeSector = (cobertura: string, comuna: string): string => {
  const limpio = cobertura.trim();
  const separador = limpio.indexOf(' - ');
  const sinPrefijo = separador >= 0 && claveComuna(limpio.slice(0, separador)) === claveComuna(comuna)
    ? limpio.slice(separador + 3) : limpio;
  return capitalizar(sinPrefijo);
};

const sectoresDeCobertura = (body: any, region: string): Record<string, SectorChilexpress[]> => {
  const items = body?.exito && Array.isArray(body.data?.comunas) ? body.data.comunas : [];
  const oficiales = new Map(comunasDeRegion(region).map(nombre => [claveComuna(nombre), nombre]));
  const porComuna: Record<string, SectorChilexpress[]> = {};
  for (const item of items as Array<{ comuna?: unknown; cobertura?: unknown; codigo?: unknown; modo?: unknown; reparto?: unknown }>) {
    if (item.modo !== 2 || typeof item.codigo !== 'string') continue;
    const comuna = String(item.comuna || '').trim();
    if (!comuna) continue;
    const nombreComuna = oficiales.get(claveComuna(comuna)) ?? capitalizar(comuna);
    (porComuna[nombreComuna] ??= []).push({
      codigo: item.codigo,
      nombre: nombreDeSector(String(item.cobertura || item.codigo), comuna),
      reparto: item.reparto === true,
    });
  }
  Object.values(porComuna).forEach(lista => lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
  return porComuna;
};

export async function getSectoresChilexpress(region: string, signal?: AbortSignal): Promise<Record<string, SectorChilexpress[]> | null> {
  if (!region) return null;
  try {
    const response = await fetch(
      `${API_BASE}/api/logistica/chilexpress/coberturas/?region=${encodeURIComponent(nombreOficialRegion(region))}`,
      { signal },
    );
    const body = await readJson(response);
    return body?.exito ? sectoresDeCobertura(body, region) : null;
  } catch {
    return null;
  }
}

const nombresDeCobertura = (body: any, region: string): string[] | null => {
  const items = body?.exito && Array.isArray(body.data?.comunas) ? body.data.comunas : null;
  if (!items) return null;
  const oficiales = new Map(comunasDeRegion(region).map(nombre => [claveComuna(nombre), nombre]));
  const names = items
    .map((item: { comuna?: unknown }) => String(item.comuna || '').trim())
    .filter(Boolean)
    .map((comuna: string) => oficiales.get(claveComuna(comuna)) ?? capitalizar(comuna));
  return names.length ? Array.from(new Set<string>(names)).sort((a, b) => a.localeCompare(b, 'es')) : null;
};

export async function getComunasChilexpress(region: string, signal?: AbortSignal): Promise<string[] | null> {
  if (!region) return null;
  try {
    const response = await fetch(
      `${API_BASE}/api/logistica/chilexpress/coberturas/?region=${encodeURIComponent(nombreOficialRegion(region))}`,
      { signal },
    );
    return nombresDeCobertura(await readJson(response), region);
  } catch {
    return null;
  }
}

export async function getComunasChilexpressAdmin(
  region: string, clave: string, ambiente: string, signal?: AbortSignal,
): Promise<string[] | null> {
  if (!region) return null;
  try {
    const response = await fetch(`${API_BASE}/api/logistica/chilexpress/coberturas/admin/`, {
      method: 'POST', headers: adminHeaders(), signal,
      body: JSON.stringify({ region: nombreOficialRegion(region), coberturas: clave, ambiente }),
    });
    return nombresDeCobertura(await readJson(response), region);
  } catch {
    return null;
  }
}
