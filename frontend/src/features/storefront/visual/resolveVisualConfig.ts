import { VISUAL_DEFAULTS } from './defaults';
import { VISUAL_PRESETS } from './presets';
import type { TemplateId } from '../data/mockData';
import type { DeepPartial, VisualConfig, VisualConfigOverrides, VisualSections, Viewport } from './types';
import { ALIGNMENTS, DENSITIES, SHAPES, SHADOWS, FONT_FAMILIES } from './types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const enumValues: Record<string, readonly string[]> = {
  align: ALIGNMENTS, titleAlign: ALIGNMENTS,
  horizontalAlign: ALIGNMENTS, navAlign: ALIGNMENTS,
  logoPosition: ALIGNMENTS, verticalAlign: ['top', 'center', 'bottom'], imagePosition: ['top', 'center', 'bottom'],
  density: DENSITIES, shape: SHAPES,
  buttonShape: SHAPES, shadow: SHADOWS,
  style: ['none', 'solid', 'dashed'], linkStyle: ['plain', 'underline', 'pill'],
  ctaPosition: ['inline', 'below'], size: ['small', 'medium', 'large'],
  width: ['auto', 'full', 'custom'], variant: ['solid', 'outline', 'ghost'],
  presentation: ['pills', 'cards', 'links'], filtersPosition: ['left', 'top', 'drawer'],
  body: FONT_FAMILIES, heading: FONT_FAMILIES,
};

function validLeaf(value: unknown, baseline: unknown, path: string): boolean {
  const key = path.split('.').pop()!;
  if (key === 'brandingVisible') return value === true;
  if (typeof baseline === 'boolean') return typeof value === 'boolean';
  if (typeof baseline === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10000) return false;
    if (key === 'version') return value === 1;
    if (key === 'columns' || path.includes('.columns.')) return Number.isInteger(value) && value >= 1 && value <= 12;
    if (key === 'overlayOpacity') return value <= 1;
    if (key === 'fontWeight') return Number.isInteger(value) && value >= 1 && value <= 1000;
    if (key === 'imageRatio') return value > 0 && value <= 10;
    if (key === 'lineHeight') return value > 0 && value <= 4;
    if (/Size$/.test(key) || key === 'baseSize') return value > 0;
    return true; // Zero is meaningful for spacing, dimensions, radius and borders.
  }
  if (typeof baseline === 'string' && typeof value === 'string') {
    if (key === 'layout') {
      const section = path.split('.')[0];
      const allowed = section === 'header' ? ['inline', 'centered', 'split']
        : section === 'categories' ? ['grid', 'row', 'wrap']
          : section === 'footer' ? ['columns', 'stack', 'centered'] : ['grid', 'stack', 'split'];
      return allowed.includes(value);
    }
    if (enumValues[key]) return enumValues[key].includes(value);
    // Color contract: hex (3/4/6/8 digits), transparent, currentColor. No arbitrary CSS.
    return /^(#[\da-f]{3}|#[\da-f]{4}|#[\da-f]{6}|#[\da-f]{8}|transparent|currentColor)$/i.test(value);
  }
  return false;
}

/** Schema-directed merge: ignore unknown keys, null, arrays and invalid leaf values. */
function mergeKnown<T extends object>(baseline: T, patch: unknown, path = ''): T {
  const candidate = isRecord(patch) ? patch : {};
  const result: Record<string, unknown> = {};
  for (const [key, fallback] of Object.entries(baseline)) {
    const nextPath = path ? `${path}.${key}` : key;
    const incoming = Object.prototype.hasOwnProperty.call(candidate, key) ? candidate[key] : undefined;
    result[key] = isRecord(fallback)
      ? mergeKnown(fallback, incoming, nextPath)
      : validLeaf(incoming, fallback, nextPath) ? incoming : fallback;
  }
  return result as T;
}

/** Keep partial breakpoint overrides partial so desktop edits continue to cascade. */
function mergeOverrides(baseline: VisualSections, ...patches: unknown[]): DeepPartial<VisualSections> {
  function select(shape: Record<string, unknown>, sources: unknown[], path: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, fallback] of Object.entries(shape)) {
      const nextPath = path ? `${path}.${key}` : key;
      const incoming = sources.map(source => isRecord(source) && Object.prototype.hasOwnProperty.call(source, key) ? source[key] : undefined);
      if (isRecord(fallback)) {
        const nested = select(fallback, incoming, nextPath);
        if (Object.keys(nested).length) result[key] = nested;
      } else {
        for (const value of incoming) if (validLeaf(value, fallback, nextPath)) result[key] = value;
      }
    }
    return result;
  }
  return select(baseline as unknown as Record<string, unknown>, patches, '') as DeepPartial<VisualSections>;
}

function supportedCustomization(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || (value.version !== undefined && value.version !== 1)) return {};
  return value;
}

/** New independent dimensions inherit their older counterpart until explicitly edited. */
function compatibleDimensions(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const result = { ...value };
  const sides = (branch: unknown, source: string, keys: string[]) => {
    if (!isRecord(branch) || branch[source] === undefined) return branch;
    return { ...Object.fromEntries(keys.map(key => [key, branch[source]])), ...branch };
  };
  result.footer = sides(value.footer, 'padding', ['paddingTop', 'paddingBottom']);
  result.productCard = sides(value.productCard, 'radius', ['buttonRadius']);
  if (isRecord(value.sections)) result.sections = Object.fromEntries(Object.entries(value.sections).map(([key, section]) => [key, sides(section, 'paddingY', ['paddingTop', 'paddingBottom'])]));
  if (isRecord(value.catalog)) result.catalog = { ...value.catalog, card: sides(value.catalog.card, 'radius', ['buttonRadius']) };
  if (isRecord(value.responsive)) result.responsive = Object.fromEntries(Object.entries(value.responsive).map(([key, branch]) => [key, compatibleDimensions(branch)]));
  return result;
}

