import type { LegalType } from './legalContent';

export interface LegalContentVersion {
  id: string;
  pageType: LegalType;
  number: number;
  content: string;
  createdAt: string;
  publishedAt: string | null;
}

export interface LegalVersionHistory {
  versions: LegalContentVersion[];
  currentVersionId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isLegalType(value: unknown): value is LegalType {
  return value === 'terms' || value === 'privacy' || value === 'refund';
}

export function isLegalContentVersion(value: unknown): value is LegalContentVersion {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string'
    && value.id.trim().length > 0
    && isLegalType(value.pageType)
    && Number.isSafeInteger(value.number)
    && Number(value.number) > 0
    && typeof value.content === 'string'
    && value.content.trim().length > 0
    && isIsoDate(value.createdAt)
    && (value.publishedAt === null || isIsoDate(value.publishedAt))
  );
}

/**
 * Limpia un historial persistido y conserva una sola versión por id y número.
 * Las versiones se devuelven en orden ascendente para que la siguiente sea predecible.
 */
export function normalizeLegalVersions(value: unknown, pageType: LegalType): LegalContentVersion[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const numbers = new Set<number>();
  return value
    .filter((entry): entry is LegalContentVersion => isLegalContentVersion(entry) && entry.pageType === pageType)
    .sort((left, right) => left.number - right.number)
    .filter((entry) => {
      if (ids.has(entry.id) || numbers.has(entry.number)) return false;
      ids.add(entry.id);
      numbers.add(entry.number);
      return true;
    })
    .map((entry) => ({ ...entry }));
}

export function createLegalContentVersion(
  pageType: LegalType,
  content: string,
  existing: unknown,
  now: Date = new Date(),
): LegalContentVersion {
  if (!content.trim()) throw new Error('El contenido de la versión legal no puede estar vacío.');
  if (Number.isNaN(now.getTime())) throw new Error('La fecha de la versión legal no es válida.');

  const versions = normalizeLegalVersions(existing, pageType);
  const number = versions.reduce((maximum, version) => Math.max(maximum, version.number), 0) + 1;
  const timestamp = now.toISOString();
  return {
    id: `${pageType}-v${number}-${now.getTime()}`,
    pageType,
    number,
    content,
    createdAt: timestamp,
    publishedAt: timestamp,
  };
}

export function appendLegalContentVersion(
  history: LegalVersionHistory,
  pageType: LegalType,
  content: string,
  now: Date = new Date(),
): LegalVersionHistory {
  const versions = normalizeLegalVersions(history.versions, pageType);
  const version = createLegalContentVersion(pageType, content, versions, now);
  return { versions: [...versions, version], currentVersionId: version.id };
}
