import type { BloqueLanding, ImagenBloqueLanding } from './landing.types';

export const SECTION_ELEMENTS = {
  titulo: 'Título', subtitulo: 'Subtítulo', texto: 'Texto o descripción', imagen: 'Imagen individual', galeria: 'Galería',
  youtube: 'Video de YouTube', biblioteca: 'Recurso de biblioteca', social: 'Publicación social', separador: 'Separador',
  boton: 'Botón con enlace', whatsapp: 'Contacto por WhatsApp', nombre: 'Nombre de servicio o producto', precio: 'Precio informativo',
  caracteristicas: 'Características o beneficios', informacion: 'Información adicional', duracion: 'Duración',
  fecha: 'Fecha', horario: 'Horario', modalidad: 'Modalidad', ubicacion: 'Ubicación o enlace',
} as const;
export type ElementKind = keyof typeof SECTION_ELEMENTS;
export interface SectionElement {
  id: string; tipo: ElementKind; visible: boolean; texto?: string; imagenes?: ImagenBloqueLanding[];
  recurso_id?: string; url?: string; proveedor?: 'instagram' | 'facebook'; etiqueta?: string; numero?: string; mensaje?: string;
  importe?: string; fecha?: string; inicio?: string; termino?: string; modalidad?: 'presencial' | 'online' | 'mixta';
}
export const TEXT_ELEMENTS: ElementKind[] = ['titulo', 'subtitulo', 'texto', 'nombre', 'caracteristicas', 'informacion', 'duracion'];
export function newSectionElement(tipo: ElementKind): SectionElement {
  const base = { id: crypto.randomUUID(), tipo, visible: true };
  if (TEXT_ELEMENTS.includes(tipo)) return { ...base, texto: '' };
  if (tipo === 'imagen' || tipo === 'galeria') return { ...base, imagenes: [] };
  if (tipo === 'youtube') return { ...base, url: '' };
  if (tipo === 'social') return { ...base, proveedor: 'instagram', url: '' };
  if (tipo === 'biblioteca') return { ...base, recurso_id: '' };
  if (tipo === 'boton') return { ...base, etiqueta: 'Solicitar información', url: '' };
  if (tipo === 'whatsapp') return { ...base, etiqueta: 'Solicitar información', numero: '', mensaje: '' };
  if (tipo === 'precio') return { ...base, importe: '' };
  if (tipo === 'fecha') return { ...base, fecha: '' };
  if (tipo === 'horario') return { ...base, inicio: '' };
  if (tipo === 'modalidad') return { ...base, modalidad: 'presencial' };
  if (tipo === 'ubicacion') return { ...base, texto: '' };
  return base;
}
export const SECTION_PRESETS = { personalizada: 'Sección personalizada', multimedia: 'Sección multimedia', informativa: 'Sección informativa', servicios: 'Sección de servicios', talleres: 'Sección de talleres' } as const;
export type SectionPreset = keyof typeof SECTION_PRESETS;
export function createFlexibleSection(preset: SectionPreset): BloqueLanding {
  const kinds: ElementKind[] = preset === 'servicios' ? ['titulo', 'texto', 'caracteristicas'] : preset === 'talleres' ? ['titulo', 'texto', 'modalidad'] : ['titulo', 'texto'];
  return { id: crypto.randomUUID(), tipo: 'personalizada', nombre_interno: SECTION_PRESETS[preset], visible: false,
    titulo: '', subtitulo: '', texto: '', imagenes: [], componentes: kinds.map(newSectionElement) };
}
export function moveElement(elements: SectionElement[], index: number, delta: number): SectionElement[] {
  if (index < 0 || index >= elements.length || index + delta < 0 || index + delta >= elements.length) return elements;
  const next = [...elements]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next;
}
