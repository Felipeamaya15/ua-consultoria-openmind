import type { LegalType } from './legalContent';

export interface LegalVersionCandidate {
  id: string;
  pageType: LegalType;
  number: number;
  content: string;
  publishedAt: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPublishedVersion(value: unknown, pageType: LegalType): value is LegalVersionCandidate {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string'
    && value.id.trim().length > 0
    && value.pageType === pageType
    && Number.isSafeInteger(value.number)
    && Number(value.number) > 0
    && typeof value.content === 'string'
    && value.content.trim().length > 0
    && typeof value.publishedAt === 'string'
    && !Number.isNaN(Date.parse(value.publishedAt))
  );
}

/**
 * Resuelve únicamente la versión señalada como vigente. No elige la más nueva
 * automáticamente: una versión recién creada no debe hacerse pública por accidente.
 */
export function resolveCurrentLegalVersion(
  versions: unknown,
  currentVersionId: unknown,
  pageType: LegalType,
): LegalVersionCandidate | null {
  if (!Array.isArray(versions) || typeof currentVersionId !== 'string' || !currentVersionId.trim()) {
    return null;
  }
  const current = versions.find(
    (version) => isPublishedVersion(version, pageType) && version.id === currentVersionId,
  );
  return current ? { ...current } : null;
}

/** Cambia el puntero vigente solo si la versión existe, pertenece a la página y está publicada. */
export function selectCurrentLegalVersion(
  versions: unknown,
  versionId: string,
  pageType: LegalType,
): string {
  const selected = resolveCurrentLegalVersion(versions, versionId, pageType);
  if (!selected) {
    throw new Error('La versión legal seleccionada no existe o todavía no está publicada.');
  }
  return selected.id;
}
