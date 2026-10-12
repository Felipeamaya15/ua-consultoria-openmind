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
