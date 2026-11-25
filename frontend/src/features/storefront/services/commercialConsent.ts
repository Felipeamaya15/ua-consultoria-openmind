const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const CONSENT_VERSION = 'correo-promocional-v1';
export const CONSENT_TEXT = 'Quiero recibir promociones, ofertas y novedades de esta tienda por correo electrónico. Puedo retirar mi autorización cuando quiera.';
export function hasConsentSession() {
  return Boolean(localStorage.getItem('token') || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('token')));
}
export async function consentRequest(path: string, body: Record<string, unknown>, withIdentity = false, method: 'GET' | 'POST' = 'POST') {
  const token = path === 'enlace' && !withIdentity ? null : localStorage.getItem('token') || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('token'));
  let response: Response;
  try {
    response = await fetch(`${API}/api/consentimiento/${path}/`, {
      method, cache: 'no-store', headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Token ${token}`} : {})},
      ...(method === 'POST' ? {body: JSON.stringify(body)} : {}),
    });
  } catch { throw new Error('No pudimos conectar. Revisa tu conexión y reintenta.'); }
  if (path === 'enlace' && withIdentity && response.status === 401) return consentRequest(path, body);
  let result;
  try { result = await response.json(); }
  catch { throw new Error('No pudimos procesar la respuesta. Reintenta.'); }
  if (!result || typeof result !== 'object') throw new Error('No pudimos procesar la respuesta. Reintenta.');
  if (!response.ok || result.exito !== true) throw new Error(typeof result.mensaje === 'string' ? result.mensaje :
    typeof result.detail === 'string' ? result.detail : 'No pudimos procesar la preferencia. Reintenta.');
  return result;
}
export interface OwnCommercialPreference {
  email: string; correo_verificado: boolean; estado: string; recibir: boolean;
  version_texto: string; texto: string; fecha_autorizacion: string | null;
  fecha_actualizacion: string | null; fecha_retirada: string | null;
}
async function ownPreference(body?: {recibir: boolean; version_texto: string}): Promise<OwnCommercialPreference> {
  const result = await consentRequest('mi-preferencia', body || {}, true, body ? 'POST' : 'GET');
  const value = result.data;
  if (!value || typeof value.email !== 'string' || typeof value.correo_verificado !== 'boolean'
      || typeof value.recibir !== 'boolean' || !['autorizado','pendiente','retirado','sin_registro'].includes(value.estado))
    throw new Error('No pudimos confirmar tu preferencia actual. Reintenta.');
  return value;
}
export const readOwnConsent = () => ownPreference();
export const saveOwnConsent = (receive: boolean) => ownPreference({recibir: receive, version_texto: CONSENT_VERSION});
export function requestConsent(email: string, template: string, purpose = 'confirmar') {
  return consentRequest('solicitar', {email, plantilla: Number(template), proposito: purpose, version_texto: CONSENT_VERSION});
}