export interface ResolveVisualOptions {
  template?: unknown;
  legacyColors?: unknown;
  /** Store-wide overrides, followed by overrides for the active template. */
  customization?: unknown;
  templateCustomization?: unknown;
}

/** defaults → preset → legacy colors → store overrides → template overrides. */
export function resolveVisualConfig(options: ResolveVisualOptions = {}): VisualConfig {
  const preset = typeof options.template === 'string' && Object.prototype.hasOwnProperty.call(VISUAL_PRESETS, options.template)
    ? VISUAL_PRESETS[options.template as TemplateId].config : {};
  const store = supportedCustomization(options.customization);
  const template = supportedCustomization(options.templateCustomization);
  const legacy = isRecord(options.legacyColors) ? options.legacyColors : {};
  const { responsive: defaultResponsive, version, ...sections } = VISUAL_DEFAULTS;
  const legacyPatch = { global: { colors: { primary: legacy.primaryColor, secondary: legacy.secondaryColor, accent: legacy.accentColor } } };
  const base = [preset, legacyPatch, store, template].reduce<VisualSections>((current, patch) => mergeKnown(current, compatibleDimensions(patch)), sections);
  const responsiveFor = (value: unknown, viewport: 'tablet' | 'mobile') => isRecord(value) && isRecord(value.responsive) ? compatibleDimensions(value.responsive[viewport]) : undefined;
  return {
    ...base, version,
    responsive: {
      tablet: mergeOverrides(base, defaultResponsive.tablet, responsiveFor(preset, 'tablet'), responsiveFor(store, 'tablet'), responsiveFor(template, 'tablet')),
      mobile: mergeOverrides(base, defaultResponsive.mobile, responsiveFor(preset, 'mobile'), responsiveFor(store, 'mobile'), responsiveFor(template, 'mobile')),
    },
  };
}

/** Mobile inherits tablet, including partial overrides; desktop is the base. */
export function resolveVisualViewport(config: VisualConfig, viewport: Viewport): VisualSections {
  const { responsive, version: _version, ...base } = config;
  const tablet = viewport === 'desktop' ? mergeKnown(base, {}) : mergeKnown(base, responsive.tablet);
  return viewport === 'mobile' ? mergeKnown(tablet, responsive.mobile) : tablet;
}

/** One adaptation boundary for persisted legacy fields, new overrides and editor drafts. */
export function resolveStoreVisualConfig(storeConfig: unknown, templateId?: unknown, draftTheme?: unknown): VisualConfig {
  const store = isRecord(storeConfig) ? storeConfig : {};
  const themes = isRecord(store.themeEditor) ? store.themeEditor : {};
  const theme = isRecord(draftTheme) ? draftTheme : typeof templateId === 'string' && Object.prototype.hasOwnProperty.call(themes, templateId) && isRecord(themes[templateId]) ? themes[templateId] : {};
  const legacy: Record<string, unknown> = {};
  for (const key of ['primaryColor', 'secondaryColor', 'accentColor']) {
    legacy[key] = validLeaf(theme[key], '', key) ? theme[key] : store[key];
  }
  return resolveVisualConfig({ template: templateId ?? store.template, legacyColors: legacy, customization: store.visualConfig, templateCustomization: theme.visualConfig });
}

/** Merge partial persisted overrides without materializing preset/default values. */
export function mergeVisualOverrides(current: VisualConfigOverrides | undefined, patch: VisualConfigOverrides): VisualConfigOverrides {
  const { responsive: _responsive, version: _version, ...sections } = VISUAL_DEFAULTS;
  const base = mergeOverrides(sections, current, patch);
  const breakpoint = (value: VisualConfigOverrides | undefined, key: 'tablet' | 'mobile') => value?.responsive?.[key];
  const tablet = mergeOverrides(sections, breakpoint(current, 'tablet'), breakpoint(patch, 'tablet'));
  const mobile = mergeOverrides(sections, breakpoint(current, 'mobile'), breakpoint(patch, 'mobile'));
  return { ...base, ...(current?.version === 1 || patch.version === 1 ? { version: 1 } : {}),
    ...(Object.keys(tablet).length || Object.keys(mobile).length ? { responsive: { ...(Object.keys(tablet).length ? { tablet } : {}), ...(Object.keys(mobile).length ? { mobile } : {}) } } : {}) };
}

/** Removing a leaf restores inheritance; null is not a persisted reset sentinel. */
export function removeVisualOverride(config: VisualConfigOverrides, path: readonly string[]): VisualConfigOverrides {
  function remove(value: unknown, remaining: readonly string[]): unknown {
    if (!isRecord(value) || !remaining.length) return value;
    const [key, ...rest] = remaining;
    if (!Object.prototype.hasOwnProperty.call(value, key) || ['__proto__', 'constructor', 'prototype'].includes(key)) return value;
    const next = { ...value };
    if (!rest.length) delete next[key];
    else {
      const branch = remove(next[key], rest);
      if (isRecord(branch) && !Object.keys(branch).length) delete next[key];
      else next[key] = branch;
    }
    return next;
  }
  return remove(config, path) as VisualConfigOverrides;
}
