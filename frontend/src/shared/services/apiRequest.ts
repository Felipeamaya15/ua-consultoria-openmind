import { humanizeAdminError } from '../../features/admin/utils/humanizeError';

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number, public readonly code?: string) {
    super(message); this.name = 'ApiError';
  }
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const messages = (value: unknown, depth = 0): string[] => depth > 5 ? [] : typeof value === 'string' ? [value]
  : record(value) || Array.isArray(value) ? Object.entries(value).slice(0, 30)
    .flatMap(([key, item]) => {
      const nested = messages(item, depth + 1);
      if (/password/i.test(key)) return nested.filter(message => /^(?:Este campo es obligatorio\.|Este campo no puede estar en blanco\.|La contraseña actual es incorrecta\.|Las contraseñas no coinciden\.|La contraseña debe (?:tener|contener) [^.:=]{1,120}\.)$/.test(message));
      return /secret|token|credential|credencial|clave[_\s-]*(?:privada|secreta)|private[_\s-]?key|api[_-]?key|authorization|trace|provider|proveedor|response|respuesta/i.test(key) ? [] : nested;
    }) : [];
const statusMessages: Record<number, string> = {
  400: 'Revisa los datos ingresados e intenta nuevamente.',
  401: 'Tu sesión venció. Vuelve a iniciar sesión.',
  403: 'No tienes permiso para realizar esta operación.',
  404: 'No se encontró el recurso. Actualiza la página e intenta nuevamente.',
  409: 'Los datos cambiaron o entran en conflicto. Actualiza la información antes de volver a guardar.',
  422: 'Revisa los datos ingresados e intenta nuevamente.',
  429: 'Realizaste demasiadas solicitudes. Espera un momento antes de volver a intentar.',
};

export const isRequestCancelled = (cause: unknown): boolean => !!cause && typeof cause === 'object' && 'name' in cause && cause.name === 'AbortError';

/** Contrato común de Django: { exito: true, data }. Nunca muestra cuerpos completos. */
export async function readApiEnvelope(response: Response, fallback = 'No pudimos completar la operación. Intenta nuevamente.'): Promise<Record<string, unknown>> {
  if ([401, 403, 404].includes(response.status)) throw new ApiError(statusMessages[response.status], response.status);
  if (response.status >= 500) throw new ApiError('El servicio no está disponible en este momento. Intenta nuevamente más tarde.', response.status);
  let body: unknown;
  try { body = await response.json(); }
  catch (cause) {
    if (isRequestCancelled(cause)) throw cause;
    throw new ApiError(response.ok ? 'La respuesta recibida no es válida. Comprueba si se guardó antes de volver a intentarlo.' : statusMessages[response.status] || fallback, response.status);
  }
  if (!response.ok || (record(body) && body.exito === false)) {
    const error = record(body) && record(body.error) ? body.error : {};
    const candidates = record(body) ? [...messages(error.detalles), ...messages(body.detail), ...messages(body.mensaje)] : [];
    const safe = candidates.map(message => humanizeAdminError(message, '')).find(Boolean);
    const code = typeof error.codigo === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.codigo) ? error.codigo : undefined;
    throw new ApiError(safe || statusMessages[response.status] || fallback, response.status, code);
  }
  if (!record(body) || body.exito !== true || !Object.prototype.hasOwnProperty.call(body, 'data')) {
    throw new ApiError('La respuesta recibida no es válida. Comprueba si se guardó antes de volver a intentarlo.', response.status);
  }
  return body;
}
export async function readApiResponse(response: Response, fallback?: string): Promise<unknown> {
  return (await readApiEnvelope(response, fallback)).data;
}

/** Una solicitud por acción. No reintenta escrituras: el formulario decide cómo recuperar. */
export async function requestEnvelope(url: string, init: RequestInit = {}, fallback = 'No pudimos completar la operación. Intenta nuevamente.', timeoutMs = 15000): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  init.signal?.addEventListener('abort', cancel, { once: true });
  if (init.signal?.aborted) controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    init.signal?.throwIfAborted();
    const response = await fetch(url, { ...init, signal: controller.signal });
    controller.signal.throwIfAborted();
    const data = await readApiEnvelope(response, fallback);
    controller.signal.throwIfAborted();
    return data;
  } catch (cause) {
    if (init.signal?.aborted) { const cancelled = new Error('Solicitud cancelada.'); cancelled.name = 'AbortError'; throw cancelled; }
    if (timedOut) throw new ApiError('La operación tardó demasiado. Comprueba si se guardó antes de volver a intentarlo.');
    if (cause instanceof ApiError) throw cause;
    throw new ApiError('No pudimos conectar con el servidor. Revisa tu conexión e intenta nuevamente.');
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', cancel);
  }
}
export async function requestJson(url: string, init: RequestInit = {}, fallback?: string, timeoutMs = 15000): Promise<unknown> {
  return (await requestEnvelope(url, init, fallback, timeoutMs)).data;
}
