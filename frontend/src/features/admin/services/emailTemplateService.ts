import { API_BASE_URL } from '../../../api';
import type { EmailTemplate } from '../data/emailTemplates';

export type RemoteEmailTemplates = {
  plantillas: Record<string, EmailTemplate>;
  por_defecto: Record<string, EmailTemplate>;
};

function token() {
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

async function request(init: RequestInit = {}): Promise<RemoteEmailTemplates> {
  const auth = token();
  const response = await fetch(`${API_BASE_URL}/api/tienda/correos/`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(auth ? { Authorization: `Token ${auth}` } : {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.exito !== true) {
    const details = body.error?.detalles;
    const first =
      details && typeof details === 'object'
        ? Object.values(details).flat().find((value) => typeof value === 'string')
        : null;
    throw new Error((first as string) || body.mensaje || 'No se pudieron procesar las plantillas de correo.');
  }
  return body.data;
}

export const fetchEmailTemplates = () => request();

export const saveEmailTemplates = (plantillas: Record<string, EmailTemplate>) =>
  request({ method: 'PUT', body: JSON.stringify({ plantillas }) });
