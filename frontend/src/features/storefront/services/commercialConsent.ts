const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const CONSENT_VERSION = 'correo-promocional-v1';
export const CONSENT_TEXT = 'Quiero recibir promociones, ofertas y novedades de esta tienda por correo electrónico. Puedo retirar mi autorización cuando quiera.';
export async function consentRequest(path: string, body: Record<string, unknown>) {
  const token = path === 'enlace' ? null : localStorage.getItem('token');
  let response: Response;
  try {
    response = await fetch(`${API}/api/consentimiento/${path}/`, {
      method: 'POST', headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Token ${token}`} : {})},
      body: JSON.stringify(body),
    });
  } catch { throw new Error('No pudimos conectar. Revisa tu conexión y reintenta.'); }
  let result;
  try { result = await response.json(); }
  catch { throw new Error('No pudimos procesar la respuesta. Reintenta.'); }
  if (!result || typeof result !== 'object') throw new Error('No pudimos procesar la respuesta. Reintenta.');
  if (!response.ok || result.exito !== true) throw new Error(typeof result.mensaje === 'string' ? result.mensaje :
    typeof result.detail === 'string' ? result.detail : 'No pudimos procesar la preferencia. Reintenta.');
  return result;
}
export function requestConsent(email: string, template: string, purpose = 'confirmar') {
  return consentRequest('solicitar', {email, plantilla: Number(template), proposito: purpose, version_texto: CONSENT_VERSION});
}
