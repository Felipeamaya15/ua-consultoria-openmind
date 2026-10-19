import { initialTemplateHistory, normalizeDesign, TEMPLATES, type DesignState, type Template, type TemplateHistory } from './editor';
import type { ContentSource, PublicationFormat } from './types';

export interface DraftScope { apiBaseUrl: string; storeId: string; userId: string }
export interface PublicationSnapshot {
  productId: string; sku: string; source: ContentSource; format: PublicationFormat;
  activeTemplate: Template; designs: Record<Template, DesignState>;
}
export interface MarketingDraft {
  id: string; name: string; createdAt: string; updatedAt: string; version: 1; publication: PublicationSnapshot;
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function snapshot(productId: string, sku: string, source: ContentSource, format: PublicationFormat, session: TemplateHistory): PublicationSnapshot {
  return { productId, sku, source, format, activeTemplate: session.active,
    designs: Object.fromEntries(TEMPLATES.map(t => [t.id, normalizeDesign(session.documents[t.id].present)])) as PublicationSnapshot['designs'] };
}
export function restoreSession(value: PublicationSnapshot): TemplateHistory {
  const session = initialTemplateHistory();
  session.active = value.activeTemplate;
  for (const t of TEMPLATES) session.documents[t.id].present = normalizeDesign({ ...value.designs[t.id], template: t.id });
  return session;
}
/** Lista cerrada: nunca persiste precios, recursos, credenciales ni respuestas del servidor. */
export function readSnapshot(value: unknown): PublicationSnapshot {
  if (!record(value) || typeof value.productId !== 'string' || !/^[a-f\d]{24}$/i.test(value.productId)
    || typeof value.sku !== 'string' || value.sku.length > 200 || !['product', 'promotion'].includes(String(value.source))
    || !['square', 'story', 'banner'].includes(String(value.format)) || !TEMPLATES.some(t => t.id === value.activeTemplate) || !record(value.designs)) {
    throw new Error('El borrador contiene datos incompatibles. No se modificó el archivo guardado.');
  }
  const designs = value.designs;
  const normalized = Object.fromEntries(TEMPLATES.map(t => {
    const raw = designs[t.id];
    if (!record(raw)) throw new Error('El borrador no contiene las tres plantillas.');
    return [t.id, normalizeDesign({ ...raw, template: t.id } as unknown as DesignState)];
  })) as PublicationSnapshot['designs'];
  return { productId: value.productId, sku: value.sku, source: value.source as ContentSource, format: value.format as PublicationFormat,
    activeTemplate: value.activeTemplate as Template, designs: normalized };
}
export function draftName(value: string): string {
  const name = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (!name || name.length > 80) throw new Error('Escribe un nombre de entre 1 y 80 caracteres para el borrador.');
  return name;
}
export function readDraft(value: unknown): MarketingDraft {
  if (!record(value) || value.version !== 1) throw new Error('Hay borradores de una versión incompatible. No se sobrescribieron.');
  if (typeof value.id !== 'string' || !/^[a-z\d-]{8,80}$/i.test(value.id) || typeof value.name !== 'string'
    || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
    || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) throw new Error('Los borradores guardados están dañados. No se sobrescribieron.');
  return { id: value.id, name: draftName(value.name), createdAt: value.createdAt, updatedAt: value.updatedAt, version: 1, publication: readSnapshot(value.publication) };
}
