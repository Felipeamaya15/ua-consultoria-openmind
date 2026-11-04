import { API_BASE_URL } from '../../../api';
import { readApiResponse, requestJson } from '../../../shared/services/apiRequest';
import { MEDIA_TYPES, type MediaDraft, type MediaPage, type MediaResource } from '../domain/mediaLibrary';

const endpoint = `${API_BASE_URL}/api/landing/biblioteca/`;
export const MEDIA_LIBRARY_CHANGED = 'openmind:media-library-changed';
function changed() { if (typeof window !== 'undefined') window.dispatchEvent(new Event(MEDIA_LIBRARY_CHANGED)); }
function headers() {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (!token) throw new Error('Inicia sesión como propietario para administrar la biblioteca.');
  return { Authorization: `Token ${token}` };
}
const uuid = (id: string) => { if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) throw new Error('El identificador del recurso no es válido.'); return id; };
function resource(value: unknown): MediaResource {
  const item = value as MediaResource | null;
  if (!item || typeof item.id !== 'string' || !Object.prototype.hasOwnProperty.call(MEDIA_TYPES, item.tipo) || typeof item.titulo !== 'string' || typeof item.descripcion !== 'string' || typeof item.url !== 'string' || typeof item.activo !== 'boolean' || !(item.archivo === null || (item.archivo && typeof item.archivo.mime === 'string' && typeof item.archivo.tamano === 'number'))) throw new Error('No pudimos confirmar el recurso. Recarga para comprobar si se guardó.');
  uuid(item.id);
  return item;
}
export async function fetchMediaLibrary(page = 1, signal?: AbortSignal): Promise<MediaPage> {
  const value = await requestJson(`${endpoint}?pagina=${page}`, { headers: headers(), cache: 'no-store', signal }) as MediaPage;
  if (!value || !Array.isArray(value.resultados) || !Number.isSafeInteger(value.total) || value.total < 0 || value.pagina !== page || value.por_pagina !== 24) throw new Error('No pudimos confirmar los recursos. Reintenta la carga.');
  return { ...value, resultados: value.resultados.map(resource) };
}
export async function saveMediaResource(id: string | null, draft: MediaDraft, file: File | null, preserveImage: boolean, signal?: AbortSignal): Promise<MediaResource> {
  const payload = { ...draft, titulo: draft.titulo.trim(), descripcion: draft.descripcion.trim(), url: draft.url.trim() };
  const body = new FormData();
  for (const [key, value] of Object.entries(payload)) if (key !== 'url' || (!file && !preserveImage)) body.append(key, String(value));
  if (file) body.append('imagen', file);
  const saved = resource(await requestJson(id ? `${endpoint}${uuid(id)}/` : endpoint, { method: id ? 'PATCH' : 'POST', headers: headers(), body, signal }, undefined, 30000));
  changed(); return saved;
}
export async function setMediaActive(id: string, active: boolean, signal?: AbortSignal): Promise<MediaResource> {
  const saved = resource(await requestJson(`${endpoint}${uuid(id)}/`, { method: 'PATCH', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: active }), signal }));
  changed(); return saved;
}
export async function deleteMediaResource(id: string, signal?: AbortSignal): Promise<void> {
  const saved = await requestJson(`${endpoint}${uuid(id)}/`, { method: 'DELETE', headers: headers(), signal }) as { id?: string };
  if (saved?.id !== id) throw new Error('No pudimos confirmar la eliminación. Recarga antes de reintentar.');
  changed();
}
export async function fetchMediaImage(id: string, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(`${endpoint}${uuid(id)}/imagen/`, { headers: headers(), cache: 'no-store', signal });
  if (!response.ok) { await readApiResponse(response); throw new Error('La imagen no está disponible.'); }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(response.headers.get('Content-Type') || '')) throw new Error('La respuesta no contiene una imagen compatible.');
  return response.blob();
}
