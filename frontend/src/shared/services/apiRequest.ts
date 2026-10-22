import { humanizeAdminError } from '../../features/admin/utils/humanizeError';

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number, public readonly code?: string) {
    super(message); this.name = 'ApiError';
  }
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const messages = (value: unknown): string[] => typeof value === 'string' ? [value]
  : record(value) || Array.isArray(value) ? Object.values(value).flatMap(messages) : [];
const sensitive = /password|secret|clave[_\s]*(privada|secreta)|api[_\s-]?key|bearer\s|enc::|postgres(?:ql)?:\/\/|mongodb(?:\+srv)?:\/\/|sk-[a-z0-9]|access[_\s-]?token/i;

/** Una solicitud por acción. No reintenta escrituras: el formulario decide cómo recuperar. */
export async function requestJson(url: string, init: RequestInit = {}, fallback = 'No pudimos completar la operación. Intenta nuevamente.', timeoutMs = 15000): Promise<unknown> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  init.signal?.addEventListener('abort', cancel, { once: true });
  if (init.signal?.aborted) controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const statusMessages: Record<number, string> = {
      401: 'Tu sesión venció. Vuelve a iniciar sesión.',
      403: 'No tienes permiso para realizar esta operación.',
      404: 'No se encontró el recurso. Actualiza la página e intenta nuevamente.',
    };
    if (statusMessages[response.status]) throw new ApiError(statusMessages[response.status], response.status);
    if (response.status >= 500) throw new ApiError('El servicio no está disponible en este momento. Intenta nuevamente más tarde.', response.status);
    const body: unknown = await response.json().catch(() => null);
    if (!record(body)) throw new ApiError('La respuesta recibida no es válida. Intenta nuevamente.', response.status);
    if (!response.ok || body.exito !== true) {
      const error = record(body.error) ? body.error : {};
      const candidates = [...messages(error.detalles), ...messages(body.detail), ...messages(body.mensaje)];
      const safe = candidates.map(message => sensitive.test(message) ? '' : humanizeAdminError(message, '')).find(Boolean);
      throw new ApiError(safe || fallback, response.status, typeof error.codigo === 'string' ? error.codigo : undefined);
    }
    return body.data;
  } catch (cause) {
    if (init.signal?.aborted) throw cause;
    if (timedOut) throw new ApiError('La operación tardó demasiado. Comprueba si se guardó antes de volver a intentarlo.');
    if (cause instanceof ApiError) throw cause;
    throw new ApiError('No pudimos conectar con el servidor. Revisa tu conexión e intenta nuevamente.');
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', cancel);
  }
}
