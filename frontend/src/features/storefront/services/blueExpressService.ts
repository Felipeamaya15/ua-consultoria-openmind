import { API_BASE_URL } from '../../../api';

const API_BASE = API_BASE_URL.replace(/\/+$/, '');

export interface BlueDistrict {
  code: string;
  name: string;
}

export interface BlueCommune {
  code: number;
  name: string;
  districts: BlueDistrict[];
}

export interface BlueRegion {
  code: number;
  name: string;
  communes: BlueCommune[];
}

export interface BlueDestination {
  region_code: number;
  commune_code: number;
  district_code: string;
}

export interface BlueQuoteRequest {
  producto_id: string;
  sku: string;
  cantidad: 1;
  destino: BlueDestination;
}

export interface BlueQuote {
  proveedor: 'BLUE_EXPRESS';
  servicio: 'EX';
  total: string;
  cotizacion: string;
  producto_mongo_id: string;
  sku: string;
  cantidad: 1;
  fecha_estimada_entrega: string | null;
}

export class BlueExpressError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'BlueExpressError';
    this.code = code;
    this.status = status;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value > 0;
}

function isDistrict(value: unknown): value is BlueDistrict {
  return isObject(value)
    && isText(value.code)
    && isText(value.name);
}

function isCommune(value: unknown): value is BlueCommune {
  return isObject(value)
    && isPositiveInteger(value.code)
    && isText(value.name)
    && Array.isArray(value.districts)
    && value.districts.every(isDistrict);
}

function isRegion(value: unknown): value is BlueRegion {
  return isObject(value)
    && isPositiveInteger(value.code)
    && isText(value.name)
    && Array.isArray(value.communes)
    && value.communes.every(isCommune);
}

function isValidTotal(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d+(\.0+)?$/.test(value)) {
    return false;
  }

  const amount = Number(value);
  return Number.isSafeInteger(amount)
    && amount >= 0
    && amount <= 9999999999;
}

function isQuote(value: unknown): value is BlueQuote {
  return isObject(value)
    && value.proveedor === 'BLUE_EXPRESS'
    && value.servicio === 'EX'
    && isValidTotal(value.total)
    && isText(value.cotizacion)
    && isText(value.producto_mongo_id)
    && isText(value.sku)
    && value.cantidad === 1
    && (
      value.fecha_estimada_entrega === null
      || (
        typeof value.fecha_estimada_entrega === 'string'
        && /^\d{4}-\d{2}-\d{2}$/.test(value.fecha_estimada_entrega)
      )
    );
}

async function request(
  path: string,
  options: RequestInit,
): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      cache: 'no-store',
    });
  } catch (error) {
    if (options.signal?.aborted) {
      throw error;
    }

    throw new BlueExpressError(
      'No se pudo conectar con el servidor. Intenta nuevamente.',
      'NETWORK_ERROR',
      0,
    );
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch (error) {
    if (options.signal?.aborted) {
      throw error;
    }

    throw new BlueExpressError(
      'El servidor devolvió una respuesta inválida.',
      'INVALID_RESPONSE',
      response.status,
    );
  }

  if (!isObject(body)) {
    throw new BlueExpressError(
      'El servidor devolvió una respuesta inválida.',
      'INVALID_RESPONSE',
      response.status,
    );
  }

  if (!response.ok || body.exito !== true) {
    const errorData = isObject(body.error) ? body.error : {};

    const message = response.status === 429
      ? 'Has realizado varias consultas. Espera un minuto e intenta nuevamente.'
      : isText(body.mensaje)
        ? body.mensaje
        : 'No se pudo completar la consulta de Blue Express.';

    throw new BlueExpressError(
      message,
      isText(errorData.codigo) ? errorData.codigo : 'BLUE_REQUEST_ERROR',
      response.status,
    );
  }

  return body.data;
}

export async function fetchBlueTerritory(
  signal?: AbortSignal,
): Promise<BlueRegion[]> {
  const data = await request('/api/checkout/blue-express/territorio/', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (
    !isObject(data)
    || !Array.isArray(data.regiones)
    || data.regiones.length === 0
    || !data.regiones.every(isRegion)
  ) {
    throw new BlueExpressError(
      'El catálogo territorial recibido es inválido.',
      'INVALID_TERRITORY',
      200,
    );
  }

  return data.regiones;
}

export async function fetchBlueQuote(
  payload: BlueQuoteRequest,
  signal?: AbortSignal,
): Promise<BlueQuote> {
  const data = await request('/api/checkout/blue-express/cotizacion/', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (
    !isQuote(data)
    || data.sku !== payload.sku
    || data.cantidad !== payload.cantidad
  ) {
    throw new BlueExpressError(
      'La cotización recibida es inválida.',
      'INVALID_QUOTE',
      200,
    );
  }

  return data;
}