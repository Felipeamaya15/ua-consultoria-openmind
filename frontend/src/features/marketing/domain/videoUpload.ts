/** Browser metadata is an early UX check; the server independently decodes bytes. */
export function validateVideoFile(file: File): Promise<void> {
  if (file.size > 8 * 1024 * 1024) return Promise.reject(new Error('El video supera 8 MB. Comprímelo o selecciona otro archivo.'));
  const mime = /\.webm$/i.test(file.name) ? 'video/webm' : /\.mp4$/i.test(file.name) ? 'video/mp4' : '';
  const video = document.createElement('video');
  if (!mime || !video.canPlayType(mime)) return Promise.reject(new Error('Tu navegador no puede reproducir este formato. Selecciona MP4 o WebM.'));
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const finish = (message?: string) => {
      clearTimeout(timeout); video.onloadedmetadata = null; video.onerror = null;
      video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url);
      if (message) reject(new Error(message)); else resolve();
    };
    const timeout = window.setTimeout(() => finish('No pudimos leer la duración del video. Selecciona otro archivo.'), 10000);
    video.preload = 'metadata'; video.muted = true;
    video.onloadedmetadata = () => finish(!Number.isFinite(video.duration) || video.duration <= 0 ? 'El video no tiene una duración válida.' : video.duration > 20.001 ? 'El video supera 20 segundos. Recórtalo antes de subirlo.' : undefined);
    video.onerror = () => finish('No pudimos reproducir este archivo. Usa MP4 (H.264) o WebM.');
    video.src = url;
  });
}
