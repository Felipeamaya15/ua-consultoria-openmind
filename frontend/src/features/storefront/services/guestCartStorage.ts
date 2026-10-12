import type { CartItem } from '../data/mockData';
import type { StoreIdentity } from '../visual/storage';

export function guestCartKey(identity: StoreIdentity | null): string | null {
  return identity ? `ua-guest-cart-v1:${encodeURIComponent(identity.apiBaseUrl.replace(/\/+$/, ''))}:${encodeURIComponent(identity.storeId)}` : null;
}

export function readGuestCart(key: string): CartItem[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is CartItem => {
      if (!item || typeof item !== 'object') return false;
      const i = item as Record<string, unknown>;
      return ['productId', 'variantId', 'sku', 'name', 'image'].every(field => typeof i[field] === 'string')
        && Number.isInteger(i.quantity) && Number(i.quantity) > 0
        && Number.isInteger(i.maxStock) && Number(i.maxStock) >= Number(i.quantity)
        && typeof i.price === 'number' && Number.isFinite(i.price) && i.price >= 0
        && !!i.attributes && typeof i.attributes === 'object' && !Array.isArray(i.attributes)
        && Object.values(i.attributes).every(attribute => typeof attribute === 'string')
        && !('id_item_carrito' in i);
    });
  } catch { return []; }
}

export function saveGuestCart(key: string, items: CartItem[]): void {
  try { localStorage.setItem(key, JSON.stringify(items)); }
  catch { /* El carrito sigue disponible en memoria si el navegador bloquea almacenamiento. */ }
}
