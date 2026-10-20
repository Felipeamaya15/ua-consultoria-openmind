import { foregroundFor, marketingPalette } from './brand';
import type { MarketingPalette } from './types';
import { fonts } from '../../storefront/visual/cssVariables';

export const TEMPLATES = [
  { id: 'photo', name: 'Fotografía', detail: 'Imagen amplia y ficha debajo' },
  { id: 'feature', name: 'Destacado', detail: 'Ficha enmarcada y precio protagonista' },
  { id: 'minimal', name: 'Esencial', detail: 'Composición limpia con ficha primero' },
] as const;
export type Template = typeof TEMPLATES[number]['id'];
export type EditorialBlock = 'heading' | 'subtitle' | 'cta';
export type TextBlock = EditorialBlock | 'title' | 'price' | 'variant' | 'brand' | 'description';
// Reutiliza el catálogo de la tienda, conservando los tres alias de Marketing 1/2.
export const FONT_FAMILIES = { ...fonts, sans: 'Arial, sans-serif', serif: 'Georgia, serif', mono: '"Courier New", monospace', jakarta: fonts.sans, display: fonts.serif } as const;
export interface Appearance {
  radius: number | null; borderStyle: 'original' | 'none' | 'solid' | 'dashed'; borderWidth: number; borderColor: string | null;
  shadow: 'original' | 'none' | 'soft' | 'medium' | 'strong'; padding: number | null; gap: number | null; copyPadding: number | null;
  imageRadius: number | null; imagePadding: number | null; imageX: number | null; imageY: number | null; mediaShare: number | null;
  logoSize: number | null; buttonRadius: number | null; buttonStyle: 'solid' | 'outline' | 'ghost'; buttonFullWidth: boolean;
  showButton: boolean; buttonPaddingX: number | null; buttonPaddingY: number | null;
  copyBackground: string | null; copyRadius: number | null;
  copyBorderStyle: 'original' | 'none' | 'solid' | 'dashed'; copyBorderWidth: number; copyBorderColor: string | null;
  copyShadow: 'original' | 'none' | 'soft' | 'medium' | 'strong';
  buttonBackground: string | null; buttonAlign: 'inherit' | 'left' | 'center' | 'right';
  buttonShape: 'original' | 'square' | 'rounded' | 'pill'; buttonWidth: number | null;
  buttonBorderStyle: 'solid' | 'dashed'; buttonBorderWidth: number; buttonBorderColor: string | null;
}
export const defaultAppearance = (): Appearance => ({ radius: null, borderStyle: 'original', borderWidth: 1, borderColor: null,
  shadow: 'original', padding: null, gap: null, copyPadding: null, imageRadius: null, imagePadding: null, imageX: null, imageY: null,
  mediaShare: null, logoSize: null, buttonRadius: null, buttonStyle: 'solid', buttonFullWidth: true, showButton: true,
  buttonPaddingX: null, buttonPaddingY: null, copyBackground: null, copyRadius: null,
  copyBorderStyle: 'original', copyBorderWidth: 1, copyBorderColor: null, copyShadow: 'original',
  buttonBackground: null, buttonAlign: 'inherit', buttonShape: 'original', buttonWidth: null,
  buttonBorderStyle: 'solid', buttonBorderWidth: 1, buttonBorderColor: null });
