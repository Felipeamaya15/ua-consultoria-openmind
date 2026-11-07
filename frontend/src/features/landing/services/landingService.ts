
import {
  readApiResponse,
  requestJson,
} from '../../../shared/services/apiRequest';

import {
  fetchInitialLoad,
  type InitialLoadOptions,
} from '../../../core/http/initialLoad';

import { API_BASE_URL } from '../../../api';

import type {
  LandingConfig,
  LandingInput,
  BloqueLanding,
} from '../types/landing.types';

export const LANDING_CONFIG_CHANGED =
  'openmind:landing-config-changed';

const endpoint = `${API_BASE_URL}/api/landing/configuracion/`;

/**
 * Convierte las rutas de imágenes de Django
 * en URLs que puedan utilizarse en el frontend.
 */
export function normalizeMediaUrl(
  value: string | null
): string | null {
  if (typeof value !== 'string' || !value) {
    return null;
  }

  // URLs absolutas e imágenes Base64.
  if (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('data:')
  ) {
    return value;
  }

  // Rutas absolutas de Django, como /media/landing/.
  if (value.startsWith('/')) {
    return `${API_BASE_URL}${value}`;
  }

  return `${API_BASE_URL}/${value}`;
}

/**
 * Normaliza la configuración de la página principal,
 * incluyendo las fotografías del carrusel.
 */
function normalizeConfig(
  data: LandingConfig | null
): LandingConfig | null {
  if (!data) {
    return null;
  }

  if (
    typeof data !== 'object' ||
    Array.isArray(data) ||
    typeof data.titulo !== 'string' ||
    typeof data.descripcion !== 'string' ||
    typeof data.texto_boton !== 'string' ||
    !data.secciones ||
    typeof data.secciones !== 'object' ||
    Array.isArray(data.secciones)
  ) {
    throw new Error(
      'No pudimos confirmar el contenido de la página principal. ' +
      'Comprueba si se guardó antes de reintentar.'
    );
  }

  return {
    ...data,

    // Mantener la normalización de bloques existentes.
    ...(data.contenido
      ? {
          contenido: {
            ...data.contenido,

            ...(Array.isArray(data.contenido.bloques)
              ? {
                  bloques: data.contenido.bloques.map(
                    (block: BloqueLanding) => ({
                      ...block,

                      imagenes: block.imagenes.map(image => ({
                        ...image,
                        src: normalizeMediaUrl(image.src) || '',
                      })),

                      ...(block.componentes
                        ? {
                            componentes: block.componentes.map(
                              element => ({
                                ...element,

                                ...(element.imagenes
                                  ? {
                                      imagenes: element.imagenes.map(
                                        image => ({
                                          ...image,
                                          src:
                                            normalizeMediaUrl(
                                              image.src
                                            ) || '',
                                        })
                                      ),
                                    }
                                  : {}),
                              })
                            ),
                          }
                        : {}),
                    })
                  ),
                }
              : {}),
          },
        }
      : {}),

    // Imagen principal antigua: compatibilidad.
    imagen_principal: normalizeMediaUrl(
      data.imagen_principal
    ),

    // Nuevo carrusel de fotografías.
    imagenes_carrusel: Array.isArray(
      data.imagenes_carrusel
    )
      ? data.imagenes_carrusel
          .map(imagen => ({
            ...imagen,
            archivo: normalizeMediaUrl(imagen.archivo) || '',
          }))
          .sort((a, b) => a.orden - b.orden)
      : [],

    // Logo de la tienda.
    logo: normalizeMediaUrl(data.logo),
  };
}

/**
 * Lee y valida la respuesta del backend.
 */
async function readResponse(
  response: Response
): Promise<LandingConfig | null> {
  const data = (await readApiResponse(response)) as
    | LandingConfig
    | null;

  return normalizeConfig(data);
}

/**
 * Obtiene la configuración pública de la tienda.
 */
export async function fetchLandingConfig(
  options?: InitialLoadOptions
): Promise<LandingConfig | null> {
  return readResponse(
    await fetchInitialLoad(endpoint, {
      ...options,
      cache: 'no-store',
    })
  );
}

/**
 * Obtiene la configuración para el propietario.
 */
export async function fetchPrivateLandingConfig(
  options?: InitialLoadOptions
): Promise<LandingConfig | null> {
  const token =
    localStorage.getItem('token') ||
    sessionStorage.getItem('token');

  if (!token) {
    throw new Error(
      'Inicia sesión como propietario para editar el contenido de tu tienda.'
    );
  }

  return readResponse(
    await fetchInitialLoad(endpoint, {
      ...options,
      cache: 'no-store',
      headers: {
        Authorization: `Token ${token}`,
      },
    })
  );
}

/**
 * Guarda el contenido de la página principal.
 *
 * El carrusel se administra mediante endpoints
 * independientes. No se incluye en este guardado.
 */
export async function saveLandingConfig(
  config: LandingInput
): Promise<LandingConfig> {
  const token =
    localStorage.getItem('token') ||
    sessionStorage.getItem('token');

  if (!token) {
    throw new Error(
      'Inicia sesión como propietario para guardar la landing.'
    );
  }

  const body = new FormData();

  body.append('titulo', config.titulo);
  body.append('descripcion', config.descripcion);
  body.append('texto_boton', config.texto_boton);

  body.append(
    'secciones',
    JSON.stringify(config.secciones)
  );

  if (config.contenido !== undefined) {
    body.append(
      'contenido',
      JSON.stringify(config.contenido)
    );
  }

  // Mantener el comportamiento anterior para
  // la imagen principal y el logo.
  for (const field of [
    'imagen_principal',
    'logo',
  ] as const) {
    const image = config[field];

    if (image?.startsWith('data:')) {
      const blob = await (
        await fetch(image)
      ).blob();

      const extensions: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
      };

      const extension = extensions[blob.type];

      if (!extension) {
        throw new Error(
          'La imagen debe ser JPG, PNG o WebP.'
        );
      }

      body.append(
        field,
        blob,
        `${field}.${extension}`
      );
    } else if (image === null || image === '') {
      body.append(field, '');
    }

    // Si existe una URL, no se vuelve a subir.
    // Django conserva el archivo almacenado.
  }

  const saved = normalizeConfig(
    (await requestJson(endpoint, {
      method: 'PUT',
      headers: {
        Authorization: `Token ${token}`,
      },
      body,
    })) as LandingConfig | null
  );

  if (!saved) {
    throw new Error(
      'El backend no devolvió la configuración guardada.'
    );
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new Event(LANDING_CONFIG_CHANGED)
    );
  }

  return saved;
}

/**
 * Guarda los estilos visuales de los bloques.
 * No reemplaza el contenido de la página principal.
 */
export async function saveBlockStyles(
  template: string,
  styles: import(
    '../../storefront/visual/blockAppearance'
  ).BlockStyles
): Promise<void> {
  const token =
    localStorage.getItem('token') ||
    sessionStorage.getItem('token');

  if (!token) {
    throw new Error(
      'Inicia sesión como propietario para guardar el diseño.'
    );
  }

  await requestJson(
    `${API_BASE_URL}/api/landing/apariencia/`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${token}`,
      },
      body: JSON.stringify({
        plantilla: template,
        bloques: styles,
      }),
    }
  );

  window.dispatchEvent(
    new Event(LANDING_CONFIG_CHANGED)
  );
}
