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
  for (const key of ['terms', 'privacy', 'refund'] as const) {
    if (raw[key] && typeof raw[key] === 'object') {
      const item = raw[key];
      result[key] = {
        title: typeof item.title === 'string' && item.title ? item.title : result[key].title,
        draft: typeof item.draft === 'string' ? item.draft : (typeof item.published === 'string' ? item.published : result[key].draft),
        published: typeof item.published === 'string' ? item.published : result[key].published,
        lastPublished: typeof item.lastPublished === 'string' ? item.lastPublished : result[key].lastPublished,
      };
    }
  }
  return result;
}

export const legalService = {
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
   * Guarda un borrador de una página específica en el backend.
   */
  async saveDraft(tipo: LegalType, draft: string): Promise<Record<LegalType, LegalPage>> {
    const response = await fetch(`${API_BASE}/api/legal/configuracion/`, {
      method: 'PUT',
      headers: getAdminHeaders(),
      body: JSON.stringify({ tipo, draft, accion: 'draft' }),
    });
    const body = await response.json();
    if (!response.ok || body.exito !== true) {
      throw new Error(body.mensaje || 'No se pudo guardar el borrador.');
    }
    return normalizePages(body.data);
  },

  /**
   * Publica los cambios de una página legal específica hacia la tienda online.
   */
  async publish(tipo: LegalType, content: string): Promise<Record<LegalType, LegalPage>> {
    const response = await fetch(`${API_BASE}/api/legal/configuracion/`, {
      method: 'PUT',
      headers: getAdminHeaders(),
      body: JSON.stringify({ tipo, draft: content, published: content, accion: 'publish' }),
    });
    const body = await response.json();
    if (!response.ok || body.exito !== true) {
      throw new Error(body.mensaje || 'No se pudo publicar la página legal.');
    }
    return normalizePages(body.data);
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
