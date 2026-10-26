const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const CONSENT_VERSION = 'correo-promocional-v1';
export const CONSENT_TEXT = 'Quiero recibir promociones, ofertas y novedades de esta tienda por correo electrónico. Puedo retirar mi autorización cuando quiera.';
export async function consentRequest(path: string, body: Record<string, unknown>) {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API}/api/consentimiento/${path}/`, {
    method: 'POST', headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Token ${token}`} : {})},
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.mensaje || result.detail || 'No pudimos procesar la preferencia. Reintenta.');
  return result;
}
export function requestConsent(email: string, template: string, purpose = 'confirmar') {
  return consentRequest('solicitar', {email, plantilla: Number(template), proposito: purpose, version_texto: CONSENT_VERSION});
}