export interface TextStyle { size: number; bold: boolean; italic: boolean; align: 'inherit' | 'left' | 'center' | 'right'; color: string | null }
export interface DesignState {
  template: Template;
  heading: string; subtitle: string; cta: string; showSubtitle: boolean;
  showDescription: boolean;
  font: keyof typeof FONT_FAMILIES;
  headingFont: keyof typeof FONT_FAMILIES | null;
  appearance: Appearance;
  textStyles: Record<TextBlock, TextStyle>;
  colors: { background: string | null; text: string | null; accent: string | null; label: string | null };
  showLogo: boolean; imageIndex: number; fit: 'contain' | 'cover'; position: 'center' | 'top' | 'bottom'; zoom: number;
  spacing: 'compact' | 'comfortable'; alignment: 'left' | 'center' | 'right'; mediaSide: 'start' | 'end';
}
export const TEXT_LIMITS = { heading: 48, subtitle: 72, cta: 48 } as const;
const style = (bold = false): TextStyle => ({ size: 100, bold, italic: false, align: 'left', color: null });
export function defaultDesign(template: Template = 'photo'): DesignState {
  return { template, heading: '', subtitle: '', cta: 'Disponible en nuestra tienda', showSubtitle: false, showDescription: false, font: 'sans', headingFont: null, appearance: defaultAppearance(),
    textStyles: { heading: style(true), subtitle: style(), cta: style(), title: { ...style(true), align: 'inherit' }, price: { ...style(true), align: 'inherit' }, variant: { ...style(), align: 'inherit' }, brand: { ...style(true), align: 'inherit' }, description: { ...style(), align: 'inherit' } },
    colors: { background: null, text: null, accent: null, label: null }, showLogo: true, imageIndex: 0,
    fit: 'contain', position: 'center', zoom: 100, spacing: 'comfortable', alignment: 'left', mediaSide: template === 'minimal' ? 'end' : 'start' };
}
const hex = (v: unknown): string | null => typeof v === 'string' && /^#[a-f\d]{6}$/i.test(v) ? v : null;
const choice = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => options.includes(v as T) ? v as T : fallback;
const bound = (v: unknown, low: number, high: number, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.min(high, Math.max(low, Math.round(v))) : fallback;
/** Lista cerrada: no acepta HTML, CSS, URLs ni campos comerciales en el documento editable. */
export function normalizeDesign(value: DesignState): DesignState {
  const defaults = defaultDesign();
  const textStyles = { ...defaults.textStyles };
  for (const key of ['heading', 'subtitle', 'cta', 'title', 'price', 'variant', 'brand', 'description'] as const) {
    const raw = value.textStyles?.[key];
    textStyles[key] = { size: bound(raw?.size, 60, 160, 100), bold: raw?.bold === undefined ? defaults.textStyles[key].bold : raw.bold === true, italic: raw?.italic === true,
      align: choice(raw?.align, ['inherit', 'left', 'center', 'right'], defaults.textStyles[key].align), color: hex(raw?.color) };
  }
  const text = (key: EditorialBlock) => typeof value[key] === 'string' ? value[key].replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, TEXT_LIMITS[key]) : defaults[key];
  const raw = value.appearance || defaults.appearance;
  const optional = (key: keyof Appearance, max: number, min = 0) => raw[key] == null ? null : bound(raw[key], min, max, min);
  const appearance: Appearance = {
    radius: optional('radius', 12), borderStyle: choice(raw.borderStyle, ['original', 'none', 'solid', 'dashed'], 'original'),
    borderWidth: bound(raw.borderWidth, 0, 8, 1), borderColor: hex(raw.borderColor), shadow: choice(raw.shadow, ['original', 'none', 'soft', 'medium', 'strong'], 'original'),
    padding: optional('padding', 10), gap: optional('gap', 8), copyPadding: optional('copyPadding', 6), imageRadius: optional('imageRadius', 20),
    imagePadding: optional('imagePadding', 10), imageX: optional('imageX', 100), imageY: optional('imageY', 100), mediaShare: optional('mediaShare', 70, 25),
    logoSize: optional('logoSize', 15, 2), buttonRadius: optional('buttonRadius', 12), buttonStyle: choice(raw.buttonStyle, ['solid', 'outline', 'ghost'], 'solid'),
    buttonFullWidth: raw.buttonFullWidth !== false, showButton: raw.showButton !== false, buttonPaddingX: optional('buttonPaddingX', 8), buttonPaddingY: optional('buttonPaddingY', 5),
    copyBackground: hex(raw.copyBackground), copyRadius: optional('copyRadius', 12),
    copyBorderStyle: choice(raw.copyBorderStyle, ['original', 'none', 'solid', 'dashed'], 'original'),
    copyBorderWidth: bound(raw.copyBorderWidth, 0, 8, 1), copyBorderColor: hex(raw.copyBorderColor),
    copyShadow: choice(raw.copyShadow, ['original', 'none', 'soft', 'medium', 'strong'], 'original'),
    buttonBackground: hex(raw.buttonBackground), buttonAlign: choice(raw.buttonAlign, ['inherit', 'left', 'center', 'right'], 'inherit'),
    buttonShape: choice(raw.buttonShape, ['original', 'square', 'rounded', 'pill'], 'original'), buttonWidth: optional('buttonWidth', 100, 20),
    buttonBorderStyle: choice(raw.buttonBorderStyle, ['solid', 'dashed'], 'solid'), buttonBorderWidth: bound(raw.buttonBorderWidth, 0, 8, 1), buttonBorderColor: hex(raw.buttonBorderColor),
  };
  return { template: choice(value.template, ['photo', 'feature', 'minimal'], 'photo'), heading: text('heading'), subtitle: text('subtitle'), cta: text('cta'),
    showSubtitle: value.showSubtitle === true, showDescription: value.showDescription === true, font: choice(value.font, Object.keys(FONT_FAMILIES) as (keyof typeof FONT_FAMILIES)[], 'sans'),
    headingFont: value.headingFont && Object.prototype.hasOwnProperty.call(FONT_FAMILIES, value.headingFont) ? value.headingFont : null, appearance, textStyles,
    colors: { background: hex(value.colors?.background), text: hex(value.colors?.text), accent: hex(value.colors?.accent), label: hex(value.colors?.label) },
    showLogo: value.showLogo !== false, imageIndex: bound(value.imageIndex, 0, 9999, 0),
    fit: choice(value.fit, ['contain', 'cover'], 'contain'), position: choice(value.position, ['center', 'top', 'bottom'], 'center'),
    zoom: bound(value.zoom, 1, 400, 100), spacing: choice(value.spacing, ['compact', 'comfortable'], 'comfortable'),
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
  const copyBackground = design.appearance.copyBackground || background;
  return { background, accent, text: safeTextColor(design.colors.text, background), label: design.colors.label || accent,
    copyBackground, copyText: safeTextColor(design.colors.text, copyBackground), buttonBackground: design.appearance.buttonBackground || design.colors.label || accent,
    onAccent: foregroundFor(accent), onLabel: foregroundFor(design.colors.label || accent) };
}
export const PALETTES = [
  { name: 'Tinta y papel', palette: marketingPalette('#172b3a', '#f3e9d2') },
  { name: 'Bosque', palette: marketingPalette('#164c40', '#f2edda') },
  { name: 'Ciruela', palette: marketingPalette('#50243e', '#ffe4c9') },
];
export interface DesignHistory { past: DesignState[]; present: DesignState; future: DesignState[] }
export type DesignAction = { type: 'change'; next: DesignState } | { type: 'undo' } | { type: 'redo' } | { type: 'reset' };
export const initialHistory = (template: Template = 'photo'): DesignHistory => ({ past: [], present: defaultDesign(template), future: [] });
export function designHistory(state: DesignHistory, action: DesignAction): DesignHistory {
  if (action.type === 'undo') return state.past.length ? { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future].slice(0, 40) } : state;
  if (action.type === 'redo') return state.future.length ? { past: [...state.past, state.present].slice(-40), present: state.future[0], future: state.future.slice(1) } : state;
  const next = action.type === 'reset' ? defaultDesign(state.present.template) : normalizeDesign(action.next);
  return JSON.stringify(next) === JSON.stringify(state.present) ? state : { past: [...state.past, state.present].slice(-40), present: next, future: [] };
}

export interface TemplateHistory { active: Template; documents: Record<Template, DesignHistory> }
export const initialTemplateHistory = (): TemplateHistory => ({ active: 'photo', documents: { photo: initialHistory('photo'), feature: initialHistory('feature'), minimal: initialHistory('minimal') } });
/** Cambiar plantilla restaura su documento e historial; nunca copia ajustes de la anterior. */
export function templateHistory(state: TemplateHistory, action: DesignAction): TemplateHistory {
  if (action.type === 'change' && action.next.template !== state.active) {
    return TEMPLATES.some(t => t.id === action.next.template) ? { ...state, active: action.next.template } : state;
  }
  const next = designHistory(state.documents[state.active], action);
  return next === state.documents[state.active] ? state : { ...state, documents: { ...state.documents, [state.active]: next } };
}
