/** Shared public routes; design changes never replace route guards or business state. */
export const STORE_PAGES = [
  { id: 'catalog', label: 'Catálogo', path: 'catalogo' },
  { id: 'product', label: 'Producto', path: 'producto' },
  { id: 'login', label: 'Acceso', path: 'ingresar' },
  { id: 'cart', label: 'Carrito', path: 'carrito' },
  { id: 'checkout', label: 'Checkout', path: 'compra' },
  { id: 'confirmation', label: 'Confirmación de pedido', path: 'pedido-confirmado' },
  { id: 'tracking', label: 'Seguimiento', path: 'seguimiento' },
  { id: 'profile', label: 'Perfil', path: 'perfil' },
  { id: 'orders', label: 'Mis pedidos', path: 'mis-pedidos' },
  { id: 'terms', label: 'Términos', path: 'legal/terms' },
  { id: 'privacy', label: 'Privacidad', path: 'legal/privacy' },
  { id: 'refund', label: 'Reembolsos', path: 'legal/refund' },
  { id: 'story', label: 'Nuestra historia', path: 'nuestra-historia' },
] as const;
export type StorePageId = typeof STORE_PAGES[number]['id'];
export type PreviewPageId = StorePageId | 'home';
export const CHECKOUT_PREVIEW_STEPS = ['contact', 'delivery', 'payment', 'confirm'] as const;
export function isStorefrontEditorPreview(embedded: boolean, parentPath: string): boolean {
  return embedded && parentPath === '/emprendedor/diseno/editor';
}
export function checkoutPreviewStep(search: string, embedded: boolean, parentPath: string): string {
  const value = new URLSearchParams(search).get('visualStep');
  return isStorefrontEditorPreview(embedded, parentPath) && CHECKOUT_PREVIEW_STEPS.some(step => step === value) ? value! : 'contact';
}
export function pageFromPath(pathname: string): StorePageId | null {
  const relative = pathname.replace(/^\/plantilla\/[1-4]\/?/, '').replace(/\/$/, '');
  return STORE_PAGES.find(page => relative === page.path || relative.startsWith(page.path + '/'))?.id ?? null;
}
export function previewPath(page: PreviewPageId, productId = '', register = false): string {
  if (page === 'home') return '';
  if (page === 'product') return productId.trim() ? `producto/${encodeURIComponent(productId.trim())}` : 'catalogo';
  const path = STORE_PAGES.find(value => value.id === page)!.path;
  return page === 'login' && register ? `${path}?modo=registro` : path;
}

/** A public query parameter cannot activate synthetic examples. */
export function isActiveEditorPreview(): boolean {
  try { return isStorefrontEditorPreview(window.parent !== window, window.parent.location.pathname); }
  catch { return false; }
}

