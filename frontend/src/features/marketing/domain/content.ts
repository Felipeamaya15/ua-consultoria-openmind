import type { ContentSource, MarketingProduct, MarketingVariant, PricedVariant, PublicationContent } from './types';

export function priceInCents(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  // Intl halfExpand redondea el valor decimal, también 1.005 -> 1.01, como Decimal(..., ROUND_HALF_UP).
  const decimal = new Intl.NumberFormat('en-US', { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  const cents = Number(decimal.replace('.', ''));
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}
export function formatMarketingMoney(cents: number): string {
  const whole = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fraction = cents % 100;
  return `$${whole}${fraction ? ',' + String(fraction).padStart(2, '0') : ''}`;
}
export function pricedVariants(product: MarketingProduct): PricedVariant[] {
  if (!product.active) return [];
  return product.variants.flatMap(variant => {
    if (!variant.active || !variant.sku || !Number.isSafeInteger(variant.stock) || Number(variant.stock) <= 0) return [];
    const regular = priceInCents(variant.price);
    if (regular === null) return [];
    if (variant.offerPrice == null) return [{ variant, price: regular, originalPrice: null }];
    const offer = priceInCents(variant.offerPrice);
    // No publicitar documentos legacy con una oferta inconsistente.
    if (offer === null || Number(variant.offerPrice) >= Number(variant.price)) return [];
    return [{ variant, price: offer, originalPrice: offer < regular ? regular : null }];
  });
}
export function variantDescription(variant: MarketingVariant): string {
  return variant.attributes.map(a => `${a.label}: ${a.value}`).join(' · ') || `SKU: ${variant.sku}`;
}
export function productProblem(product: MarketingProduct, source: ContentSource): string | null {
  if (!product.active) return 'Este producto está inactivo. Actívalo en Productos antes de crear una publicación.';
  const available = product.variants.filter(v => v.active && Number.isSafeInteger(v.stock) && Number(v.stock) > 0);
  if (!available.length) return 'Este producto no tiene variantes activas con stock. No se anunciará como disponible.';
  const priced = pricedVariants(product);
  if (!priced.length) return 'No encontramos un precio válido en las variantes disponibles. Revisa los precios en Productos.';
  if (source === 'promotion' && !priced.some(v => v.originalPrice !== null)) return 'Este producto no tiene una oferta válida con stock para promocionar.';
  return null;
}
export function buildPublication(product: MarketingProduct, source: ContentSource, sku = ''): PublicationContent | null {
  if (productProblem(product, source)) return null;
  const choices = pricedVariants(product).filter(v => source === 'product' || v.originalPrice !== null);
  const selected = sku ? choices.find(v => v.variant.sku === sku) : choices.reduce((a, b) => b.price < a.price ? b : a);
  if (!selected) return null;
  const original = selected.originalPrice;
  const basisPoints = original ? Number((BigInt(original - selected.price) * 10000n) / BigInt(original)) : 0;
  return {
    productId: product.id, productName: product.name, category: product.category, image: product.images[0] || null,
    description: product.description || '',
    price: selected.price, originalPrice: original,
    discountLabel: original !== null ? (basisPoints ? `${(basisPoints / 100).toLocaleString('es-CL', { maximumFractionDigits: 2 })}% menos` : 'Precio de oferta') : null,
    fromPrice: !sku && source === 'product' && new Set(choices.map(v => v.price)).size > 1,
    variantLabel: variantDescription(selected.variant), hasMultipleVariants: product.variants.length > 1, source,
  };
}
export function hasRealOffer(product: MarketingProduct): boolean {
  return pricedVariants(product).some(v => v.originalPrice !== null);
}
export function searchProducts(products: MarketingProduct[], text: string): MarketingProduct[] {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL');
  const query = normalize(text.trim());
  return products.filter(p => normalize(`${p.name} ${p.category} ${p.variants.map(v => v.sku).join(' ')}`).includes(query));
}
