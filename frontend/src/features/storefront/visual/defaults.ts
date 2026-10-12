import type { BorderConfig, InfoConfig, PageAppearance, ProductCardConfig, SectionConfig, VisualConfig } from './types';
import { STORE_PAGES } from './pages';

const border: BorderConfig = { width: 1, color: '#dde3f0', style: 'solid' };
const section: SectionConfig = { paddingY: 64, paddingTop: 64, paddingBottom: 64, contentWidth: 1280, background: 'transparent', titleAlign: 'left', titleSize: 32, subtitleSize: 16 };
const info: InfoConfig = { cardRadius: 12, border, shadow: 'none', layout: 'grid', columns: 3, padding: 24, background: 'transparent', titleSize: 32 };
const grid = { columns: { desktop: 4, tablet: 2, mobile: 1 }, gapX: 20, gapY: 20, maxWidth: 1280 };
const card: ProductCardConfig = { radius: 12, border, shadow: 'none', padding: 12, imageRatio: 4 / 3, imageRadius: 0, titleSize: 14, priceSize: 16, showDescription: false, buttonVisible: true, buttonFullWidth: true, buttonShape: 'rounded', buttonRadius: 12, align: 'left', density: 'normal' };
const hero: VisualConfig['hero'] = { height: 600, imagePosition: 'center', contentWidth: 1280, horizontalAlign: 'left', verticalAlign: 'center', overlay: true, overlayColor: '#000000', overlayOpacity: 0.35, titleSize: 72, subtitleSize: 20, textMaxWidth: 640, gap: 24, ctaPosition: 'below' };
const page: PageAppearance = {
  content: { imageRatio: 1, optionSize: 14, quantityWidth: 132, align: 'center', layout: 'split', imageWidth: 50, imageSize: 520, imageRadius: 12, gallerySize: 72, infoSize: 16, priceSize: 28, formWidth: 560 },
  layout: { maxWidth: 1280, padding: 16, gap: 24, background: 'transparent', textColor: 'currentColor', titleSize: 36, titleAlign: 'left' },
  panel: { background: 'currentColor', radius: 12, padding: 24, border: { ...border, color: 'currentColor' }, shadow: 'none' },
  field: { background: 'currentColor', textColor: 'currentColor', radius: 8, padding: 12, border: { ...border, color: 'currentColor' } },
  button: { background: 'currentColor', textColor: '#ffffff', radius: 8, paddingX: 24, paddingY: 12, fontSize: 16 },
};

/** Immutable by convention. Resolvers always return fresh, independently mutable data. */
export const VISUAL_DEFAULTS: VisualConfig = {
  version: 1,
  pages: Object.fromEntries(STORE_PAGES.map(({ id }) => [id, { ...structuredClone(page), content: { ...page.content, imageSize: id === 'cart' ? 96 : page.content.imageSize, priceSize: id === 'cart' ? 16 : page.content.priceSize } }])) as VisualConfig['pages'],
  global: {
    colors: { primary: '#1a3a6b', secondary: '#eef1f8', accent: '#e04b1a', background: '#fafaf8', text: '#0f1623', surface: '#ffffff', border: '#dde3f0' },
    typography: { body: 'sans', heading: 'serif', baseSize: 16, lineHeight: 1.5 },
    radius: 8, baseSpacing: 8, contentMaxWidth: 1280, density: 'normal',
  },
  topBar: { visible: true, background: '#1a3a6b', textColor: '#ffffff', height: 48, align: 'center', fontSize: 12 },
  header: { layout: 'inline', height: 64, logoPosition: 'left', logoSize: 44, navAlign: 'center', gap: 24, linkStyle: 'plain', border, shadow: 'none', background: '#ffffff', textColor: 'currentColor', sticky: true },
  hero,
  heroCta: { size: 'medium', paddingX: 32, paddingY: 16, width: 'auto', customWidth: 320, align: 'left', radius: 8, shape: 'rounded', variant: 'solid', fontSize: 16, fontWeight: 600, border: { ...border, width: 1 }, background: 'currentColor', textColor: '#ffffff' },
  categories: { layout: 'grid', columns: 6, gap: 12, presentation: 'cards', radius: 12, padding: 16, textSize: 14, align: 'center', border, shadow: 'none', background: 'transparent' },
  productGrid: grid,
  productCard: card,
  sections: { content: section, featured: section, benefits: { ...section, paddingY: 16, paddingTop: 16, paddingBottom: 16 } },
  info,
  contact: info,
  location: { ...info, columns: 1, layout: 'split', padding: 32 },
  footer: { background: '#1a3a6b', textColor: '#ffffff', layout: 'columns', columns: 4, align: 'left', padding: 48, paddingTop: 48, paddingBottom: 48, gap: 32, titleSize: 16, showTitles: true, brandingVisible: true, maxWidth: 1280 },
  catalog: { heroEnabled: false, hero, titleAlign: 'left', titleSize: 36, contentWidth: 1280, filtersPosition: 'left', grid: { ...grid, columns: { desktop: 3, tablet: 2, mobile: 1 }, gapX: 24, gapY: 24 }, spacing: 32, card },
  responsive: {
    tablet: { hero: { height: 520, titleSize: 56 }, categories: { columns: 3 }, footer: { columns: 2 } },
    mobile: { hero: { height: 480, titleSize: 40, subtitleSize: 16 }, header: { gap: 12, logoSize: 40 }, categories: { columns: 2 }, footer: { columns: 1 }, contact: { columns: 1 }, info: { columns: 1 } },
  },
};
