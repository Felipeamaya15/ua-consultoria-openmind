import { API_BASE_URL } from '../../../api';
import { requestJson } from '../../../shared/services/apiRequest';
import { authService } from '../../auth/services/authService';

export interface CampaignForm { nombre: string; asunto: string; cuerpo: string; destinatarios: number[]; producto_id: string }
export interface Campaign {
  id: string; clave: string; revision: number; nombre: string; asunto: string; cuerpo: string; estado: 'borrador';
  producto: { id?: string; nombre?: string; precio?: string; imagen?: string };
  actualizado: string; envio_habilitado: false; aviso_envio: string;
  destinatarios?: { id: number; email: string; elegible: boolean; intentos: number }[]; elegibles?: number; excluidos?: number;
}
export interface CampaignList { resultados: Campaign[]; pagina: number; paginas: number; total: number }
export interface CampaignAudience { resultados: { id: number; email: string }[]; total: number; limite: number; limite_excedido: boolean }
function request(path: string, options: RequestInit = {}) {
  const token = authService.getToken();
  if (!token) throw new Error('Inicia sesión como propietario para preparar campañas.');
  return requestJson(`${API_BASE_URL}/api/tienda/campanas/${path}`, { ...options, cache: 'no-store', headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' } });
}
function read(value: unknown): Campaign {
  const row = value as Campaign;
  if (!row || !/^[0-9a-f-]{36}$/i.test(row.id) || row.estado !== 'borrador' || row.envio_habilitado !== false || !Number.isInteger(row.revision)
    || !['nombre','asunto','cuerpo','clave'].every(key => typeof row[key as keyof Campaign] === 'string') || !row.producto)
    throw new Error('No pudimos confirmar el borrador. Actualiza el historial antes de reintentar.');
  return row;
}
export const campaignService = {
  async list(page = 1, signal?: AbortSignal): Promise<CampaignList> {
    const rows = await request(`?pagina=${page}`, { signal }) as CampaignList;
    if (!rows || !Array.isArray(rows.resultados) || !Number.isInteger(rows.paginas)) throw new Error('No se pudo confirmar el historial de campañas.');
    rows.resultados.forEach(read); return rows;
  },
  async audience(query: string, signal?: AbortSignal): Promise<CampaignAudience> {
    const data = await request(`destinatarios/?q=${encodeURIComponent(query)}`, { signal }) as CampaignAudience;
    if (!data || !Array.isArray(data.resultados) || typeof data.limite_excedido !== 'boolean' || data.resultados.some(row => !Number.isInteger(row.id) || typeof row.email !== 'string')) throw new Error('No se pudo confirmar la lista de contactos autorizados.');
    return data;
  },
  async get(id: string): Promise<Campaign> { return read(await request(`${id}/`)); },
  async save(form: CampaignForm, key: string, current: Campaign | null): Promise<Campaign> {
    return read(await request(current ? `${current.id}/` : '', { method: current ? 'PUT' : 'POST', body: JSON.stringify({ ...form, clave: key, ...(current ? { revision: current.revision } : {}) }) }));
  },
};
