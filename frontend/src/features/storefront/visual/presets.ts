import type { TemplateId } from '../data/mockData';
import type { VisualPreset } from './types';
import { STORE_PAGES } from './pages';

/** Each preset extends the complete baseline; stable IDs retain legacy routes/storage. */
export const VISUAL_PRESETS: Record<TemplateId, VisualPreset> = {
  editorial: { id: 'editorial', name: 'Studio Pop', config: {
    global: { radius: 8, density: 'normal', colors: { background: '#fafaf8' } },
    header: { layout: 'inline', height: 64, gap: 24, background: '#ffffff' },
    hero: { height: 640, titleSize: 72, horizontalAlign: 'left', gap: 24 },
    heroCta: { shape: 'rounded', radius: 8 },
    productCard: { radius: 12, padding: 12, shadow: 'soft' },
    sections: { featured: { paddingY: 64 }, content: { paddingY: 64 } },
    footer: { layout: 'columns', background: '#1a3a6b', columns: 4, padding: 48 },
  } },
  minimal: { id: 'minimal', name: 'Soft Discovery', config: {
    global: { colors: { primary: '#5433eb', secondary: '#f0edff', accent: '#5433eb', background: '#f5f5f3', text: '#151515' }, typography: { heading: 'sans' }, radius: 28, density: 'spacious', contentMaxWidth: 1200 },
    header: { layout: 'centered', height: 80, gap: 32, linkStyle: 'pill', border: { width: 0 }, sticky: false },
    hero: { height: 680, titleSize: 118, horizontalAlign: 'center', overlay: false, textMaxWidth: 820, gap: 32 },
    heroCta: { shape: 'pill', radius: 28, align: 'center', paddingX: 40 },
    categories: { layout: 'wrap', presentation: 'pills', radius: 28, gap: 16 },
    productGrid: { maxWidth: 1200, gapX: 16, gapY: 16 },
    productCard: { radius: 20, padding: 16, titleSize: 15, shadow: 'soft', density: 'spacious', buttonShape: 'pill' },
    catalog: { card: { radius: 20, padding: 16, titleSize: 15, shadow: 'soft', buttonShape: 'pill' } },
    sections: { content: { paddingY: 80, contentWidth: 1200 }, featured: { paddingY: 80, contentWidth: 1200 } },
    contact: { cardRadius: 20, padding: 28 }, location: { cardRadius: 20 },
    footer: { layout: 'centered', background: '#f5f5f3', textColor: '#151515', padding: 64, columns: 3, maxWidth: 1200 },
    responsive: { tablet: { hero: { titleSize: 92 } }, mobile: { hero: { titleSize: 72, height: 560 } } },
  } },
  visual: { id: 'visual', name: 'Velta Editorial', config: {
    global: { colors: { primary: '#111111', secondary: '#f2f1ef', accent: '#111111', background: '#ffffff', text: '#111111' }, radius: 0, baseSpacing: 8, contentMaxWidth: 1440, density: 'spacious' },
    header: { layout: 'split', height: 72, gap: 24, border: { width: 4, color: '#111111' }, sticky: false },
    hero: { height: 760, contentWidth: 1440, titleSize: 96, overlayOpacity: 0.45, textMaxWidth: 720, verticalAlign: 'bottom' },
    heroCta: { shape: 'square', radius: 0, variant: 'outline', paddingX: 36 },
    categories: { presentation: 'links', layout: 'row', radius: 0 },
    productGrid: { columns: { desktop: 2 }, gapX: 16, gapY: 16, maxWidth: 1440 },
    productCard: { radius: 10, border: { width: 0 }, padding: 20, imageRatio: 1, titleSize: 20, showDescription: true, buttonFullWidth: false, buttonShape: 'square' },
    catalog: { filtersPosition: 'drawer', card: { radius: 10, border: { width: 0 }, padding: 20, imageRatio: 1, titleSize: 20, showDescription: true, buttonFullWidth: false, buttonShape: 'square' } },
    sections: { content: { paddingY: 96, contentWidth: 1440 }, featured: { paddingY: 96, contentWidth: 1440 } },
    contact: { cardRadius: 0, layout: 'split' }, location: { cardRadius: 0 },
    footer: { background: '#111111', layout: 'columns', columns: 3, padding: 80, maxWidth: 1440 },
  } },
  catalog: { id: 'catalog', name: 'Obsidian Showcase', config: {
    global: { colors: { primary: '#ff5a1f', secondary: '#202022', accent: '#ff5a1f', background: '#050505', text: '#ffffff', surface: '#121214', border: '#303033' }, typography: { heading: 'sans' }, radius: 14, contentMaxWidth: 1160, density: 'compact' },
    header: { layout: 'centered', height: 80, background: '#050505', shadow: 'strong', linkStyle: 'pill', border: { width: 0 } },
    hero: { height: 720, contentWidth: 1320, titleSize: 82, overlayOpacity: 0.55, gap: 32 },
    heroCta: { shape: 'pill', radius: 28, fontWeight: 800 },
    categories: { presentation: 'links', columns: 4, radius: 0 },
    productGrid: { columns: { desktop: 3 }, gapX: 16, gapY: 16, maxWidth: 1160 },
    productCard: { radius: 14, border: { width: 0 }, imageRatio: 1.08, padding: 20, titleSize: 17, showDescription: true, buttonShape: 'pill', density: 'compact' },
    catalog: { titleAlign: 'left', filtersPosition: 'top', spacing: 28, grid: { maxWidth: 1160, gapX: 16, gapY: 16 }, card: { radius: 14, border: { width: 0 }, imageRatio: 1.08, padding: 20, titleSize: 17, showDescription: true, buttonShape: 'pill', density: 'compact' } },
    sections: { content: { paddingY: 96, contentWidth: 1160 }, featured: { paddingY: 96, contentWidth: 1160 } },
    contact: { cardRadius: 16, border: { color: '#303033' } }, location: { cardRadius: 16, border: { color: '#303033' } },
    footer: { background: '#050505', columns: 4, layout: 'columns', padding: 64, maxWidth: 1160 },
  } },
};

// Page consumers inherit each preset's existing geometry. Explicit page overrides
// still enter later through the single central resolver.
for (const preset of Object.values(VISUAL_PRESETS)) {
  const radius = preset.config.global?.radius;
  preset.config.pages = Object.fromEntries(STORE_PAGES.map(({ id }) => [id, {
    panel: { radius, shadow: preset.config.productCard?.shadow ?? 'none' },
    field: { radius }, button: { radius },
  }]));
}
