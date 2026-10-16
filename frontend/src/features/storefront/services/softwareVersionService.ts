import { API_BASE_URL } from '../../../api';

export interface SoftwareVersionDetails {
  backend?: string;
  arquitectura?: string;
  compatibilidad?: string;
  soporte?: string;
  institucion?: string;
}

export interface SoftwareVersionInfo {
  sistema: string;
  nombre: string;
  version: string;
  version_vigente: string;
  fecha_vigencia: string;
  fecha_lanzamiento: string;
  estado: string;
  vigente: boolean;
  plataforma: string;
  ambiente: string;
  api_version: string;
  detalles?: SoftwareVersionDetails;
}

export const defaultSoftwareVersion: SoftwareVersionInfo = {
  sistema: 'OpenMind E-Commerce',
  nombre: 'OpenMind E-Commerce',
  version: '1.0.0',
  version_vigente: '1.0.0',
  fecha_vigencia: '2026-10-16',
  fecha_lanzamiento: '2026-10-16',
  estado: 'vigente',
  vigente: true,
  plataforma: 'Universidad Autónoma de Chile',
  ambiente: 'production',
  api_version: 'v1',
  detalles: {
    backend: 'Django 5.2',
    compatibilidad: '1.0.0',
    soporte: 'soporte@uautonoma.cl',
    institucion: 'Universidad Autónoma de Chile',
  },
};

const API_BASE = (API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');

let cachedVersion: SoftwareVersionInfo | null = null;

export const softwareVersionService = {
  /**
   * Implementa la consulta de la versión vigente del software de la plataforma.
   */
  async getSoftwareVersion(signal?: AbortSignal): Promise<SoftwareVersionInfo> {
    if (cachedVersion) {
      return cachedVersion;
    }

    try {
      const response = await fetch(`${API_BASE}/api/software/version-vigente/`, { signal });
      const body = await response.json();
      if (!response.ok || body.exito !== true || !body.data) {
        throw new Error(body.mensaje || 'No se pudo consultar la versión vigente del software.');
      }
      const data = body.data;
      cachedVersion = {
        sistema: data.sistema || defaultSoftwareVersion.sistema,
        nombre: data.nombre || defaultSoftwareVersion.nombre,
        version: data.version || defaultSoftwareVersion.version,
        version_vigente: data.version_vigente || defaultSoftwareVersion.version_vigente,
        fecha_vigencia: data.fecha_vigencia || defaultSoftwareVersion.fecha_vigencia,
        fecha_lanzamiento: data.fecha_lanzamiento || defaultSoftwareVersion.fecha_lanzamiento,
        estado: data.estado || defaultSoftwareVersion.estado,
        vigente: data.vigente !== false,
        plataforma: data.plataforma || defaultSoftwareVersion.plataforma,
        ambiente: data.ambiente || defaultSoftwareVersion.ambiente,
        api_version: data.api_version || defaultSoftwareVersion.api_version,
        detalles: data.detalles || defaultSoftwareVersion.detalles,
      };
      return cachedVersion;
    } catch (error) {
      console.warn('Uso de versión local por defecto debido a indisponibilidad de red:', error);
      return defaultSoftwareVersion;
    }
  },

  /**
   * Limpia la caché en memoria para forzar una consulta fresca de la versión vigente del software.
   */
  clearCache(): void {
    cachedVersion = null;
  },
};
