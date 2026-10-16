import { API_BASE_URL } from '../../../api';
import { fetchInitialLoad, type InitialLoadOptions } from '../../../core/http/initialLoad';
import { authService } from '../../auth/services/authService';
import {
  defaultLegalPages,
  type LegalType,
  type LegalPage,
} from '../data/legalContent';

const API_BASE = (API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');

function getAdminHeaders(): Record<string, string> {
  const token = authService.getToken() || localStorage.getItem('token') || sessionStorage.getItem('token');
  if (!token) throw new Error('Inicia sesión como propietario para administrar las páginas legales.');
  return {
    Authorization: `Token ${token}`,
    'Content-Type': 'application/json',
  };
}

function normalizePages(data: unknown): Record<LegalType, LegalPage> {
  const result: Record<LegalType, LegalPage> = structuredClone(defaultLegalPages);
  if (!data || typeof data !== 'object') return result;

  const raw = data as Record<string, any>;
  for (const key of ['terms', 'privacy', 'refund', 'cookies'] as const) {
    if (raw[key] && typeof raw[key] === 'object') {
      const item = raw[key];
      result[key] = {
        title: typeof item.title === 'string' && item.title ? item.title : result[key].title,
        draft: typeof item.draft === 'string' ? item.draft : (typeof item.published === 'string' ? item.published : result[key].draft),
        published: typeof item.published === 'string' ? item.published : result[key].published,
        lastPublished: typeof item.lastPublished === 'string' ? item.lastPublished : result[key].lastPublished,
        version: typeof item.version === 'number' ? item.version : 1,
        fecha_vigencia: typeof item.fecha_vigencia === 'string' ? item.fecha_vigencia : (typeof item.lastPublished === 'string' ? item.lastPublished : null),
        vigente: item.vigente !== false,
        estado: typeof item.estado === 'string' ? item.estado : 'vigente',
        banner: item.banner && typeof item.banner === 'object' ? {
          title: typeof item.banner.title === 'string' ? item.banner.title : (result[key].banner?.title || 'Aviso de Cookies'),
          message: typeof item.banner.message === 'string' ? item.banner.message : (result[key].banner?.message || ''),
          acceptText: typeof item.banner.acceptText === 'string' ? item.banner.acceptText : (result[key].banner?.acceptText || 'Aceptar cookies'),
          declineText: typeof item.banner.declineText === 'string' ? item.banner.declineText : (result[key].banner?.declineText || 'Solo necesarias'),
          enabled: typeof item.banner.enabled === 'boolean' ? item.banner.enabled : (result[key].banner?.enabled ?? true),
        } : result[key].banner,
      };
    }
  }
  return result;
}

export const legalService = {
  /**
   * Implementa la consulta de la versión vigente de las páginas legales en el e-commerce.
   * Si se especifica `tipo`, retorna la versión vigente de dicha política (por ej. 'terms', 'privacy').
   * Si no se especifica, retorna el conjunto completo de políticas vigentes.
   */
  async fetchVersionVigente(tipo?: string, signal?: AbortSignal): Promise<LegalPage | Record<LegalType, LegalPage>> {
    try {
      const url = tipo
        ? `${API_BASE}/api/legal/vigente/${encodeURIComponent(tipo)}/`
        : `${API_BASE}/api/legal/vigente/`;
      const response = await fetch(url, { signal });
      const body = await response.json();
      if (!response.ok || body.exito !== true) {
        throw new Error(body.mensaje || 'No se pudo consultar la versión vigente.');
      }
      if (tipo) {
        const item = body.data;
        return {
          title: item.title || '',
          draft: item.draft || item.published || item.content || '',
          published: item.published || item.content || '',
          lastPublished: item.lastPublished || item.fecha_vigencia || null,
          version: typeof item.version === 'number' ? item.version : 1,
          fecha_vigencia: item.fecha_vigencia || item.lastPublished || null,
          vigente: item.vigente !== false,
          estado: item.estado || 'vigente',
          banner: item.banner,
        };
      }
      return normalizePages(body.data);
    } catch (error) {
      console.warn('Fallback local al consultar versión vigente:', error);
      if (tipo) {
        const canonical = (tipo.toLowerCase() as LegalType) in defaultLegalPages ? (tipo.toLowerCase() as LegalType) : 'terms';
        return defaultLegalPages[canonical];
      }
      return structuredClone(defaultLegalPages);
    }
  },

  /**
   * Consulta pública de las páginas legales vigentes para compradores y visitantes.
   */
  async fetchPublicLegalPages(options?: InitialLoadOptions): Promise<Record<LegalType, LegalPage>> {
    try {
      const response = await fetchInitialLoad(`${API_BASE}/api/legal/`, options);
      const body = await response.json();
      if (!response.ok || body.exito !== true) {
        throw new Error(body.mensaje || 'No se pudieron consultar las páginas legales.');
      }
      return normalizePages(body.data);
    } catch (error) {
      console.warn('Uso de páginas legales por defecto debido a error de conexión:', error);
      return structuredClone(defaultLegalPages);
    }
  },

  /**
   * Consulta pública de una página legal específica (terms, privacy, refund, o alias en español).
   */
  async fetchPublicLegalPage(tipo: string, signal?: AbortSignal): Promise<LegalPage> {
    const response = await fetch(`${API_BASE}/api/legal/${encodeURIComponent(tipo)}/`, { signal });
    const body = await response.json();
    if (!response.ok || body.exito !== true) {
      throw new Error(body.mensaje || 'Página legal no encontrada.');
    }
    const data = body.data;
    return {
      title: data.title || '',
      draft: data.draft || data.published || '',
      published: data.published || '',
      lastPublished: data.lastPublished || null,
      version: typeof data.version === 'number' ? data.version : 1,
      fecha_vigencia: data.fecha_vigencia || data.lastPublished || null,
      vigente: data.vigente !== false,
      estado: data.estado || 'vigente',
    };
  },

  /**
   * Consulta protegida para el panel de administración del emprendedor.
   */
  async fetchAdminLegalPages(signal?: AbortSignal): Promise<Record<LegalType, LegalPage>> {
    const response = await fetch(`${API_BASE}/api/legal/configuracion/`, {
      headers: getAdminHeaders(),
      signal,
    });
    const body = await response.json();
    if (!response.ok || body.exito !== true) {
      const details = body.error?.detalles;
      throw new Error((body.mensaje || 'No se pudo consultar la configuración legal.') + (details ? ` ${JSON.stringify(details)}` : ''));
    }
    return normalizePages(body.data);
  },

  /**
   * Implementa la creación de contenido legal en el backend (POST /api/legal/configuracion/).
   */
  async createLegalContent(
    payload: { tipo?: LegalType; title?: string; draft?: string; published?: string } | Record<LegalType, Partial<LegalPage>>
  ): Promise<Record<LegalType, LegalPage>> {
    const response = await fetch(`${API_BASE}/api/legal/configuracion/`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok || body.exito !== true) {
      const details = body.error?.detalles;
      throw new Error((body.mensaje || 'No se pudo crear el contenido legal.') + (details ? ` ${JSON.stringify(details)}` : ''));
    }
    return normalizePages(body.data);
  },

  /**
   * Implementa la actualización del contenido legal (borrador, título y configuración adicional) (PUT /api/legal/configuracion/).
   */
  async updateLegalContent(
    tipo: LegalType,
    draft: string,
    title?: string,
    extra?: Record<string, unknown>
  ): Promise<Record<LegalType, LegalPage>> {
    const payload: Record<string, unknown> = { tipo, draft, accion: 'draft', ...extra };
    if (title) payload.title = title;
    const response = await fetch(`${API_BASE}/api/legal/configuracion/`, {
      method: 'PUT',
      headers: getAdminHeaders(),
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok || body.exito !== true) {
      const details = body.error?.detalles;
      throw new Error((body.mensaje || 'No se pudo actualizar el contenido legal.') + (details ? ` ${JSON.stringify(details)}` : ''));
    }
    return normalizePages(body.data);
  },

  /**
   * Implementa la publicación de contenido legal en la tienda (POST /api/legal/configuracion/publicar/).
   */
  async publishLegalContent(tipo: LegalType, content?: string): Promise<Record<LegalType, LegalPage>> {
    const response = await fetch(`${API_BASE}/api/legal/configuracion/publicar/`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ tipo, content }),
    });
    const body = await response.json();
    if (!response.ok || body.exito !== true) {
      const details = body.error?.detalles;
      throw new Error((body.mensaje || 'No se pudo publicar el contenido legal.') + (details ? ` ${JSON.stringify(details)}` : ''));
    }
    return normalizePages(body.data);
  },

  /**
   * Guarda un borrador de una página específica en el backend.
   */
  async saveDraft(
    tipo: LegalType,
    draft: string,
    title?: string,
    extra?: Record<string, unknown>
  ): Promise<Record<LegalType, LegalPage>> {
    return this.updateLegalContent(tipo, draft, title, extra);
  },

  /**
   * Publica los cambios de una página legal específica hacia la tienda online.
   */
  async publish(tipo: LegalType, content: string): Promise<Record<LegalType, LegalPage>> {
    return this.publishLegalContent(tipo, content);
  },

  /**
   * Restaura la plantilla base de una página legal en el borrador.
   */
  async restore(tipo: LegalType): Promise<Record<LegalType, LegalPage>> {
    const response = await fetch(`${API_BASE}/api/legal/configuracion/`, {
      method: 'PUT',
      headers: getAdminHeaders(),
      body: JSON.stringify({ tipo, accion: 'restore' }),
    });
    const body = await response.json();
    if (!response.ok || body.exito !== true) {
      throw new Error(body.mensaje || 'No se pudo restaurar la plantilla.');
    }
    return normalizePages(body.data);
  },

  /**
   * Guarda el conjunto completo de páginas legales.
   */
  async saveAll(pages: Record<LegalType, LegalPage>): Promise<Record<LegalType, LegalPage>> {
    const response = await fetch(`${API_BASE}/api/legal/configuracion/`, {
      method: 'PUT',
      headers: getAdminHeaders(),
      body: JSON.stringify(pages),
    });
    const body = await response.json();
    if (!response.ok || body.exito !== true) {
      throw new Error(body.mensaje || 'No se pudo guardar la configuración legal.');
    }
    return normalizePages(body.data);
  },
};
