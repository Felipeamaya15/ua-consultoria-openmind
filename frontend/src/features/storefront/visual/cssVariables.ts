import type { CSSProperties } from 'react';
import type { FontFamily, Shadow, VisualConfig, VisualSections, Viewport } from './types';
import { resolveVisualViewport } from './resolveVisualConfig';
import { VIEWPORTS } from './types';
import { institutionalTextColor } from './contrast';

export const fonts: Record<FontFamily, string> = { sans: '"Plus Jakarta Sans", sans-serif', serif: '"DM Serif Display", Georgia, serif', system: 'system-ui, sans-serif', arial: 'Arial, Helvetica, sans-serif', calibri: 'Calibri, "Segoe UI", Arial, sans-serif', cambria: 'Cambria, Georgia, serif', georgia: 'Georgia, serif', times: '"Times New Roman", Times, serif', verdana: 'Verdana, sans-serif', tahoma: 'Tahoma, sans-serif', trebuchet: '"Trebuchet MS", sans-serif', courier: '"Courier New", Courier, monospace', garamond: 'Garamond, Georgia, serif', palatino: '"Palatino Linotype", Palatino, serif', comic: '"Comic Sans MS", cursive' };
const shadows: Record<Shadow, string> = { none: 'none', soft: '0 2px 8px #0000000d', medium: '0 6px 20px #00000014', strong: '0 12px 32px #00000026' };
const px = (value: number) => `${value}px`;
const flexAlign = (value: string) => value === 'left' || value === 'top' ? 'flex-start' : value === 'right' || value === 'bottom' ? 'flex-end' : 'center';
const radius = (shape: string, value: number) => shape === 'pill' ? '999px' : shape === 'square' ? '0px' : px(value);
const border = (value: VisualSections['header']['border']) => `${value.width}px ${value.style} ${value.color}`;
function sectionVariables(config: VisualSections, viewport: Viewport): Record<string, string> {
  const colors = config.global.colors;
  const grid = (g: VisualSections['productGrid']) => ({ columns: String(g.columns[viewport]), gapX: px(g.gapX), gapY: px(g.gapY), maxWidth: px(g.maxWidth) });
  const card = (c: VisualSections['productCard']) => ({ radius: px(c.radius), padding: px(c.padding), shadow: shadows[c.shadow], border: border(c.border), imageRatio: String(c.imageRatio), imageRadius: px(c.imageRadius), titleSize: px(c.titleSize), priceSize: px(c.priceSize), descriptionDisplay: c.showDescription ? '-webkit-box' : 'none', buttonDisplay: c.buttonVisible ? 'inline-flex' : 'none', buttonWidth: c.buttonFullWidth ? '100%' : 'auto', buttonRadius: radius(c.buttonShape, c.buttonRadius), align: c.align, density: c.density === 'compact' ? '.85' : c.density === 'spacious' ? '1.15' : '1' });
  const variables: Record<string, string> = {
    '--primary': colors.primary, '--secondary': colors.secondary, '--accent': colors.accent, '--ring': colors.primary,
    '--visual-background': colors.background, '--visual-text': colors.text, '--radius': px(config.global.radius),
    '--visual-body-font': fonts[config.global.typography.body], '--visual-heading-font': fonts[config.global.typography.heading], '--visual-font-size': px(config.global.typography.baseSize), '--visual-line-height': String(config.global.typography.lineHeight),
    '--visual-content-width': px(config.global.contentMaxWidth),
    '--visual-topbar-display': config.topBar.visible ? 'flex' : 'none', '--visual-topbar-bg': config.topBar.background, '--visual-topbar-color': config.topBar.textColor, '--visual-topbar-height': px(config.topBar.height), '--visual-topbar-align': config.topBar.align === 'left' ? 'flex-start' : config.topBar.align === 'right' ? 'flex-end' : 'center',
  };
  const add = (prefix: string, values: Record<string, string>) => {
    for (const [key, value] of Object.entries(values)) variables[`--visual-${prefix}-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`] = value;
  };
  add('grid', grid(config.productGrid));
  add('card', card(config.productCard));
  add('catalog-grid', grid(config.catalog.grid));
  add('catalog-card', card(config.catalog.card));
  add('global', { surface: colors.surface, border: colors.border, spacing: px(config.global.baseSpacing), density: config.global.density === 'compact' ? '.8' : config.global.density === 'spacious' ? '1.25' : '1' });
  add('topbar', { fontSize: px(config.topBar.fontSize) });
  for (const [id, page] of Object.entries(config.pages)) {
    const { layout: l, panel: p, field: f, button: b, content: d } = page;
    const pageBorder = (value: typeof p.border) => border({ ...value, color: value.color === 'currentColor' ? colors.border : value.color });
    add(`page-${id}`, { imageRatio: String(d.imageRatio), optionSize: px(d.optionSize), quantityWidth: px(d.quantityWidth), formMarginLeft: d.align === 'left' ? '0' : 'auto', formMarginRight: d.align === 'right' ? '0' : 'auto', contentColumns: d.layout === 'stack' ? 'minmax(0,1fr)' : `minmax(0,${Math.max(10, Math.min(90, d.imageWidth))}fr) minmax(0,${100 - Math.max(10, Math.min(90, d.imageWidth))}fr)`, imageSize: px(d.imageSize), imageRadius: px(d.imageRadius), gallerySize: px(d.gallerySize), infoSize: px(d.infoSize), priceSize: px(d.priceSize), formWidth: px(d.formWidth), width: px(l.maxWidth), padding: px(l.padding), gap: px(l.gap), background: l.background, color: l.textColor === 'currentColor' ? colors.text : l.textColor, titleSize: px(l.titleSize), align: l.titleAlign,
      panelBackground: p.background === 'currentColor' ? colors.surface : p.background, panelRadius: px(p.radius), panelPadding: px(p.padding), panelBorder: pageBorder(p.border), panelShadow: shadows[p.shadow],
      fieldBackground: f.background === 'currentColor' ? colors.surface : f.background, fieldColor: f.textColor === 'currentColor' ? colors.text : f.textColor, fieldRadius: px(f.radius), fieldPadding: px(f.padding), fieldBorder: pageBorder(f.border),
      buttonBackground: b.background === 'currentColor' ? colors.primary : b.background, buttonColor: b.textColor, buttonRadius: px(b.radius), buttonPaddingX: px(b.paddingX), buttonPaddingY: px(b.paddingY), buttonFontSize: px(b.fontSize) });
  }
  variables['--visual-topbar-brand-color'] = institutionalTextColor(config.topBar.background, colors.background);
  variables['--visual-footer-brand-color'] = institutionalTextColor(config.footer.background, colors.background);
  const h = config.header;
  add('header', { bg: h.background, color: h.textColor, height: px(h.height), logoSize: px(h.logoSize), logoOrder: h.logoPosition === 'right' ? '3' : h.logoPosition === 'center' ? '1' : '0', navAlign: flexAlign(h.navAlign), gap: px(h.gap), border: border(h.border), shadow: shadows[h.shadow], position: h.sticky ? 'sticky' : 'relative', direction: h.layout === 'centered' ? 'column' : 'row' });
  const hero = config.hero;
  add('hero', { height: px(hero.height), imagePosition: hero.imagePosition, width: px(hero.contentWidth), horizontal: flexAlign(hero.horizontalAlign), vertical: flexAlign(hero.verticalAlign), align: hero.horizontalAlign, overlay: hero.overlay ? String(hero.overlayOpacity) : '0', overlayColor: hero.overlayColor, titleSize: px(hero.titleSize), subtitleSize: px(hero.subtitleSize), textWidth: px(hero.textMaxWidth), gap: px(hero.gap), ctaDisplay: hero.ctaPosition === 'inline' ? 'inline-flex' : 'flex', ctaLayoutWidth: hero.ctaPosition === 'inline' ? 'fit-content' : '100%' });
  const cta = config.heroCta;
  const ctaColor = cta.background === 'currentColor' ? colors.primary : cta.background;
  add('cta', { width: cta.width === 'full' ? '100%' : cta.width === 'custom' ? px(cta.customWidth) : 'auto', align: flexAlign(cta.align), paddingX: px(cta.paddingX), paddingY: px(cta.paddingY), fontSize: px(cta.fontSize), fontWeight: String(cta.fontWeight), radius: radius(cta.shape, cta.radius), background: cta.variant === 'solid' ? ctaColor : 'transparent', color: cta.textColor, border: cta.variant === 'ghost' ? '0 solid transparent' : border(cta.border) });
  const cat = config.categories;
  add('categories', { display: cat.layout === 'grid' ? 'grid' : 'flex', wrap: cat.layout === 'row' ? 'nowrap' : 'wrap', columns: String(cat.columns), gap: px(cat.gap), radius: cat.presentation === 'pills' ? '999px' : cat.presentation === 'links' ? '0px' : px(cat.radius), padding: cat.presentation === 'links' ? '0px' : px(cat.padding), textSize: px(cat.textSize), align: cat.align, justify: flexAlign(cat.align), border: cat.presentation === 'links' ? '0 solid transparent' : border(cat.border), shadow: cat.presentation === 'links' ? 'none' : shadows[cat.shadow], background: cat.presentation === 'links' ? 'transparent' : cat.background, ratio: cat.presentation === 'cards' ? '1' : 'auto', imageDisplay: cat.presentation === 'cards' ? 'block' : 'none' });
  for (const [key, s] of Object.entries(config.sections)) add(`section-${key}`, { paddingTop: px(s.paddingTop), paddingBottom: px(s.paddingBottom), width: px(s.contentWidth), background: s.background, titleAlign: s.titleAlign, titleSize: px(s.titleSize), subtitleSize: px(s.subtitleSize) });
  for (const key of ['contact', 'location'] as const) {
    const s = config[key];
    add(key, { radius: px(s.cardRadius), border: border(s.border), shadow: shadows[s.shadow], columns: String(s.layout === 'stack' ? 1 : s.layout === 'split' ? Math.min(2, s.columns) : s.columns), padding: px(s.padding), background: s.background, titleSize: px(s.titleSize) });
  }
  const f = config.footer;
  add('footer', { background: f.background, color: f.textColor, columns: String(f.layout === 'stack' ? 1 : f.columns), align: f.layout === 'centered' ? 'center' : f.align, paddingTop: px(f.paddingTop), paddingBottom: px(f.paddingBottom), gap: px(f.gap), titleSize: px(f.titleSize), branding: 'block', width: px(Math.max(320, f.maxWidth)), titles: f.showTitles ? 'block' : 'none' });
  add('catalog', { titleAlign: config.catalog.titleAlign, titleSize: px(config.catalog.titleSize), spacing: px(config.catalog.spacing), width: px(config.catalog.contentWidth), filtersDisplay: config.catalog.filtersPosition === 'drawer' ? 'none' : 'block', layout: config.catalog.filtersPosition === 'left' ? 'row' : 'column', filtersWidth: config.catalog.filtersPosition === 'left' ? '260px' : config.catalog.filtersPosition === 'drawer' ? '320px' : '100%', filtersToggle: config.catalog.filtersPosition === 'drawer' ? 'inline-flex' : 'none' });
  return variables;
}

/** Variables stay on the template wrapper and never contaminate the admin document. */
export function visualConfigToCssVariables(config: VisualConfig): CSSProperties {
  const result: Record<string, string> = {};
  for (const viewport of VIEWPORTS) {
    for (const [key, value] of Object.entries(sectionVariables(resolveVisualViewport(config, viewport), viewport))) {
      result[`${key}-${viewport}`] = value;
    }
  }
  return result as CSSProperties;
}
