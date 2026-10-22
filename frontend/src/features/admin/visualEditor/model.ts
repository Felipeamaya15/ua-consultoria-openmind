import { readBlockStyles, type BlockStyles } from '../../storefront/visual/blockAppearance';
import type { AdminConfig } from '../types';
import type { TemplateId } from '../../storefront/data/mockData';
import type { LegacyThemeColors, VisualConfig, VisualConfigOverrides } from '../../storefront/visual/types';
import { isRecord, resolveVisualViewport, mergeVisualOverrides, removeVisualOverride, resolveStoreVisualConfig } from '../../storefront/visual/resolveVisualConfig';
import { readThemeImages, type ThemeImageSetting } from '../../storefront/visual/imageSettings';
import type { VisualSectionId } from './sections';
import type { LandingConfig } from '../../landing/types/landing.types';

export interface EditorDocument {
  blockStyles?: BlockStyles;
  /** Read-only content snapshot used for contextual preview. */
  landing?: LandingConfig;
  storeOverrides: VisualConfigOverrides;
  overrides: VisualConfigOverrides;
  storeColors: LegacyThemeColors;
  templateColors: LegacyThemeColors;
  images: Record<string, ThemeImageSetting>;
}
/** Device tools write visual leaves only; tablet edits do not spill into mobile. */
export function editScopedProperty(document: EditorDocument, template: TemplateId, path: string, value: string | number | boolean, scope: 'all' | 'device' = 'all', viewport: 'desktop' | 'tablet' | 'mobile' = 'desktop'): EditorDocument {
  if (scope === 'device' && path.includes('.columns.')) return editProperty(document, path, value);
  if (scope === 'device' && viewport === 'desktop' && !path.startsWith('responsive.')) {
    const effective = resolveEditorDocument(document, template);
    let next = editProperty(document, path, value);
    for (const device of ['tablet', 'mobile'] as const) {
      const previous = readPath(resolveVisualViewport(effective, device), path);
      if (typeof previous === 'string' || typeof previous === 'number' || typeof previous === 'boolean') next = editProperty(next, `responsive.${device}.${path}`, previous);
    }
    return next;
  }
  const tabletPrefix = 'responsive.tablet.';
  if (path.startsWith(tabletPrefix)) {
    const leaf = path.slice(tabletPrefix.length);
    const current = resolveEditorDocument(document, template);
    const mobile = readPath(resolveVisualViewport(current, 'mobile'), leaf);
    const next = editProperty(document, path, value);
    return typeof mobile === 'string' || typeof mobile === 'number' || typeof mobile === 'boolean' ? editProperty(next, `responsive.mobile.${leaf}`, mobile) : next;
  }
  if (path.startsWith('responsive.')) return editProperty(document, path, value);
  // An explicit general edit re-establishes inheritance for this property only.
  let next = document;
  for (const device of ['tablet', 'mobile']) next = resetProperty(next, `responsive.${device}.${path}`);
  next = editProperty(next, path, value);
  if (path.endsWith('.columns.desktop') && typeof value === 'number') {
    const root = path.slice(0, -'desktop'.length);
    next = editProperty(next, root + 'tablet', Math.min(value, 2));
    next = editProperty(next, root + 'mobile', 1);
  }
  return next;
}
const colorKeys = ['primaryColor', 'secondaryColor', 'accentColor'] as const;
const colorNames = { primaryColor: 'primary', secondaryColor: 'secondary', accentColor: 'accent' } as const;
function colors(value: unknown): LegacyThemeColors {
  const record = isRecord(value) ? value : {};
  return Object.fromEntries(colorKeys.filter(key => typeof record[key] === 'string').map(key => [key, record[key]]));
}
export function createEditorDocument(config: AdminConfig, template: TemplateId, raw: unknown): EditorDocument {
  const store = isRecord(raw) ? raw : {};
  const themes = isRecord(store.themeEditor) ? store.themeEditor : {};
  const theme = isRecord(themes[template]) ? themes[template] : {};
  return { ...(config.themeEditor[template]?.blockStyles ? {blockStyles:readBlockStyles(config.themeEditor[template]?.blockStyles)} : {}), storeOverrides: mergeVisualOverrides(config.visualConfig, {}), overrides: mergeVisualOverrides(config.themeEditor[template]?.visualConfig, {}), storeColors: colors(store), templateColors: colors(theme), images: readThemeImages(config.themeEditor[template]?.images) };
}
export function resolveEditorDocument(document: EditorDocument, template: TemplateId): VisualConfig {
  return resolveStoreVisualConfig({ ...document.storeColors, visualConfig: document.storeOverrides }, template, { ...document.templateColors, visualConfig: document.overrides });
}
export function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => isRecord(current) ? current[key] : undefined, value);
}
export function editProperty(document: EditorDocument, path: string, value: string | number | boolean): EditorDocument {
  const patch = path.split('.').reduceRight<unknown>((branch, key) => ({ [key]: branch }), value);
  return { ...document, overrides: mergeVisualOverrides(document.overrides, patch as VisualConfigOverrides) };
}
export function resetProperty(document: EditorDocument, path: string): EditorDocument {
  const next = { ...document, overrides: removeVisualOverride(document.overrides, path.split('.')), storeOverrides: removeVisualOverride(document.storeOverrides, path.split('.')), templateColors: { ...document.templateColors }, storeColors: { ...document.storeColors } };
  for (const key of colorKeys) if (path === `global.colors.${colorNames[key]}` || path === 'global' || path === 'global.colors') { delete next.templateColors[key]; delete next.storeColors[key]; }
  return next;
}
export function sectionOverridePath(section: VisualSectionId, catalogPage: boolean, page: import('../../storefront/visual/pages').StorePageId = 'login'): string {
  const groups: Partial<Record<VisualSectionId, string>> = { pageLayout: 'layout', pagePanel: 'panel', pageField: 'field', pageButton: 'button' };
  if (groups[section]) return `pages.${page}.${groups[section]}`;
  return catalogPage && section === 'productCard' ? 'catalog.card' : catalogPage && section === 'productGrid' ? 'catalog.grid' : section;
}
export function resetSection(document: EditorDocument, section: string): EditorDocument {
  let result = resetProperty(document, section);
  for (const viewport of ['tablet', 'mobile']) result = resetProperty(result, `responsive.${viewport}.${section}`);
  return result;
}
export function restorePreset(document: EditorDocument): EditorDocument {
  return { ...document, overrides: {}, storeOverrides: {}, storeColors: {}, templateColors: {}, blockStyles: {} };
}
export const isEditorDirty = (document: EditorDocument, baseline: EditorDocument) => JSON.stringify(document) !== JSON.stringify(baseline);
/** Sparse legacy fields are deleted at the persistence boundary; repository rehydrates UI. */
export function publishEditorDocument(config: AdminConfig, template: TemplateId, document: EditorDocument): AdminConfig {
  const next = { ...config, template, visualConfig: document.storeOverrides, themeEditor: { ...config.themeEditor, [template]: { ...config.themeEditor[template], visualConfig: document.overrides, images: document.images, ...(document.blockStyles ? {blockStyles:readBlockStyles(document.blockStyles)} : {}) } } };
  for (const key of colorKeys) {
    if (document.storeColors[key] === undefined) Reflect.deleteProperty(next, key);
    else next[key] = document.storeColors[key]!;
    if (document.templateColors[key] === undefined) Reflect.deleteProperty(next.themeEditor[template], key);
    else next.themeEditor[template][key] = document.templateColors[key]!;
  }
  return next;
}
