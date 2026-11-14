/**
 * Validacion previa de videos cortos de productos.
 * El servidor tambien debe validar el archivo.
 */

export const PRODUCT_VIDEO_MAX_SECONDS = 10;
export const PRODUCT_VIDEO_MAX_BYTES = 20 * 1024 * 1024;

export async function validateProductVideo(file: File): Promise<number> {
  const extensionValid = /\.(mp4|webm)$/i.test(file.name);
  const mimeValid = !file.type ||
    ['video/mp4', 'video/webm'].includes(file.type);

  if (!extensionValid || !mimeValid) {
    throw new Error('Selecciona un video MP4 o WebM.');
  }

  if (!file.size || file.size > PRODUCT_VIDEO_MAX_BYTES) {
    throw new Error('El video debe pesar como máximo 20 MB.');
  }

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');

  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;

  try {
    return await new Promise<number>((resolve, reject) => {
      let completed = false;

      const finish = (error?: Error, seconds?: number) => {
        if (completed) return;
        completed = true;

        window.clearTimeout(timeout);

        if (error) reject(error);
        else resolve(seconds!);
      };

      const timeout = window.setTimeout(() => {
        finish(new Error('No pudimos leer la duración del video.'));
      }, 12000);

      video.onloadedmetadata = () => {
        const seconds = video.duration;

        if (!Number.isFinite(seconds) || seconds <= 0) {
          finish(new Error('La duración del video no es válida.'));
        } else if (seconds > PRODUCT_VIDEO_MAX_SECONDS) {
          finish(new Error('El video supera los 10 segundos permitidos.'));
        } else {
          finish(undefined, seconds);
        }
      };

      video.onerror = () => {
        finish(new Error('No pudimos reproducir este archivo de video.'));
      };

      video.src = objectUrl;
      video.load();
    });
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}