import { API_BASE_URL } from '../../../api';
import type { EmailTemplate } from '../data/emailTemplates';
import { requestJson } from '../../../shared/services/apiRequest';

export type RemoteEmailTemplates = {
  plantillas: Record<string, EmailTemplate>;
  por_defecto: Record<string, EmailTemplate>;
  variables?: import('../components/AutomaticFieldEditor').AutomaticField[];
  obligatorias?: Record<string,string[]>;
};

function token() {
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

async function request(init: RequestInit = {}): Promise<RemoteEmailTemplates> {
  const auth = token();
  const data = await requestJson(`${API_BASE_URL}/api/tienda/correos/`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(auth ? { Authorization: `Token ${auth}` } : {}),
    },
  });
  const templates = data as RemoteEmailTemplates | null;
  if (!templates || !templates.plantillas || !templates.por_defecto) throw new Error('No pudimos confirmar las plantillas guardadas. Recarga antes de volver a intentar.');
  return templates;
}

export const fetchEmailTemplates = () => request();

export const sendEmergencyEmail = async (params: { tipo: string; destinatario?: string; id_pedido?: number }) => {
  const auth = token();
  const data = await requestJson(`${API_BASE_URL}/api/tienda/correos/enviar-manual/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(auth ? { Authorization: `Token ${auth}` } : {}),
    },
    body: JSON.stringify(params),
  });
  return data as {
    enviado: boolean;
    codigo: string;
    destinatario: string;
  };
};

export const saveEmailTemplates = (plantillas: Record<string, EmailTemplate>) =>
  request({ method: 'PUT', body: JSON.stringify({ plantillas }) });
