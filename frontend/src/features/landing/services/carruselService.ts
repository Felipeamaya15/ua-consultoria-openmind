
import { API_BASE_URL } from '../../../api';
import { requestJson } from '../../../shared/services/apiRequest';
import {
  IMAGE_FORMATS,
  prepareImage,
} from '../../../shared/services/imageUpload';
import {
  LANDING_CONFIG_CHANGED,
  normalizeMediaUrl,
} from './landingService';

import type {
  ImagenCarruselLanding,
} from '../types/landing.types';

const ENDPOINT = `${API_BASE_URL}/api/landing/carrusel/`;

export const MAX_IMAGENES_CARRUSEL = 8;
export const MAX_MB_CARRUSEL = 2;

export type CarouselTextMode = 'unico' | 'por_imagen';

export async function fetchCarouselTextMode(): Promise<CarouselTextMode> {
  const response = await requestJson(`${ENDPOINT}modo-texto/`, {
    method: 'GET', headers: authHeaders(), cache: 'no-store',
  }) as { modo?: string };
  if (response?.modo !== 'unico' && response?.modo !== 'por_imagen') {
    throw new Error('No pudimos confirmar el modo de texto de la portada.');
  }
  return response.modo;
}

export async function saveCarouselTextMode(modo: CarouselTextMode): Promise<CarouselTextMode> {
  const response = await requestJson(`${ENDPOINT}modo-texto/`, {
    method: 'PATCH',
    headers: {...authHeaders(), 'Content-Type': 'application/json'},
    body: JSON.stringify({ modo }),
  }) as { modo?: string };
  if (response?.modo !== modo) throw new Error('No pudimos confirmar el modo guardado.');
  notifyCarouselChanged();
  return modo;
}

const MAX_TEXTO_ALTERNATIVO = 250;

function authHeaders(): Record<string, string> {
  const token =
    localStorage.getItem('token') ||
    sessionStorage.getItem('token');

  if (!token) {
    throw new Error(
      'Inicia sesión como propietario para administrar las imágenes.'
    );
  }

  return {
    Authorization: `Token ${token}`,
  };
}

function normalizeImage(
  image: ImagenCarruselLanding
): ImagenCarruselLanding {
  return {
    ...image,
    archivo: normalizeMediaUrl(image.archivo) || '',
  };
}

function notifyCarouselChanged(): void {
  window.dispatchEvent(new Event(LANDING_CONFIG_CHANGED));
}


export async function fetchCarouselImages(): Promise<
  ImagenCarruselLanding[]
> {
  const response = await requestJson(ENDPOINT, {
    method: 'GET',
    headers: authHeaders(),
    cache: 'no-store',
  });

  if (!Array.isArray(response)) {
    throw new Error(
      'No pudimos obtener las imágenes del carrusel.'
    );
  }

  return (response as ImagenCarruselLanding[])
    .map(normalizeImage)
    .sort((a, b) => a.orden - b.orden);
}


export async function uploadCarouselImage(
  file: File,
  alternativeText = ''
): Promise<ImagenCarruselLanding> {
  const maxBytes = MAX_MB_CARRUSEL * 1024 * 1024;
  const text = alternativeText.trim();

  if (!/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    throw new Error(
      `Selecciona una imagen ${IMAGE_FORMATS}.`
    );
  }

  if (file.size > maxBytes) {
    throw new Error(
      `La fotografía supera el máximo de ${MAX_MB_CARRUSEL} MB.`
    );
  }

  if (text.length > MAX_TEXTO_ALTERNATIVO) {
    throw new Error(
      'La descripción no puede superar los 250 caracteres.'
    );
  }

  let uploadFile = file;

  const isHeicOrHeif = /\.(heic|heif)$/i.test(file.name);

  if (isHeicOrHeif) {


    const processedDataUrl = await prepareImage(
      file,
      MAX_MB_CARRUSEL
    );

    const processedBlob = await (
      await fetch(processedDataUrl)
    ).blob();

    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };

    const extension = extensions[processedBlob.type];

    if (!extension) {
      throw new Error(
        'No pudimos convertir la fotografía del iPhone.'
      );
    }

    uploadFile = new File(
      [processedBlob],
      `portada.${extension}`,
      { type: processedBlob.type }
    );
  }


  if (uploadFile.size > maxBytes) {
    throw new Error(
      'La fotografía procesada supera los 2 MB.'
    );
  }

  const body = new FormData();

  body.append('archivo', uploadFile);
  body.append('texto_alternativo', text);


  const response = await requestJson(ENDPOINT, {
    method: 'POST',
    headers: authHeaders(),
    body,
  }) as ImagenCarruselLanding;

  if (!response || typeof response.id !== 'string') {
    throw new Error(
      'No pudimos confirmar que la fotografía fue guardada.'
    );
  }

  notifyCarouselChanged();

  return normalizeImage(response);
}


export async function reorderCarouselImages(
  ids: string[]
): Promise<ImagenCarruselLanding[]> {
  if (
    ids.length === 0 ||
    ids.length > MAX_IMAGENES_CARRUSEL ||
    new Set(ids).size !== ids.length
  ) {
    throw new Error(
      'El orden de las fotografías no es válido.'
    );
  }

  const response = await requestJson(
    `${ENDPOINT}orden/`,
    {
      method: 'PATCH',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids }),
    }
  );

  if (!Array.isArray(response)) {
    throw new Error(
      'No pudimos confirmar el nuevo orden.'
    );
  }

  notifyCarouselChanged();

  return (response as ImagenCarruselLanding[])
    .map(normalizeImage)
    .sort((a, b) => a.orden - b.orden);
}


export async function deleteCarouselImage(
  id: string
): Promise<void> {
  await requestJson(
    `${ENDPOINT}${encodeURIComponent(id)}/`,
    {
      method: 'DELETE',
      headers: authHeaders(),
    }
  );

  notifyCarouselChanged();
}


export async function saveCarouselContent(id: string, contenido: import('../types/landing.types').CarouselSlideContent): Promise<ImagenCarruselLanding> {
  const saved = await requestJson(`${ENDPOINT}${encodeURIComponent(id)}/`, {method:'PATCH',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({contenido})});
  if (!saved || typeof saved !== 'object' || (saved as ImagenCarruselLanding).id !== id) throw new Error('No pudimos confirmar el contenido guardado.');
  notifyCarouselChanged(); return normalizeImage(saved as ImagenCarruselLanding);
}
export async function addCarouselResource(recurso_id: string): Promise<ImagenCarruselLanding> {
  const saved = await requestJson(ENDPOINT,{method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:JSON.stringify({recurso_id})});
  if (!saved || typeof saved !== 'object' || typeof (saved as ImagenCarruselLanding).id !== 'string') throw new Error('No pudimos confirmar el recurso agregado.');
  notifyCarouselChanged(); return normalizeImage(saved as ImagenCarruselLanding);
}
