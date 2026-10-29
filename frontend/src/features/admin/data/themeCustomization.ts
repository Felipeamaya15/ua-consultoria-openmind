import { readBlockStyles } from '../../storefront/visual/blockAppearance';
import type { TemplateId } from '../../storefront/data/mockData';
import { isRecord, mergeVisualOverrides, resolveStoreVisualConfig } from '../../storefront/visual/resolveVisualConfig';
import type { LegacyThemeColors } from '../../storefront/visual/types';
import type { ThemeTemplateCustomization } from '../types';
import { readThemeImages } from '../../storefront/visual/imageSettings';

/** Hydrate legacy/partial data without persisting the expanded visual defaults. */
export function loadThemeCustomization(template: TemplateId, value?: unknown, legacyColors?: LegacyThemeColors, storeCustomization?: unknown): ThemeTemplateCustomization {
  const saved = isRecord(value) ? value : {};
  const colors = resolveStoreVisualConfig({ ...legacyColors, visualConfig: storeCustomization }, template, saved).global.colors;
  return {
    ...saved,
    ...(saved.blockStyles ? {blockStyles:readBlockStyles(saved.blockStyles)} : {}),
    primaryColor: colors.primary, secondaryColor: colors.secondary, accentColor: colors.accent,
    paletteName: typeof saved.paletteName === 'string' ? saved.paletteName : 'Original',
    images: readThemeImages(saved.images),
  };
}

/** Color controls keep explicit v1 color overrides in sync with legacy fields. */
export function patchThemeCustomization(theme: ThemeTemplateCustomization, patch: Partial<ThemeTemplateCustomization>): ThemeTemplateCustomization {
  const next = { ...theme, ...patch, images: patch.images ?? theme.images,
    ...(patch.visualConfig ? { visualConfig: mergeVisualOverrides(theme.visualConfig, patch.visualConfig) } : {}) };
  if (patch.primaryColor !== undefined || patch.secondaryColor !== undefined || patch.accentColor !== undefined) {
    next.visualConfig = {
      ...next.visualConfig,
      version: next.visualConfig?.version ?? 1,
      global: { ...next.visualConfig?.global, colors: {
        ...next.visualConfig?.global?.colors,
        ...(patch.primaryColor !== undefined ? { primary: patch.primaryColor } : {}),
        ...(patch.secondaryColor !== undefined ? { secondary: patch.secondaryColor } : {}),
        ...(patch.accentColor !== undefined ? { accent: patch.accentColor } : {}),
      } },
    };
  }
  return next;
}

const EDITOR_COLOR_PATHS = ['global.colors.background', 'global.colors.text', 'global.colors.surface', 'global.colors.border', 'header.background', 'header.textColor', 'topBar.background', 'topBar.textColor', 'footer.background', 'footer.textColor'];

export function clearEditorColorOverrides(overrides: ThemeTemplateCustomization['visualConfig']): ThemeTemplateCustomization['visualConfig'] {
  if (!isRecord(overrides)) return overrides;
  const omit = (node: unknown): Record<string, unknown> => {
    const copy = JSON.parse(JSON.stringify(node)) as Record<string, unknown>;
    for (const path of EDITOR_COLOR_PATHS) {
      const keys = path.split('.');
      let current: unknown = copy;
      for (const key of keys.slice(0, -1)) current = isRecord(current) ? current[key] : undefined;
      if (isRecord(current)) delete current[keys[keys.length - 1]];
    }
    return copy;
  };
  const base = omit(overrides);
  const responsive = isRecord(base.responsive) ? base.responsive : undefined;
  if (responsive) for (const viewport of ['tablet', 'mobile']) if (isRecord(responsive[viewport])) responsive[viewport] = omit(responsive[viewport]);
  return base as ThemeTemplateCustomization['visualConfig'];
}
