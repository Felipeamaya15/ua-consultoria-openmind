import type { BloqueLanding, ContenidoLanding } from './landing.types';

export const SYSTEM_SECTIONS = [
  {id:'sistema:destacados', name:'Productos destacados', flag:'Productos destacados', templates:['editorial','minimal','visual','catalog']},
  {id:'sistema:categorias', name:'Categorías', flag:'Categorías', templates:['editorial','minimal','visual','catalog']},
  {id:'sistema:banner', name:'Banner de colección', flag:'Banner de colección', templates:['minimal']},
  {id:'sistema:mas-productos', name:'Más para ti', flag:'Más para ti', templates:['minimal']},
  {id:'sistema:contenido', name:'Contenido editorial del catálogo', flag:'Contenido editorial del catálogo', templates:['catalog']},
  {id:'sistema:descubrir', name:'Más para descubrir', flag:'Más para descubrir', templates:['catalog']},
] as const;
export type SystemSectionId = typeof SYSTEM_SECTIONS[number]['id'];
export type HomeTemplate = 'editorial' | 'minimal' | 'visual' | 'catalog';
const defaults: Record<HomeTemplate, SystemSectionId[]> = {
  editorial:['sistema:destacados','sistema:categorias'],
  minimal:['sistema:destacados','sistema:categorias'],
  visual:['sistema:destacados','sistema:categorias'],
  catalog:['sistema:destacados','sistema:categorias'],
};
export function homeSectionOrder(content: Partial<ContenidoLanding> | undefined, template: HomeTemplate, includeOtherTemplates = false): string[] {
  const blocks = content?.bloques ?? [];
  const available = [...blocks.map(block=>block.id), ...defaults[template],
    ...(includeOtherTemplates ? SYSTEM_SECTIONS.filter(section=>section.templates.length === 4).map(section=>section.id) : [])];
  const allowed = new Set(available);
  return [...new Set([...(content?.orden_apartados ?? []), ...available])].filter(id=>allowed.has(id));
}
export function reconcileHomeOrder(order: string[], blocks: BloqueLanding[]): string[] {
  const allowed = new Set<string>([...blocks.map(block=>block.id), ...SYSTEM_SECTIONS.map(section=>section.id)]);
  return [...new Set([...order, ...blocks.map(block=>block.id)])].filter(id=>allowed.has(id));
}
export function systemSectionVisible(id: SystemSectionId, flags: Record<string, boolean> = {}): boolean {
  const section = SYSTEM_SECTIONS.find(section=>section.id===id)!;
  if (flags[section.flag] !== undefined) return flags[section.flag];
  return id==='sistema:contenido' ? true : id==='sistema:categorias' ? flags['Categorías']!==false : flags['Productos destacados']!==false;
}
