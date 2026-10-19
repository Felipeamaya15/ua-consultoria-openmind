/** Datos comerciales independientes de marca, diseño y React. Solo proceden del catálogo autorizado. */
export interface MarketingVariant {
  sku: string;
  price: unknown;
  offerPrice: unknown;
  stock: unknown;
  active: boolean;
  attributes: { label: string; value: string }[];
}
export interface MarketingProduct {
  id: string; name: string; category: string; active: boolean; images: string[];
  description?: string;
  variants: MarketingVariant[];
}
export type ContentSource = 'product' | 'promotion';
export interface PricedVariant { variant: MarketingVariant; price: number; originalPrice: number | null }
export interface PublicationContent {
  productId: string; productName: string; category: string; image: string | null;
  description?: string;
  /** Importes en centavos CLP, redondeados como el checkout (half-up). */
  price: number; originalPrice: number | null; discountLabel: string | null;
  fromPrice: boolean; variantLabel: string; hasMultipleVariants: boolean; source: ContentSource;
}
export interface MarketingPalette { primary: string; secondary: string; onPrimary: string; onSecondary: string }
export interface StoreBrand { name: string; logo: string | null; palette: MarketingPalette }
export interface BrandSource { name: string; logo: string | null; warning: string }
export type PublicationFormat = 'square' | 'story' | 'banner';
export interface PublicationDesign { format: PublicationFormat; layout: 'product-spotlight'; editor?: import('./editor').DesignState }
export const PUBLICATION_FORMATS: { id: PublicationFormat; label: string; ratio: string; width: number; height: number }[] = [
  { id: 'square', label: 'Publicación cuadrada', ratio: '1:1', width: 1080, height: 1080 },
  { id: 'story', label: 'Historia vertical', ratio: '9:16', width: 1080, height: 1920 },
  { id: 'banner', label: 'Banner horizontal', ratio: '16:9', width: 1920, height: 1080 },
];
