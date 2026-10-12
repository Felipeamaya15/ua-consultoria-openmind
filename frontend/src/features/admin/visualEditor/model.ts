import type { AdminConfig } from '../types';
import type { TemplateId } from '../../storefront/data/mockData';
import type { LegacyThemeColors, VisualConfig, VisualConfigOverrides } from '../../storefront/visual/types';
import { isRecord, mergeVisualOverrides, removeVisualOverride, resolveStoreVisualConfig } from '../../storefront/visual/resolveVisualConfig';
import { readThemeImages, type ThemeImageSetting } from '../../storefront/visual/imageSettings';
import type { VisualSectionId } from './sections';

export interface EditorDocument {
  storeOverrides: VisualConfigOverrides;
  overrides: VisualConfigOverrides;
  storeColors: LegacyThemeColors;
  templateColors: LegacyThemeColors;
  images: Record<string, ThemeImageSetting>;
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
  return { storeOverrides: mergeVisualOverrides(config.visualConfig, {}), overrides: mergeVisualOverrides(config.themeEditor[template]?.visualConfig, {}), storeColors: colors(store), templateColors: colors(theme), images: readThemeImages(config.themeEditor[template]?.images) };
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
  return { ...document, overrides: {}, storeOverrides: {}, storeColors: {}, templateColors: {} };
}
export const isEditorDirty = (document: EditorDocument, baseline: EditorDocument) => JSON.stringify(document) !== JSON.stringify(baseline);
/** Sparse legacy fields are deleted at the persistence boundary; repository rehydrates UI. */
export function publishEditorDocument(config: AdminConfig, template: TemplateId, document: EditorDocument): AdminConfig {
  const next = { ...config, template, visualConfig: document.storeOverrides, themeEditor: { ...config.themeEditor, [template]: { ...config.themeEditor[template], visualConfig: document.overrides, images: document.images } } };
  for (const key of colorKeys) {
    if (document.storeColors[key] === undefined) Reflect.deleteProperty(next, key);
    else next[key] = document.storeColors[key]!;
    if (document.templateColors[key] === undefined) Reflect.deleteProperty(next.themeEditor[template], key);
    else next.themeEditor[template][key] = document.templateColors[key]!;
  }
  return next;
}
