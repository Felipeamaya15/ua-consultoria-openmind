import { API_BASE_URL } from '../../../api';
import { requestJson } from '../../../shared/services/apiRequest';
import { authService } from '../../auth/services/authService';

export interface MailConnection {
  conectado: boolean; correo: string; oauth_configurado: boolean;
  modo: 'mailpit' | 'gmail'; estado: 'conectado' | 'desconectado' | 'reconectar';
  envio_habilitado: boolean; aviso: string;
  correo_negocio: string; autorizacion_vigente: boolean;
  autorizacion_fecha: string | null; autorizacion_version: string;
}
export const MAIL_AUTHORIZATION_VERSION = 'uso-correo-negocio-v1';
export const MAIL_AUTHORIZATION_TEXT = 'Autorizo el uso de esta cuenta para enviar campañas publicitarias a clientes autorizados y responder consultas de servicios y talleres';
async function request(path: string, data?: unknown) {
  const token = authService.getToken();
  if (!token) throw new Error('Inicia sesión como propietario para administrar el correo.');
  return requestJson(`${API_BASE_URL}/api/tienda/correo/google/${path}/`, {
    method: data === undefined ? 'GET' : 'POST', cache: 'no-store',
    headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  }, undefined, 30000);
}
export const mailConnectionService = {
  async status(): Promise<MailConnection> {
    const data = await request('estado') as unknown as MailConnection;
    if (!data || typeof data.conectado !== 'boolean' || typeof data.correo !== 'string' || typeof data.envio_habilitado !== 'boolean'
      || !['mailpit','gmail'].includes(data.modo) || !['conectado','desconectado','reconectar'].includes(data.estado))
      throw new Error('No se pudo confirmar el estado del correo. Actualiza la conexión.');
    return data;
  },
  async connect(email: string, authorize: boolean): Promise<string> {
    if (!authorize || !email.trim()) throw new Error('Guarda el correo del negocio y autoriza expresamente su uso.');
    const data = await request('iniciar', {correo_negocio: email.trim(), autorizar: true, version_texto: MAIL_AUTHORIZATION_VERSION}) as {url_autorizacion?: unknown};
    if (typeof data.url_autorizacion !== 'string') throw new Error('No se pudo iniciar la autorización.');
    const url = new URL(data.url_autorizacion);
    if (url.origin !== 'https://accounts.google.com' || url.pathname !== '/o/oauth2/v2/auth') throw new Error('El enlace de autorización no es válido.');
    return url.href;
  },
  async disconnect() { return request('desconectar', {}); },
  async test(key: string) {
    const data = await request('prueba', { clave: key }) as {estado?: unknown; codigo?: unknown};
    if (typeof data.estado !== 'string') throw new Error('No se confirmó la prueba. Actualiza la conexión antes de repetir.');
    return data as { estado: string; codigo: string };
  },
};
