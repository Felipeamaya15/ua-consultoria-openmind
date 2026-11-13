
export const MEDIA_TYPES = {
  imagen: 'Imagen',
  video: 'Video del dispositivo',
  youtube: 'Video de YouTube',
  instagram: 'Publicación de Instagram',
  facebook: 'Publicación de Facebook',
  enlace: 'Enlace externo'
} as const;

export type MediaKind = keyof typeof MEDIA_TYPES;

export interface MediaResource {
  id: string;
  titulo: string;
  descripcion: string;
  tipo: MediaKind;
  url: string;
  activo: boolean;
  archivo: {
    id: string;
    mime: string;
    tamano: number;
    ancho: number;
    alto: number;
  } | null;
  creado: string;
  actualizado: string;
}

export interface MediaPage {
  resultados: MediaResource[];
  total: number;
  pagina: number;
  por_pagina: number;
}

export interface MediaDraft {
  titulo: string;
  descripcion: string;
  tipo: MediaKind;
  url: string;
  activo: boolean;
}

export const emptyMediaDraft = (): MediaDraft => ({
  titulo: '',
  descripcion: '',
  tipo: 'imagen',
  url: '',
  activo: true
});

/** Only fixed official provider endpoints can become embeds; never accepts HTML. */
export function inspectMediaUrl(
  kind: MediaKind,
  value: string
): { url: string; embed: string; error: string } {
  const invalid = (
    error = 'Usa una URL HTTPS pública y válida, sin credenciales ni código HTML.'
  ) => ({
    url: '',
    embed: '',
    error
  });

  if (
    !value ||
    value.length > 2000 ||
    /[\x00-\x20\\<>"\x7f]/.test(value)
  ) {
    return invalid();
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return invalid();
  }

  const host = url.hostname;
  const path = url.pathname.replace(/^\/+|\/+$/g, '');

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !host.includes('.') ||
    /(?:^|\.)(?:localhost|local|internal)$/.test(host) ||
    /^(?:0|10|127|169\.254|192\.168|172\.(?:1[6-9]|2\d|3[01]))(?:\.|$)/.test(host)
  ) {
    return invalid();
  }

  if (kind === 'youtube') {
    let video = host === 'youtu.be' ? path : '';

    if (
      [
        'youtube.com',
        'www.youtube.com',
        'm.youtube.com',
        'youtube-nocookie.com',
        'www.youtube-nocookie.com'
      ].includes(host)
    ) {
      video =
        path === 'watch' &&
        url.searchParams.getAll('v').length === 1
          ? url.searchParams.get('v') || ''
          : path.match(
              /^(?:shorts|embed)\/([A-Za-z0-9_-]{11})$/
            )?.[1] || '';
    }

    if (!/^[A-Za-z0-9_-]{11}$/.test(video)) {
      return invalid(
        'Usa el enlace de un video de YouTube, no de un canal.'
      );
    }

    return {
      url: `https://www.youtube.com/watch?v=${video}`,
      embed: `https://www.youtube-nocookie.com/embed/${video}`,
      error: ''
    };
  }

  if (kind === 'instagram') {
    const validHost = [
      'instagram.com',
      'www.instagram.com'
    ].includes(host);

    const publicacion =
      /^(?:p|reel|tv)\/[A-Za-z0-9_-]{5,64}$/.test(path);

    const compartido =
      /^share\/(?:p|reel)\/[A-Za-z0-9_-]{5,128}$/.test(path);

    if (!validHost || (!publicacion && !compartido)) {
      return invalid(
        'Usa el enlace de una publicación o reel de Instagram.'
      );
    }

    return {
      url: `https://www.instagram.com/${path}/`,
      embed: '',
      error: ''
    };
  }

  if (kind === 'facebook') {
    if (
      ![
        'facebook.com',
        'www.facebook.com',
        'm.facebook.com'
      ].includes(host)
    ) {
      return invalid('Usa una publicación pública de Facebook.');
    }

    let canonical = '';

    if (
      /^[A-Za-z0-9.]+\/(?:posts|videos)\/(?:[0-9]+|pfbid[A-Za-z0-9]+)$/.test(path) ||
      /^reel\/[0-9]+$/.test(path)
    ) {
      canonical = `https://www.facebook.com/${path}`;
    }

    const keys =
      path === 'permalink.php'
        ? ['story_fbid', 'id']
        : path === 'photo.php'
          ? ['fbid']
          : path === 'watch'
            ? ['v']
            : [];

    if (
      keys.length &&
      keys.every(
        key =>
          url.searchParams.getAll(key).length === 1 &&
          /^[A-Za-z0-9]+$/.test(
            url.searchParams.get(key) || ''
          )
      )
    ) {
      canonical =
        `https://www.facebook.com/${path}?` +
        new URLSearchParams(
          keys.map(key => [
            key,
            url.searchParams.get(key)!
          ])
        );
    }

    if (!canonical) {
      return invalid(
        'Usa el enlace completo de una publicación, foto o video público de Facebook.'
      );
    }

    const video =
      path.includes('/videos/') ||
      path.startsWith('reel/') ||
      path === 'watch';

    return {
      url: canonical,
      embed:
        `https://www.facebook.com/plugins/` +
        `${video ? 'video' : 'post'}.php?` +
        new URLSearchParams({
          href: canonical,
          show_text: 'true',
          width: '500'
        }),
      error: ''
    };
  }

  if (
    kind === 'imagen' &&
    !/\.(?:jpe?g|png|webp)$/i.test(url.pathname)
  ) {
    return invalid(
      'La URL de imagen debe terminar en JPG, PNG o WebP; también puedes subir un archivo.'
    );
  }

  url.hash = '';

  return {
    url: url.href,
    embed: '',
    error: ''
  };
}

export function mediaProblem(
  draft: MediaDraft,
  file: File | null,
  hasStoredImage = false
): string {
  if (!draft.titulo.trim()) {
    return 'Indica un título para el recurso.';
  }

  if (
    draft.titulo.trim().length > 180 ||
    draft.descripcion.length > 2000
  ) {
    return 'Revisa los límites del título y la descripción.';
  }

  if (file) {
    if (!['imagen', 'video'].includes(draft.tipo)) {
      return 'Solo se permite subir imágenes; no videos propios.';
    }

    if (
      !(draft.tipo === 'video' ? /\.(mp4|webm)$/i : /\.(jpe?g|png|webp|heic|heif)$/i).test(file.name) ||
      file.size > (draft.tipo === 'video' ? 8 : 2) * 1024 * 1024
    ) {
      return draft.tipo === 'video' ? 'Selecciona un video MP4 o WebM de hasta 8 MB y 20 segundos.' : 'Selecciona una imagen JPG, PNG, WebP, HEIC o HEIF de hasta 2 MB.';
    }

    return '';
  }

  if (
    hasStoredImage &&
    ['imagen', 'video'].includes(draft.tipo) &&
    !draft.url
  ) {
    return '';
  }

  if (draft.tipo === 'video') return 'Selecciona un video de tu dispositivo.';
  return inspectMediaUrl(
    draft.tipo,
    draft.url.trim()
  ).error;
}
