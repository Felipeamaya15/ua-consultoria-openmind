import { isRecord } from './resolveVisualConfig';

/** Business content images belong to the landing editor, not legacy DOM-index overrides. */
export function isLegacyEditableImage(image: Pick<HTMLElement, 'hasAttribute' | 'closest'>): boolean {
  return !image.hasAttribute('data-landing-image') && !image.closest('[data-landing-content], [data-institutional-branding]');
}
export interface ThemeImageSetting { src: string; scale: number; x: number; y: number; radius: number; fit?: 'cover' | 'contain' }

export interface OriginalImageStyle { src: string | null; position: string; transform: string; origin: string; radius: string; fit?: string }
// The editor and its same-origin iframe must share the baseline captured before publication.
// A module-local WeakMap would be different in each window. This state lives only on the DOM node.
const ORIGINAL_IMAGE = Symbol.for('ua.visual.original-image.v1');
export function captureOriginalImage(img: HTMLImageElement): OriginalImageStyle {
  const node = img as HTMLImageElement & { [ORIGINAL_IMAGE]?: OriginalImageStyle };
  return node[ORIGINAL_IMAGE] ??= { src: img.getAttribute('src'), position: img.style.objectPosition, transform: img.style.transform, origin: img.style.transformOrigin, radius: img.style.borderRadius, fit: img.style.objectFit };
}
export function restoreOriginalImage(img: HTMLImageElement, original: OriginalImageStyle) {
  if (original.src === null) img.removeAttribute('src'); else img.setAttribute('src', original.src);
  img.style.objectPosition = original.position; img.style.transform = original.transform;
  img.style.transformOrigin = original.origin; img.style.borderRadius = original.radius;
  img.style.objectFit = original.fit ?? '';
}

/** Explicit IDs win; legacy decorative assets otherwise use original source + semantic role. */
export function stableImageKey(img: HTMLImageElement): string {
  const original = captureOriginalImage(img);
  const explicit = img.getAttribute('data-theme-image-id');
  const role = img.getAttribute('data-visual-part') || img.closest('[data-visual-section]')?.getAttribute('data-visual-section') || 'asset';
  const identity = explicit || `${role}|${original.src || ''}`;
  let hash = 2166136261;
  for (let i = 0; i < identity.length; i++) hash = Math.imul(hash ^ identity.charCodeAt(i), 16777619);
  return `image-key-${(hash >>> 0).toString(16)}`;
}
export function findImageSetting(settings: Record<string, ThemeImageSetting>, img: HTMLImageElement, index: number) {
  return settings[stableImageKey(img)] ?? settings[`image-${index}`];
}

export const DEFAULT_IMAGE_SETTING: ThemeImageSetting = { src: '', scale: 100, x: 50, y: 50, radius: 0 };

/** Normalize legacy image overrides at the same boundary for editor and storefront. */
export function readThemeImages(value: unknown): Record<string, ThemeImageSetting> {
  if (!isRecord(value)) return {};
  const images: Record<string, ThemeImageSetting> = {};
  const number = (value: unknown, fallback: number, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : fallback;
  for (const [key, setting] of Object.entries(value)) {
    if (!isRecord(setting) || !/^(image-\d+|image-key-[a-f\d]{1,8})$/.test(key)) continue;
    images[key] = {
      src: typeof setting.src === 'string' ? setting.src : '',
      scale: number(setting.scale, DEFAULT_IMAGE_SETTING.scale, 400),
      x: number(setting.x, DEFAULT_IMAGE_SETTING.x, 100), y: number(setting.y, DEFAULT_IMAGE_SETTING.y, 100),
      radius: number(setting.radius, DEFAULT_IMAGE_SETTING.radius, 10000),
      ...(setting.fit === 'cover' || setting.fit === 'contain' ? { fit: setting.fit } : {}),
    };
  }
  return images;
}
