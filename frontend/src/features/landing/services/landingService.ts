import { fetchInitialLoad, type InitialLoadOptions } from '../../../core/http/initialLoad';
import { API_BASE_URL } from '../../../api';
import type { LandingConfig, LandingInput } from '../types/landing.types';

export const LANDING_CONFIG_CHANGED = 'openmind:landing-config-changed';

const endpoint = `${API_BASE_URL}/api/landing/configuracion/`;

function normalizeMediaUrl(value: string | null): string | null {
  if (!value) return null;

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
  const body = await response.json();

  if (!response.ok || body.exito !== true) {
    const details = body.error?.detalles;

    throw new Error(
      `${body.mensaje || 'No se pudo consultar o guardar la landing.'}${
        details ? `: ${JSON.stringify(details)}` : ''
      }`
    );
  }

  if (!body.data) {
    return null;
  }

  return {
    ...body.data,
    ...(body.data.contenido ? { contenido: { ...body.data.contenido,
      ...(Array.isArray(body.data.contenido.bloques) ? { bloques: body.data.contenido.bloques.map((block: import('../types/landing.types').BloqueLanding) => ({...block, imagenes: block.imagenes.map(image => ({...image,src:normalizeMediaUrl(image.src) || ''}))})) } : {}),
    } } : {}),
    imagen_principal: normalizeMediaUrl(body.data.imagen_principal),
    logo: normalizeMediaUrl(body.data.logo),
  };
}

export async function fetchLandingConfig(options?: InitialLoadOptions): Promise<LandingConfig | null> {
  return readResponse(await fetchInitialLoad(endpoint, options));
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
  const saved = await readResponse(await fetch(endpoint, {
    method: 'PUT', headers: { Authorization: `Token ${token}` }, body,
  }));
  if (!saved) throw new Error('El backend no devolvió la configuración guardada.');
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LANDING_CONFIG_CHANGED));
  return saved;
}

/** Appearance writes cannot replace content, and are authorized by the store resolver. */
export async function saveBlockStyles(template: string, styles: import('../../storefront/visual/blockAppearance').BlockStyles): Promise<void> {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (!token) throw new Error('Inicia sesión como propietario para guardar el diseño.');
  const response = await fetch(`${API_BASE_URL}/api/landing/apariencia/`, {method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Token ${token}`},body:JSON.stringify({plantilla:template,bloques:styles})});
  const body = await response.json();
  if (!response.ok || !body.exito) throw new Error(body.mensaje || 'No se pudo publicar la apariencia de las secciones.');
  window.dispatchEvent(new Event(LANDING_CONFIG_CHANGED));
}
