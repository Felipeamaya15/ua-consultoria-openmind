import { API_BASE_URL } from '../../../api';
import { authService } from '../../auth/services/authService';
import { defaultLegalPages, type LegalType, type LegalPage } from '../data/legalContent';
import type { InitialLoadOptions } from '../../../core/http/initialLoad';

type Pages = Record<LegalType, LegalPage>;
const API_BASE = API_BASE_URL.replace(/\/+$/, '');
function normalizePages(data: unknown): Pages {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('La respuesta legal no es válida.');
  const raw = data as Record<string, any>;
  const pages = structuredClone(defaultLegalPages);
  for (const key of ['terms', 'privacy', 'refund', 'cookies'] as const) {
    const item = raw[key];
    if (!item || typeof item !== 'object' || typeof item.published !== 'string' || !Number.isSafeInteger(item.version) || item.version < 1) throw new Error('La versión legal recibida no es válida.');
    pages[key] = { ...pages[key], ...item, draft: typeof item.draft === 'string' ? item.draft : item.published,
      historial: Array.isArray(item.historial) ? item.historial.filter((entry: any) => entry && Number.isSafeInteger(entry.version) && typeof entry.content === 'string' && typeof entry.fecha_vigencia === 'string') : [] };
  }
  return pages;
}
async function request(path: string, method = 'GET', data?: unknown, admin = false, signal?: AbortSignal) {
  const token = admin ? authService.getToken() : null;
  if (admin && !token) throw new Error('Inicia sesión como propietario para administrar las páginas legales.');
  const response = await fetch(`${API_BASE}/api/legal/${path}`, { method, signal, cache: 'no-store',
    headers: { ...(token ? { Authorization: `Token ${token}` } : {}), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const body = await response.json().catch(() => null);
  if (admin && token !== authService.getToken()) throw new DOMException('La sesión cambió.', 'AbortError');
  if (!response.ok || body?.exito !== true) throw new Error(response.status === 403 ? 'No tienes permiso para administrar esta tienda.' : response.status >= 500 ? 'No pudimos guardar en el servidor. Conservamos tu edición; intenta nuevamente.' : body?.mensaje || 'No pudimos completar la solicitud legal.');
  return body.data;
}
export const legalService = {
  async fetchPublicLegalPages(options?: InitialLoadOptions): Promise<Pages> { return normalizePages(await request('', 'GET', undefined, false, options?.signal)); },
  async fetchPublicLegalPage(tipo: string, signal?: AbortSignal): Promise<LegalPage> { return request(`${encodeURIComponent(tipo)}/`, 'GET', undefined, false, signal); },
  async fetchVersionVigente(tipo?: string, signal?: AbortSignal): Promise<LegalPage | Pages> { const data = await request(`vigente/${tipo ? encodeURIComponent(tipo) + '/' : ''}`, 'GET', undefined, false, signal); return tipo ? data : normalizePages(data); },
  async fetchAdminLegalPages(signal?: AbortSignal): Promise<Pages> { return normalizePages(await request('configuracion/', 'GET', undefined, true, signal)); },
  async createLegalContent(payload: unknown): Promise<Pages> { return normalizePages(await request('configuracion/', 'POST', payload, true)); },
  async updateLegalContent(tipo: LegalType, draft: string, title?: string, extra?: Record<string, unknown>, signal?: AbortSignal): Promise<Pages> { return normalizePages(await request('configuracion/', 'PUT', { tipo, draft, ...(title ? { title } : {}), ...extra, accion: 'draft' }, true, signal)); },
  async publishLegalContent(tipo: LegalType, content?: string, signal?: AbortSignal): Promise<Pages> { return normalizePages(await request('configuracion/publicar/', 'POST', { tipo, content }, true, signal)); },
  async saveDraft(tipo: LegalType, draft: string, title?: string, extra?: Record<string, unknown>, signal?: AbortSignal): Promise<Pages> { return this.updateLegalContent(tipo, draft, title, extra, signal); },
  async publish(tipo: LegalType, content: string, signal?: AbortSignal): Promise<Pages> { return this.publishLegalContent(tipo, content, signal); },
  async restore(tipo: LegalType, signal?: AbortSignal): Promise<Pages> { return normalizePages(await request('configuracion/', 'PUT', { tipo, accion: 'restore' }, true, signal)); },
  async saveAll(pages: Pages): Promise<Pages> { return normalizePages(await request('configuracion/', 'PUT', pages, true)); },
};
