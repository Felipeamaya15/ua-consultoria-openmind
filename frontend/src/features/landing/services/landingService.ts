import { readApiResponse, requestJson } from '../../../shared/services/apiRequest';
import { fetchInitialLoad, type InitialLoadOptions } from '../../../core/http/initialLoad';
import { API_BASE_URL } from '../../../api';
import type { LandingConfig, LandingInput } from '../types/landing.types';

export const LANDING_CONFIG_CHANGED = 'openmind:landing-config-changed';

const endpoint = `${API_BASE_URL}/api/landing/configuracion/`;

function normalizeMediaUrl(value: string | null): string | null {
  if (typeof value !== 'string' || !value) return null;

  // Ya es una URL absoluta o una imagen Base64.
  if (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('data:')
  ) {
    return value;
  }

  // Django devuelve rutas como /media/landing/images/imagen_principal.png.
  if (value.startsWith('/')) {
    return `${API_BASE_URL}${value}`;
  }

  return `${API_BASE_URL}/${value}`;
}

async function readResponse(response: Response): Promise<LandingConfig | null> {
  const data = await readApiResponse(response) as LandingConfig | null;
  return normalizeConfig(data);
}

function normalizeConfig(data: LandingConfig | null): LandingConfig | null {
  if (!data) {
    return null;
  }

  if (typeof data !== 'object' || Array.isArray(data) || typeof data.titulo !== 'string' || typeof data.descripcion !== 'string' || typeof data.texto_boton !== 'string' || !data.secciones || typeof data.secciones !== 'object' || Array.isArray(data.secciones)) throw new Error('No pudimos confirmar el contenido de la página principal. Comprueba si se guardó antes de reintentar.');
  return {
    ...data,
    ...(data.contenido ? { contenido: { ...data.contenido,
      ...(Array.isArray(data.contenido.bloques) ? { bloques: data.contenido.bloques.map((block: import('../types/landing.types').BloqueLanding) => ({...block, imagenes: block.imagenes.map(image => ({...image,src:normalizeMediaUrl(image.src) || ''})), ...(block.componentes ? { componentes: block.componentes.map(element => ({ ...element, ...(element.imagenes ? { imagenes: element.imagenes.map(image => ({ ...image, src: normalizeMediaUrl(image.src) || '' })) } : {}) })) } : {})})) } : {}),
    } } : {}),
    imagen_principal: normalizeMediaUrl(data.imagen_principal),
    logo: normalizeMediaUrl(data.logo),
  };
}

export async function fetchLandingConfig(options?: InitialLoadOptions): Promise<LandingConfig | null> {
  return readResponse(await fetchInitialLoad(endpoint, { ...options, cache: 'no-store' }));
}

export async function fetchPrivateLandingConfig(options?: InitialLoadOptions): Promise<LandingConfig | null> {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (!token) throw new Error('Inicia sesión como propietario para editar el contenido de tu tienda.');
  return readResponse(await fetchInitialLoad(endpoint, { ...options, cache: 'no-store', headers: { Authorization: `Token ${token}` } }));
}

export async function saveLandingConfig(config: LandingInput): Promise<LandingConfig> {
  const token = (localStorage.getItem('token') || sessionStorage.getItem('token'));
  if (!token) throw new Error('Inicia sesión como propietario para guardar la landing.');
  const body = new FormData();
  body.append('titulo', config.titulo);
  body.append('descripcion', config.descripcion);
  body.append('texto_boton', config.texto_boton);
  body.append('secciones', JSON.stringify(config.secciones));
  if (config.contenido !== undefined) body.append('contenido', JSON.stringify(config.contenido));
  for (const field of ['imagen_principal', 'logo'] as const) {
    const image = config[field];
    if (image?.startsWith('data:')) {
      const blob = await (await fetch(image)).blob();
      const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
      const extension = extensions[blob.type];
      if (!extension) throw new Error('La imagen debe ser JPG, PNG o WebP.');
      body.append(field, blob, `${field}.${extension}`);
    } else if (image === null || image === '') body.append(field, '');
    // Omitir una URL existente conserva el archivo almacenado.
  }
  const saved = normalizeConfig(await requestJson(endpoint, {
    method: 'PUT', headers: { Authorization: `Token ${token}` }, body,
  }) as LandingConfig | null);
  if (!saved) throw new Error('El backend no devolvió la configuración guardada.');
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LANDING_CONFIG_CHANGED));
  return saved;
}

/** Appearance writes cannot replace content, and are authorized by the store resolver. */
export async function saveBlockStyles(template: string, styles: import('../../storefront/visual/blockAppearance').BlockStyles): Promise<void> {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (!token) throw new Error('Inicia sesión como propietario para guardar el diseño.');
  await requestJson(`${API_BASE_URL}/api/landing/apariencia/`, {method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Token ${token}`},body:JSON.stringify({plantilla:template,bloques:styles})});
  window.dispatchEvent(new Event(LANDING_CONFIG_CHANGED));
}
