import { API_BASE_URL } from '../../../api';
import { requestJson } from '../../../shared/services/apiRequest';
import { authService } from '../../auth/services/authService';

export interface CampaignContentSelection { kind: 'product' | 'section'; id: string; skus: string[]; images: number[] }
export interface CampaignDesign { imagen?: string; boton_texto?: string; boton_url?: string; recurso_id?: string; plantilla?: string }
export interface CampaignForm { nombre: string; asunto: string; cuerpo: string; destinatarios: number[]; producto_id: string; contenido?: CampaignContentSelection | null; diseno?: CampaignDesign }
export interface Campaign {
  id: string; clave: string; revision: number; nombre: string; asunto: string; cuerpo: string;
  estado: 'borrador' | 'pendiente' | 'procesando' | 'aceptada' | 'parcial' | 'fallida' | 'cancelada';
  producto: { id?: string; nombre?: string; precio?: string; imagen?: string; tipo?: string; seleccion?: CampaignContentSelection; imagenes?: string[] };
  actualizado: string; envio_habilitado: boolean; aviso_envio: string; diseno?: CampaignDesign;
  resultados?: Record<string, number>;
  destinatarios?: { id: number; email: string; elegible: boolean; intentos: number; estado?: string; ultimo_error?: string; finalizado?: string | null }[]; elegibles?: number; excluidos?: number;
}
export interface CampaignList { resultados: Campaign[]; pagina: number; paginas: number; total: number }
export interface CampaignAudience { resultados: { id: number; email: string }[]; total: number; limite: number; limite_excedido: boolean }
export interface CampaignHistory { total: number; pagina: number; paginas: number; resultados: { destinatario: string; estado: string; codigo: string; categoria: string; proveedor: string; creado: string; finalizado: string | null }[] }
function request(path: string, options: RequestInit = {}) {
  const token = authService.getToken();
  if (!token) throw new Error('Inicia sesión como propietario para preparar campañas.');
  return requestJson(`${API_BASE_URL}/api/tienda/campanas/${path}`, { ...options, cache: 'no-store', headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' } }, undefined, 30000);
}
function read(value: unknown): Campaign {
  const row = value as Campaign;
  if (!row || !/^[0-9a-f-]{36}$/i.test(row.id) || !['borrador','pendiente','procesando','aceptada','parcial','fallida','cancelada'].includes(row.estado) || typeof row.envio_habilitado !== 'boolean' || !Number.isInteger(row.revision)
    || !['nombre','asunto','cuerpo','clave'].every(key => typeof row[key as keyof Campaign] === 'string') || !row.producto)
    throw new Error('No pudimos confirmar el borrador. Actualiza el historial antes de reintentar.');
  return row;
}
export const campaignService = {
  async history(id: string, page = 1): Promise<CampaignHistory> {
    const data = await request(`${id}/historial/?pagina=${page}`) as CampaignHistory;
    if (!data || !Array.isArray(data.resultados) || !Number.isInteger(data.paginas)) throw new Error('No se pudo confirmar el registro de envíos.');
    return data;
  },
  async preview(id: string): Promise<{html: string; campana: Campaign}> {
    const result = await request(`${id}/vista-previa/`) as unknown as { html: string; campana: Campaign };
    if (typeof result?.html !== 'string') throw new Error('No se pudo confirmar la vista previa.');
    read(result.campana); return result;
  },
  async action(row: Campaign, action: 'enviar' | 'procesar' | 'reintentar' | 'cancelar'): Promise<Campaign> {
    const body = action === 'enviar' || action === 'reintentar' ? { revision: row.revision, confirmar: true } : {};
    return read(await request(`${row.id}/${action}/`, { method: 'POST', body: JSON.stringify(body) }));
  },
  async test(id: string, key: string): Promise<{estado: string; codigo: string}> {
    const data = await request(`${id}/prueba/`, { method: 'POST', body: JSON.stringify({clave: key}) }) as {estado?: unknown; codigo?: unknown} | null;
    if (!data || typeof data.estado !== 'string') throw new Error('No se confirmó el envío de prueba. Revisa el historial.');
    return data as {estado: string; codigo: string};
  },
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
