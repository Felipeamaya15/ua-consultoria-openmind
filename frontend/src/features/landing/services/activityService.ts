import { API_BASE_URL } from '../../../api';
import { requestJson } from '../../../shared/services/apiRequest';
import { authService } from '../../auth/services/authService';

export type ActivityRequestKind = 'consulta' | 'inscripcion';

export const CONSULT_STATES = {
  nueva: 'Nueva',
  en_revision: 'En revisión',
  respondida: 'Respondida',
  cerrada: 'Cerrada',
};

export const ENROLL_STATES = {
  pendiente: 'Pendiente de confirmación',
  confirmada: 'Confirmada (gratuita)',
  cancelada: 'Cancelada',
};

export type ActivityRequestState =
  | keyof typeof CONSULT_STATES
  | keyof typeof ENROLL_STATES;

export interface ActivitySubmission {
  solicitud_id: string;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  mensaje: string;
  consentimiento: boolean;
}

export interface ActivityRequest {
  id: string;
  seccion_id: string;
  titulo_actividad: string;
  tipo_actividad: 'servicio' | 'taller';
  tipo: ActivityRequestKind;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  mensaje: string;
  estado: ActivityRequestState;
  archivada: boolean;
  archivada_en: string | null;
  creado: string;
  actualizado: string;
  consentimiento_version: string;
  consentimiento_fecha: string;
}

export interface ActivityRequestPage {
  resultados: ActivityRequest[];
  total: number;
  pagina: number;
  paginas: number;
}

const base = `${API_BASE_URL}/api/landing/`;

function headers(required = false): Record<string, string> {
  const token = authService.getToken();
  if (required && !token) {
    throw new Error('Inicia sesión como propietario para gestionar las solicitudes.');
  }
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Token ${token}` } : {}),
  };
}

const uuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export async function submitActivity(
  sectionId: string,
  kind: ActivityRequestKind,
  data: ActivitySubmission,
  signal?: AbortSignal
): Promise<void> {
  if (!uuid(sectionId)) throw new Error('La actividad no está disponible.');

  const result = await requestJson(
    `${base}actividades/${sectionId}/${kind === 'consulta' ? 'consultas' : 'inscripciones'}/`,
    { method: 'POST', headers: headers(), body: JSON.stringify(data), signal }
  );

  if (!result || typeof result !== 'object' || !('recibida' in result) || result.recibida !== true) {
    throw new Error('No pudimos confirmar la recepción. Conservamos el formulario; reintenta con los mismos datos.');
  }
}

function validRequest(value: unknown): value is ActivityRequest {
  if (!value || typeof value !== 'object') return false;
  const item = value as ActivityRequest;

  return (
    uuid(item.id || '') &&
    uuid(item.seccion_id || '') &&
    ['consulta', 'inscripcion'].includes(item.tipo) &&
    Object.prototype.hasOwnProperty.call(
      item.tipo === 'consulta' ? CONSULT_STATES : ENROLL_STATES,
      item.estado
    ) &&
    typeof item.archivada === 'boolean' &&
    (item.archivada_en === null || typeof item.archivada_en === 'string') &&
    [
      'titulo_actividad',
      'nombre',
      'apellido',
      'email',
      'telefono',
      'mensaje',
      'creado',
      'actualizado',
    ].every(key => typeof (item as unknown as Record<string, unknown>)[key] === 'string')
  );
}

export async function fetchActivityRequests(
  params: URLSearchParams,
  signal?: AbortSignal
): Promise<ActivityRequestPage> {
  // La API usa archivada=false por defecto; para historial enviar archivada=true.
  const result = await requestJson(
    `${base}solicitudes-actividades/?${params.toString()}`,
    { headers: headers(true), cache: 'no-store', signal }
  ) as ActivityRequestPage;

  if (
    !result ||
    !Array.isArray(result.resultados) ||
    !result.resultados.every(validRequest) ||
    !Number.isInteger(result.total) ||
    !Number.isInteger(result.pagina) ||
    !Number.isInteger(result.paginas)
  ) {
    throw new Error('No pudimos validar el listado de solicitudes. Intenta nuevamente.');
  }

  return result;
}

export async function updateActivityState(
  id: string,
  estado: ActivityRequestState
): Promise<ActivityRequest> {
  if (!uuid(id)) throw new Error('La solicitud no está disponible.');

  const result = await requestJson(`${base}solicitudes-actividades/${id}/`, {
    method: 'PATCH',
    headers: headers(true),
    body: JSON.stringify({ estado }),
  });

  if (!validRequest(result)) {
    throw new Error('No pudimos confirmar el estado. Actualiza el listado antes de reintentar.');
  }
  return result;
}

/** Solo las consultas se pueden archivar: el backend también verifica esta regla. */
export async function updateActivityArchive(
  id: string,
  archivada: boolean
): Promise<ActivityRequest> {
  if (!uuid(id)) throw new Error('La solicitud no está disponible.');

  const result = await requestJson(`${base}solicitudes-actividades/${id}/`, {
    method: 'PATCH',
    headers: headers(true),
    body: JSON.stringify({ archivada }),
  });

  if (!validRequest(result)) {
    throw new Error('No pudimos confirmar el archivado. Actualiza el listado antes de reintentar.');
  }
  return result;
}
