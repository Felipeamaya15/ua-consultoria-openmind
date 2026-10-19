import { draftName, readDraft, readSnapshot, type DraftScope, type MarketingDraft, type PublicationSnapshot } from '../domain/drafts';

const MAX_DRAFTS = 30;
export function draftStorageKey(scope: DraftScope): string {
  if (!/^https?:\/\//.test(scope.apiBaseUrl) || !/^[1-9]\d*$/.test(scope.storeId) || !/^[1-9]\d*$/.test(scope.userId)) throw new Error('No se pudo confirmar la identidad para los borradores.');
  return `ua-marketing-drafts-v1:${encodeURIComponent(scope.apiBaseUrl.replace(/\/+$/, ''))}:store:${scope.storeId}:user:${scope.userId}`;
}
/** Solo almacenamiento local: la autorización de catálogo siempre la realiza el servidor. */
export function draftRepository(scope: DraftScope, storage?: Storage) {
  const key = draftStorageKey(scope);
  const list = (): MarketingDraft[] => {
    let raw: string | null;
    try { raw = (storage || localStorage).getItem(key); } catch { throw new Error('Tu navegador no permite leer borradores. Revisa sus permisos de almacenamiento.'); }
    if (!raw) return [];
    if (raw.length * 2 > 2_000_000) throw new Error('Los borradores guardados superan el tamaño permitido. No se sobrescribieron.');
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Los borradores guardados están dañados. No se sobrescribieron.');
      if (data.version !== 1) throw new Error('La versión de los borradores no es compatible. No se sobrescribió su contenido.');
      if (data.scope?.apiBaseUrl !== scope.apiBaseUrl || data.scope?.storeId !== scope.storeId || data.scope?.userId !== scope.userId || !Array.isArray(data.drafts) || data.drafts.length > MAX_DRAFTS) throw new Error('Los borradores no corresponden a esta sesión o están dañados.');
      const drafts = data.drafts.map(readDraft) as MarketingDraft[];
      if (new Set(drafts.map(d => d.id)).size !== drafts.length) throw new Error('Los borradores contienen identificadores repetidos.');
      return drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch (error) { throw new Error(error instanceof SyntaxError ? 'Los borradores guardados están dañados. No se sobrescribieron.' : error instanceof Error ? error.message : 'No pudimos leer los borradores.'); }
  };
  const write = (drafts: MarketingDraft[]) => {
    if (drafts.length > MAX_DRAFTS) throw new Error('Puedes guardar hasta 30 borradores por tienda y usuario. Elimina uno para continuar.');
    const raw = JSON.stringify({ version: 1, scope, drafts });
    if (raw.length * 2 > 2_000_000) throw new Error('Los borradores superan el límite de 2 MB. Reduce su cantidad.');
    try { (storage || localStorage).setItem(key, raw); } catch { throw new Error('No se pudo guardar: el navegador no tiene espacio o bloquea el almacenamiento. Tu edición sigue abierta.'); }
  };
  const changed = (draft: MarketingDraft, expected?: string) => {
    if (expected !== undefined && draft.updatedAt !== expected) throw new Error('Este borrador cambió en otra pestaña. Ábrelo de nuevo antes de sobrescribirlo.');
  };
  const now = (previous?: string) => new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString();
  return {
    key, list,
    save(name: string, publication: PublicationSnapshot, id?: string, expected?: string): MarketingDraft {
      const drafts = list(), prior = id ? drafts.find(d => d.id === id) : undefined;
      if (id && !prior) throw new Error('Este borrador ya no existe. Crea una nueva publicación o guarda una copia.');
      if (prior) changed(prior, expected);
      const updatedAt = now(prior?.updatedAt);
      const next: MarketingDraft = { id: prior?.id || crypto.randomUUID(), name: draftName(name), version: 1, createdAt: prior?.createdAt || updatedAt, updatedAt, publication: readSnapshot(publication) };
      write([...drafts.filter(d => d.id !== id), next]); return next;
    },
    rename(id: string, name: string, expected: string) {
      const drafts = list(), draft = drafts.find(d => d.id === id);
      if (!draft) throw new Error('El borrador ya no está disponible.');
      changed(draft, expected);
      const next = { ...draft, name: draftName(name), updatedAt: now(draft.updatedAt) };
      write(drafts.map(d => d.id === id ? next : d)); return next;
    },
    duplicate(id: string) {
      const draft = list().find(d => d.id === id);
      if (!draft) throw new Error('El borrador ya no está disponible.');
      return this.save(`${draft.name.slice(0, 72)} · copia`, draft.publication);
    },
    remove(id: string, expected: string) {
      const drafts = list(), draft = drafts.find(d => d.id === id);
      if (!draft) throw new Error('El borrador ya no está disponible.');
      changed(draft, expected); write(drafts.filter(d => d.id !== id));
    },
  };
}
