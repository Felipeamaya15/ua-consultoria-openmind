/**
 * Publicación de páginas legales (SCRUM-392, 393, 394 y 395).
 *
 * El emprendedor edita un borrador en el panel y lo publica. La tienda pública
 * solo debe mostrar la versión publicada; el borrador nunca sale del panel.
 * Todo lo que lee o escribe la configuración guardada pasa por este módulo,
 * para que el día que el contenido viva en el backend solo cambie este punto.
 */
import {
  LEGAL_ORDER,
  defaultLegalPages,
  type LegalPage,
  type LegalType,
} from './legalContent';
import { resolveCurrentLegalVersion } from './legalCurrentVersion';

type LegalPages = Record<LegalType, LegalPage>;

/** Largo máximo del texto de una página legal, en caracteres. */
export const LEGAL_MAX_LENGTH = 50000;

/** Aviso cuando el navegador no logra guardar la publicación (sin espacio o sin permisos). */
export const LEGAL_STORAGE_ERROR =
  'No se pudo publicar. Revisa el espacio o los permisos del navegador e inténtalo nuevamente.';

export function isLegalType(value: unknown): value is LegalType {
  return typeof value === 'string' && (LEGAL_ORDER as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const withThousands = (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Devuelve el motivo por el que un texto no se puede publicar, o null si es válido. */
export function validateLegalContent(content: unknown): string | null {
  if (typeof content !== 'string' || !content.trim()) {
    return 'El contenido no puede estar vacío.';
  }
  if (content.length > LEGAL_MAX_LENGTH) {
    return `El contenido supera el máximo de ${withThousands(LEGAL_MAX_LENGTH)} caracteres.`;
  }
  return null;
}

/**
 * Lo que ve el comprador de una página: solo la versión publicada. Si no hay nada
 * publicado, o lo guardado no es válido, usa el texto base de la plataforma.
 */
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
  // `draft` repite lo publicado a propósito: el borrador del emprendedor no debe llegar a la tienda.
  return { title: fallback.title, draft: entry.published, published: entry.published, lastPublished };
}

/** Las tres páginas legales tal como las ve el comprador, a partir de la configuración guardada. */
export function readPublishedLegalPages(saved: unknown): LegalPages {
  const stored = isRecord(saved) && isRecord(saved.legalPages) ? saved.legalPages : {};
  return Object.fromEntries(
    LEGAL_ORDER.map((type) => [type, readPublishedLegalPage(stored[type], type)]),
  ) as LegalPages;
}

export type PublishResult =
  | { ok: true; pages: LegalPages }
  | { ok: false; error: string };

/** Publica el borrador de una página: valida, lo copia a "publicado" y anota la fecha. */
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

/** "2025-08-01" -> "1 de agosto de 2025". Devuelve '' si no hay una fecha válida. */
export function formatLegalDate(value: string | null | undefined): string {
  if (typeof value !== 'string' || !value) return '';
  let year: number;
  let month: number;
  let day: number;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    // Una fecha sin hora no debe correrse de día por la zona horaria.
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
