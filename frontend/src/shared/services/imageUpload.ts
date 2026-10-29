import { API_BASE_URL } from '../../api';
import { requestJson } from './apiRequest';

export const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif';
export const IMAGE_FORMATS = 'JPG, PNG, WebP, HEIC o HEIF';
export async function prepareImage(file: File, maxMB = 2, signal?: AbortSignal): Promise<string> {
  if (!/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error(`Selecciona una imagen ${IMAGE_FORMATS}.`);
  if (file.size > maxMB * 1024 * 1024) throw new Error(`La imagen supera el máximo de ${maxMB} MB.`);
  const auth = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (!auth) throw new Error('Inicia sesión como propietario para subir imágenes.');
  const body = new FormData(); body.append('imagen', file); body.append('max_mb', String(maxMB));
  const result = await requestJson(`${API_BASE_URL}/api/tienda/imagenes/procesar/`, {method:'POST',headers:{Authorization:`Token ${auth}`},body,signal}, undefined, 30000) as {url?:string};
  if (!result || typeof result.url !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(result.url)) throw new Error('No pudimos procesar esta imagen. Intenta con otra foto.');
  return result.url;
}
