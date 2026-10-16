import { foregroundFor, marketingPalette } from './brand';
import type { MarketingPalette } from './types';

export const TEMPLATES = [
  { id: 'photo', name: 'Fotografía', detail: 'Imagen amplia y ficha debajo' },
  { id: 'feature', name: 'Destacado', detail: 'Ficha enmarcada y precio protagonista' },
  { id: 'minimal', name: 'Esencial', detail: 'Composición limpia con ficha primero' },
] as const;
export type Template = typeof TEMPLATES[number]['id'];
export type TextBlock = 'heading' | 'subtitle' | 'cta';
export const FONT_FAMILIES = { sans: 'Arial, sans-serif', serif: 'Georgia, serif', mono: '"Courier New", monospace' } as const;
export interface TextStyle { size: number; bold: boolean; italic: boolean; align: 'left' | 'center' | 'right'; color: string | null }
export interface DesignState {
  template: Template;
  heading: string; subtitle: string; cta: string; showSubtitle: boolean;
  font: keyof typeof FONT_FAMILIES;
  textStyles: Record<TextBlock, TextStyle>;
  colors: { background: string | null; text: string | null; accent: string | null; label: string | null };
  showLogo: boolean; imageIndex: number; fit: 'contain' | 'cover'; position: 'center' | 'top' | 'bottom'; zoom: number;
  spacing: 'compact' | 'comfortable'; alignment: 'left' | 'center' | 'right'; mediaSide: 'start' | 'end';
}
export const TEXT_LIMITS = { heading: 48, subtitle: 72, cta: 48 } as const;
const style = (bold = false): TextStyle => ({ size: 100, bold, italic: false, align: 'left', color: null });
export function defaultDesign(): DesignState {
  return { template: 'photo', heading: '', subtitle: '', cta: 'Disponible en nuestra tienda', showSubtitle: false, font: 'sans',
    textStyles: { heading: style(true), subtitle: style(), cta: style() },
    colors: { background: null, text: null, accent: null, label: null }, showLogo: true, imageIndex: 0,
    fit: 'contain', position: 'center', zoom: 100, spacing: 'comfortable', alignment: 'left', mediaSide: 'start' };
}
const hex = (v: unknown): string | null => typeof v === 'string' && /^#[a-f\d]{6}$/i.test(v) ? v : null;
const choice = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => options.includes(v as T) ? v as T : fallback;
const bound = (v: unknown, low: number, high: number, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.min(high, Math.max(low, Math.round(v))) : fallback;
/** Lista cerrada: no acepta HTML, CSS, URLs ni campos comerciales en el documento editable. */
export function normalizeDesign(value: DesignState): DesignState {
  const defaults = defaultDesign();
  const textStyles = { ...defaults.textStyles };
  for (const key of ['heading', 'subtitle', 'cta'] as const) {
    const raw = value.textStyles?.[key];
    textStyles[key] = { size: bound(raw?.size, 85, 115, 100), bold: raw?.bold === true, italic: raw?.italic === true,
      align: choice(raw?.align, ['left', 'center', 'right'], 'left'), color: hex(raw?.color) };
  }
  const text = (key: TextBlock) => typeof value[key] === 'string' ? value[key].replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, TEXT_LIMITS[key]) : defaults[key];
  return { template: choice(value.template, ['photo', 'feature', 'minimal'], 'photo'), heading: text('heading'), subtitle: text('subtitle'), cta: text('cta'),
    showSubtitle: value.showSubtitle === true, font: choice(value.font, ['sans', 'serif', 'mono'], 'sans'), textStyles,
    colors: { background: hex(value.colors?.background), text: hex(value.colors?.text), accent: hex(value.colors?.accent), label: hex(value.colors?.label) },
    showLogo: value.showLogo !== false, imageIndex: bound(value.imageIndex, 0, 9999, 0),
    fit: choice(value.fit, ['contain', 'cover'], 'contain'), position: choice(value.position, ['center', 'top', 'bottom'], 'center'),
    zoom: bound(value.zoom, 100, 130, 100), spacing: choice(value.spacing, ['compact', 'comfortable'], 'comfortable'),
    alignment: choice(value.alignment, ['left', 'center', 'right'], 'left'), mediaSide: choice(value.mediaSide, ['start', 'end'], 'start') };
}
/** Los campos editoriales no sirven para introducir ofertas/condiciones alternativas. El nombre real siempre se conserva. */
export function editorialProblem(text: string): string | null {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /[<>$€%\d]|\b(gratis|descuento|oferta|stock|envio|vence|vigencia|ultim[oa]s?)\b/i.test(normalized)
    ? 'Usa texto editorial sin precios, porcentajes, disponibilidad ni condiciones. Esos datos provienen del catálogo.' : null;
}
function luminance(hex: string): number {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
}
export function contrast(a: string, b: string): number { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
export function safeTextColor(candidate: string | null, background: string): string {
  return candidate && hex(candidate) && contrast(candidate, background) >= 4.5 ? candidate : foregroundFor(background);
}
export function designPalette(brand: MarketingPalette, design: DesignState) {
  const background = design.colors.background || brand.primary, accent = design.colors.accent || brand.secondary;
  return { background, accent, text: safeTextColor(design.colors.text, background), label: design.colors.label || accent,
    onAccent: foregroundFor(accent), onLabel: foregroundFor(design.colors.label || accent) };
}
export const PALETTES = [
  { name: 'Tinta y papel', palette: marketingPalette('#172b3a', '#f3e9d2') },
  { name: 'Bosque', palette: marketingPalette('#164c40', '#f2edda') },
  { name: 'Ciruela', palette: marketingPalette('#50243e', '#ffe4c9') },
];
export interface DesignHistory { past: DesignState[]; present: DesignState; future: DesignState[] }
export type DesignAction = { type: 'change'; next: DesignState } | { type: 'undo' } | { type: 'redo' } | { type: 'reset' };
export const initialHistory = (): DesignHistory => ({ past: [], present: defaultDesign(), future: [] });
export function designHistory(state: DesignHistory, action: DesignAction): DesignHistory {
  if (action.type === 'undo') return state.past.length ? { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future].slice(0, 40) } : state;
  if (action.type === 'redo') return state.future.length ? { past: [...state.past, state.present].slice(-40), present: state.future[0], future: state.future.slice(1) } : state;
  const next = action.type === 'reset' ? defaultDesign() : normalizeDesign(action.next);
  return JSON.stringify(next) === JSON.stringify(state.present) ? state : { past: [...state.past, state.present].slice(-40), present: next, future: [] };
}
