
import {
  LEGAL_ORDER,
  defaultLegalPages,
  type LegalPage,
  type LegalType,
} from './legalContent';
import { resolveCurrentLegalVersion } from './legalCurrentVersion';

type LegalPages = Record<LegalType, LegalPage>;


export const LEGAL_MAX_LENGTH = 50000;


export const LEGAL_STORAGE_ERROR =
  'No se pudo publicar. Revisa el espacio o los permisos del navegador e inténtalo nuevamente.';

export function isLegalType(value: unknown): value is LegalType {
  return typeof value === 'string' && (LEGAL_ORDER as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const withThousands = (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.');


export function validateLegalContent(content: unknown): string | null {
  if (typeof content !== 'string' || !content.trim()) {
    return 'El contenido no puede estar vacío.';
  }
  if (content.length > LEGAL_MAX_LENGTH) {
    return `El contenido supera el máximo de ${withThousands(LEGAL_MAX_LENGTH)} caracteres.`;
  }
  return null;
}


export function readPublishedLegalPage(entry: unknown, type: LegalType): LegalPage {
  const fallback = defaultLegalPages[type];
  if (isRecord(entry)) {
    const currentVersion = resolveCurrentLegalVersion(entry.versions, entry.currentVersionId, type);
    if (currentVersion) {
      return {
        title: fallback.title,
        draft: currentVersion.content,
        published: currentVersion.content,
        lastPublished: currentVersion.publishedAt,
      };
    }
  }
  if (!isRecord(entry) || typeof entry.published !== 'string' || !entry.published.trim()) {
    return fallback;
  }
  const lastPublished =
    typeof entry.lastPublished === 'string' && !Number.isNaN(Date.parse(entry.lastPublished))
      ? entry.lastPublished
      : null;

  return { title: fallback.title, draft: entry.published, published: entry.published, lastPublished };
}


export function readPublishedLegalPages(saved: unknown): LegalPages {
  const stored = isRecord(saved) && isRecord(saved.legalPages) ? saved.legalPages : {};
  return Object.fromEntries(
    LEGAL_ORDER.map((type) => [type, readPublishedLegalPage(stored[type], type)]),
  ) as LegalPages;
}

export type PublishResult =
  | { ok: true; pages: LegalPages }
  | { ok: false; error: string };


export function publishLegalPage(
  pages: LegalPages,
  type: LegalType,
  now: Date = new Date(),
): PublishResult {
  const page = pages[type];
  const error = validateLegalContent(page?.draft);
  if (error) return { ok: false, error };
  return {
    ok: true,
    pages: { ...pages, [type]: { ...page, published: page.draft, lastPublished: now.toISOString() } },
  };
}

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];


export function formatLegalDate(value: string | null | undefined): string {
  if (typeof value !== 'string' || !value) return '';
  let year: number;
  let month: number;
  let day: number;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {

    year = Number(dateOnly[1]);
    month = Number(dateOnly[2]) - 1;
    day = Number(dateOnly[3]);
    const probe = new Date(Date.UTC(year, month, day));
    if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month || probe.getUTCDate() !== day) {
      return '';
    }
  } else {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    year = date.getFullYear();
    month = date.getMonth();
    day = date.getDate();
  }
  return `${day} de ${MONTHS[month]} de ${year}`;
}
