import type { TemplateId } from '../data/mockData';

export const ALIGNMENTS = ['left', 'center', 'right'] as const;
export const DENSITIES = ['compact', 'normal', 'spacious'] as const;
export const SHAPES = ['square', 'rounded', 'pill'] as const;
export const SHADOWS = ['none', 'soft', 'medium', 'strong'] as const;
export const VIEWPORTS = ['desktop', 'tablet', 'mobile'] as const;
export const FONT_FAMILIES = ['sans', 'serif', 'system', 'arial', 'calibri', 'cambria', 'georgia', 'times', 'verdana', 'tahoma', 'trebuchet', 'courier', 'garamond', 'palatino', 'comic'] as const;
export type Alignment = typeof ALIGNMENTS[number];
export type Density = typeof DENSITIES[number];
export type Shape = typeof SHAPES[number];
export type Shadow = typeof SHADOWS[number];
export type Viewport = typeof VIEWPORTS[number];
export type FontFamily = typeof FONT_FAMILIES[number];
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Numeric dimensions are CSS pixels; ratio is width / height; opacity is 0..1. */
export interface BorderConfig { width: number; color: string; style: 'none' | 'solid' | 'dashed' }
export interface ProductGridConfig {
  columns: Record<Viewport, number>;
  gapX: number;
  gapY: number;
  maxWidth: number;
}
export interface ProductCardConfig {
  radius: number;
  border: BorderConfig;
  shadow: Shadow;
  padding: number;
  imageRatio: number;
  imageRadius: number;
  titleSize: number;
  priceSize: number;
  showDescription: boolean;
  buttonVisible: boolean;
  buttonFullWidth: boolean;
  buttonShape: Shape;
  buttonRadius: number;
  align: Alignment;
  density: Density;
}
export interface SectionConfig {
  paddingY: number;
  contentWidth: number;
  background: string;
  titleAlign: Alignment;
  titleSize: number;
  subtitleSize: number;
  paddingTop: number;
  paddingBottom: number;
}
export interface InfoConfig {
  cardRadius: number;
  border: BorderConfig;
  shadow: Shadow;
  layout: 'grid' | 'stack' | 'split';
  columns: number;
  padding: number;
  background: string;
  titleSize: number;
}
export interface PageAppearance {
  content: { imageRatio: number; optionSize: number; quantityWidth: number; align: Alignment; layout: 'split' | 'stack'; imageWidth: number; imageSize: number; imageRadius: number; gallerySize: number; infoSize: number; priceSize: number; formWidth: number };
  layout: { maxWidth: number; padding: number; gap: number; background: string; textColor: string; titleSize: number; titleAlign: Alignment };
  panel: { background: string; radius: number; padding: number; border: BorderConfig; shadow: Shadow };
  field: { background: string; textColor: string; radius: number; padding: number; border: BorderConfig };
  button: { background: string; textColor: string; radius: number; paddingX: number; paddingY: number; fontSize: number };
}
export interface VisualSections {
  pages: Record<import('./pages').StorePageId, PageAppearance>;
  global: {
    colors: { primary: string; secondary: string; accent: string; background: string; text: string; surface: string; border: string };
    typography: { body: FontFamily; heading: FontFamily; baseSize: number; lineHeight: number };
    radius: number;
    baseSpacing: number;
    contentMaxWidth: number;
    density: Density;
  };
  topBar: { visible: boolean; background: string; textColor: string; height: number; align: Alignment; fontSize: number };
  header: {
    layout: 'inline' | 'centered' | 'split';
    height: number;
    logoPosition: Alignment;
    logoSize: number;
    navAlign: Alignment;
    gap: number;
    linkStyle: 'plain' | 'underline' | 'pill';
    border: BorderConfig;
    shadow: Shadow;
    background: string;
    textColor: string;
    sticky: boolean;
  };
  hero: {
    height: number;
    imagePosition: 'top' | 'center' | 'bottom';
    contentWidth: number;
    horizontalAlign: Alignment;
    verticalAlign: 'top' | 'center' | 'bottom';
    overlay: boolean;
    overlayColor: string;
    overlayOpacity: number;
    titleSize: number;
    subtitleSize: number;
    textMaxWidth: number;
    gap: number;
    ctaPosition: 'inline' | 'below';
  };
  heroCta: {
    size: 'small' | 'medium' | 'large';
    paddingX: number;
    paddingY: number;
    width: 'auto' | 'full' | 'custom';
    customWidth: number;
    align: Alignment;
    radius: number;
    shape: Shape;
    variant: 'solid' | 'outline' | 'ghost';
    fontSize: number;
    fontWeight: number;
    border: BorderConfig;
    background: string;
    textColor: string;
  };
  categories: {
    layout: 'grid' | 'row' | 'wrap';
    columns: number;
    gap: number;
    presentation: 'pills' | 'cards' | 'links';
    radius: number;
    padding: number;
    textSize: number;
    align: Alignment;
    border: BorderConfig;
    shadow: Shadow;
    background: string;
  };
  productGrid: ProductGridConfig;
  productCard: ProductCardConfig;
  sections: { content: SectionConfig; featured: SectionConfig; benefits: SectionConfig };
  info: InfoConfig;
  contact: InfoConfig;
  location: InfoConfig;
  footer: {
    background: string;
    textColor: string;
    layout: 'columns' | 'stack' | 'centered';
    columns: number;
    align: Alignment;
    padding: number;
    titleSize: number;
    showTitles: boolean;
    /** Legacy read compatibility; effective value is always true. Not editable. */
    brandingVisible: boolean;
    maxWidth: number;
    paddingTop: number;
    paddingBottom: number;
    gap: number;
  };
  catalog: {
    heroEnabled: boolean;
    hero: VisualSections['hero'];
    titleAlign: Alignment;
    titleSize: number;
    contentWidth: number;
    filtersPosition: 'left' | 'top' | 'drawer';
    grid: ProductGridConfig;
    spacing: number;
    card: ProductCardConfig;
  };
}

/** Only overrides are persisted. Mobile inherits tablet, which inherits desktop. */
export interface VisualConfig extends VisualSections {
  version: 1;
  responsive: { tablet: DeepPartial<VisualSections>; mobile: DeepPartial<VisualSections> };
}
export type VisualConfigOverrides = DeepPartial<VisualConfig>;
export interface VisualPreset { id: TemplateId; name: string; config: VisualConfigOverrides }
export interface LegacyThemeColors { primaryColor?: string; secondaryColor?: string; accentColor?: string }
