import { createDefaultAdminConfig } from './mockAdminData';
import type { AdminConfig } from '../types';
import { loadThemeCustomization } from './themeCustomization';
import { isRecord } from '../../storefront/visual/resolveVisualConfig';
import { readStoredStoreConfig, saveStoredStoreConfig, type StoreIdentity } from '../../storefront/visual/storage';
const templates = ['editorial', 'minimal', 'visual', 'catalog'] as const;
const colorKeys = ['primaryColor', 'secondaryColor', 'accentColor'] as const;
const visualColorKeys = { primaryColor: 'primary', secondaryColor: 'secondary', accentColor: 'accent' } as const;

function hydrate(config: Record<string, unknown>): AdminConfig {
  const defaults = createDefaultAdminConfig();
  const themes = isRecord(config.themeEditor) ? config.themeEditor : {};
  return {...defaults,...config, template: templates.find(template => template === config.template) ?? defaults.template, themeEditor: {
        editorial: loadThemeCustomization('editorial', themes.editorial, config, config.visualConfig),
        minimal: loadThemeCustomization('minimal', themes.minimal, config, config.visualConfig),
        visual: loadThemeCustomization('visual', themes.visual, config, config.visualConfig),
        catalog: loadThemeCustomization('catalog', themes.catalog, config, config.visualConfig),
      }};
}

/** Effective colors are UI conveniences, not implicit persisted overrides. */
function storedOverrides(config: AdminConfig, previous: Record<string, unknown>): Record<string, unknown> {
  const baseline = hydrate(previous);
  const result: Record<string, unknown> = { ...config };
  for (const key of colorKeys) {
    if (config[key] === baseline[key]) {
      if (Object.prototype.hasOwnProperty.call(previous, key)) result[key] = previous[key];
      else delete result[key];
    }
  }
  const previousThemes = isRecord(previous.themeEditor) ? previous.themeEditor : {};
  const themes: Record<string, unknown> = { ...previousThemes };
  for (const template of templates) {
    const next = config.themeEditor[template];
    const old = isRecord(previousThemes[template]) ? previousThemes[template] : {};
    const persisted: Record<string, unknown> = { ...next };
    for (const key of colorKeys) {
      if (next.visualConfig?.global?.colors?.[visualColorKeys[key]] !== undefined) delete persisted[key];
      else if (next[key] === baseline.themeEditor[template][key]) {
        if (Object.prototype.hasOwnProperty.call(old, key)) persisted[key] = old[key];
        else delete persisted[key];
      }
    }
    if (!Object.keys(next.images).length && !Object.prototype.hasOwnProperty.call(old, 'images')) delete persisted.images;
    if (next.paletteName === 'Original' && !Object.prototype.hasOwnProperty.call(old, 'paletteName')) delete persisted.paletteName;
    if (Object.keys(persisted).length) themes[template] = persisted;
    else delete themes[template];
  }
  if (Object.keys(themes).length) result.themeEditor = themes;
  else delete result.themeEditor;
  return result;
}

// Single persistence boundary: replace with the Django repository later.
export const adminRepository = {
  load(identity: StoreIdentity | null = null): AdminConfig {
    return hydrate(readStoredStoreConfig(identity));
  },
  save(config: AdminConfig, identity: StoreIdentity) {
    if (!identity) throw new Error('No se ha confirmado la identidad de la tienda.');
    saveStoredStoreConfig(storedOverrides(config, readStoredStoreConfig(identity)), identity);
  },
};
