import { API_BASE_URL } from '../../../api';
import { authService } from '../../auth/services/authService';
import { requestJson } from '../../../shared/services/apiRequest';

export interface InstagramConnection {
  conectado: boolean; estado: string; usuario: string; vence_en: string | null;
  oauth_configurado: boolean; publicacion_habilitada: boolean; publicacion_externa_permitida: boolean;
  media_https_configurada: boolean; callback_url: string; sin_vencimiento_programado: boolean;
  tipo_token: 'SYSTEM_USER'; renovacion: 'reautorizar';
}
export interface InstagramPublication {
  id: string; descripcion: string; estado: string; usuario_instagram: string;
  contenedor_id: string; media_id: string; codigo: string; creada_en: string; actualizado_en: string;
}
export const INSTAGRAM_STATES: Record<string, string> = {
  preparada: 'Preparada: aún no publicada', creando: 'Preparando el contenedor en Instagram',
  procesando: 'Instagram está procesando la imagen', publicando: 'Publicación en curso',
  publicada: 'Publicación confirmada por Instagram', fallida: 'No se completó la publicación',
  indeterminada: 'Resultado sin confirmar: consulta el estado antes de cualquier otra acción',
};
function request(path: string, body?: unknown) {
  const token = authService.getToken();
  if (!token) throw new Error('Inicia sesión como propietario para administrar Instagram.');
  const file = body instanceof FormData;
  return requestJson(`${API_BASE_URL}/api/instagram/${path}`, {
    method: body === undefined ? 'GET' : 'POST', cache: 'no-store', credentials: 'include',
    headers: { Authorization: `Token ${token}`, ...(file ? {} : {'Content-Type': 'application/json'}) },
    ...(body === undefined ? {} : {body: file ? body : JSON.stringify(body)}),
  }, undefined, 60000);
}
function connection(value: unknown): InstagramConnection {
  const row = value as InstagramConnection;
  if (!row || typeof row.conectado !== 'boolean' || typeof row.oauth_configurado !== 'boolean'
    || typeof row.publicacion_habilitada !== 'boolean' || typeof row.usuario !== 'string')
    throw new Error('No pudimos confirmar el estado de Instagram. Actualiza la conexión.');
  return row;
}
function publication(value: unknown): InstagramPublication {
  const row = value as InstagramPublication;
  if (!row || !/^[0-9a-f-]{36}$/i.test(row.id) || !INSTAGRAM_STATES[row.estado] || typeof row.descripcion !== 'string')
    throw new Error('No se pudo confirmar el resultado. Consulta el historial antes de repetir.');
  return row;
}
export const instagramService = {
  async status() { return connection(await request('estado/')); },
  async connect(authorize: boolean, renew = false) {
    if (!authorize) throw new Error('Autoriza expresamente la conexión de Instagram.');
    const data = await request(renew ? 'renovar/' : 'oauth/iniciar/', {autorizar: true}) as {url_autorizacion?: string; url_inicio?: string; callback_url?: string};
    const url = new URL(data?.url_autorizacion || '');
    if (url.origin !== 'https://www.facebook.com' || url.pathname !== '/dialog/oauth'
      || !/^[0-9]{1,40}$/.test(url.searchParams.get('config_id') || '') || url.searchParams.has('scope')
      || url.searchParams.get('response_type') !== 'code'
      || url.searchParams.get('override_default_response_type') !== 'true') throw new Error('La autorización recibida no corresponde a Unified Login.');
    const start = new URL(data.url_inicio || ''), callback = new URL(data.callback_url || '');
    if (callback.protocol !== 'https:' || callback.username || callback.password
      || callback.pathname !== '/api/instagram/oauth/callback/' || callback.search || callback.hash
      || url.searchParams.get('redirect_uri') !== callback.href
      || start.origin !== callback.origin || start.pathname !== callback.pathname || start.hash
      || [...start.searchParams.keys()].join(',') !== 'inicio' || !/^[A-Za-z0-9_-]{64}$/.test(start.searchParams.get('inicio') || ''))
      throw new Error('El inicio seguro no corresponde al callback configurado.');
    return start.href;
  },
  async disconnect() { await request('desconectar/', {}); return this.status(); },
  async prepare(file: File, caption: string, key: string) {
    const data = new FormData(); data.append('imagen', file); data.append('descripcion', caption); data.append('clave', key);
    return publication(await request('publicaciones/', data));
  },
  async confirm(id: string) { return publication(await request(`publicaciones/${id}/confirmar/`, {confirmar: true})); },
  async update(id: string) { return publication(await request(`publicaciones/${id}/actualizar/`, {})); },
  async history() {
    const data = await request('publicaciones/') as {resultados?: unknown[]};
    if (!Array.isArray(data?.resultados)) throw new Error('No pudimos confirmar el historial de Instagram.');
    return data.resultados.map(publication);
  },
};
