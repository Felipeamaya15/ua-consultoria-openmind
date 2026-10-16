import { isActiveEditorPreview } from '../visual/pages';
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { CartItem as BaseCartItem } from '../data/mockData';
import { cartService } from '../services/cartService';
import { useStoreIdentity } from './StoreIdentityContext';
import { guestCartKey, readGuestCart, saveGuestCart } from '../services/guestCartStorage';
import { validatePromotion } from '../services/promotionService';

export interface CartItem extends BaseCartItem {
  id_item_carrito?: number;
}

interface CartState {
  clearCart: () => Promise<void>;
  promoCode: string;
  applyPromo: (code: string) => Promise<{ ok: boolean; message: string }>;
  promoNotice: string;
  discount: number;
  shipping: number | null;
  total: number;
  shippingMethod: string;
  setShippingMethod: (method: string) => void;
  setCustomShipping: (cost: number | null) => void;
  items: CartItem[];
  count: number;
  subtotal: number;
  addItem: (item: CartItem) => Promise<void> | void;
  updateQuantity: (productId: string, variantId: string, quantity: number) => Promise<void> | void;
  removeItem: (productId: string, variantId: string) => Promise<void> | void;
  refreshCart: () => Promise<void>;
  loading: boolean;
}

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoSubtotal, setPromoSubtotal] = useState(0);
  const [promoNotice, setPromoNotice] = useState('');
  const [shippingMethod, setShippingMethod] = useState('');
  const [customShipping, setCustomShipping] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const { identity } = useStoreIdentity();
  const hasToken = !!(localStorage.getItem('token') || sessionStorage.getItem('token'));
  const storageKey = hasToken ? null : guestCartKey(identity);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);

  useEffect(() => {
    if (isActiveEditorPreview() || !storageKey) return;
    setItems(readGuestCart(storageKey));
    setHydratedKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (!isActiveEditorPreview() && storageKey && hydratedKey === storageKey) saveGuestCart(storageKey, items);
  }, [storageKey, hydratedKey, items]);

  // 1. Sincronizar el carrito real desde PostgreSQL
  const refreshCart = useCallback(async () => {
    if (isActiveEditorPreview()) return;
    if (!localStorage.getItem('token') && !sessionStorage.getItem('token')) return;
    try {
      setLoading(true);
      const data: any = await cartService.obtenerCarrito();

      // Reconoce si el backend envía la lista directa [...] o envuelta en { items: [...] }
      const itemsList: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
        ? data.items
        : [];

      const persistedItems: CartItem[] = itemsList.map((it: any) => ({
        id_item_carrito: it.id_item_carrito ?? it.id,
        productId: it.producto_mongo_id || it.slug || String(it.id_producto),
        variantId: it.sku || `item-${it.id_item_carrito ?? it.id_producto}`,
        sku: it.sku ?? '',
        name: it.nombre_producto ?? it.nombre ?? '',
        price: Number(it.precio_unitario ?? it.precio ?? 0),
        quantity: Number(it.cantidad),
        maxStock: Number(it.stock_disponible ?? it.stock ?? 0),
        image: it.imagen ?? '',
        attributes: it.atributos ?? {},
      }));
      // El carrito SQL legado no contiene las variantes Mongo de esta sesión.
      setItems(current => [...persistedItems, ...current.filter(item =>
        /^[a-f\d]{24}$/i.test(item.productId) && !item.id_item_carrito &&
        !persistedItems.some(saved => saved.productId === item.productId && saved.variantId === item.variantId),
      )]);

    } catch (err: any) {
      console.warn('No se pudo sincronizar el carrito con el backend:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  const clearCart = async () => {
    const persisted = items.filter(item => item.id_item_carrito);
    setItems([]);
    setPromoCode('');
    setPromoDiscount(0);
    setPromoNotice('');
    setShippingMethod('');
    setCustomShipping(null);
    await Promise.allSettled(persisted.map(item => cartService.eliminarItem(item.id_item_carrito!)));
  };

  // Tarea: Implementar el agregado de productos y variantes al carrito
  const addItem = async (item: CartItem) => {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.maxStock <= 0) return;

    // Actualización visual inmediata
    setItems((prev) => {
      const exists = prev.some(
        (i) => i.productId === item.productId && i.variantId === item.variantId
      );
      return exists
        ? prev.map((i) =>
            i.productId === item.productId && i.variantId === item.variantId
              ? { ...i, quantity: Math.min(i.quantity + item.quantity, i.maxStock) }
              : i
          )
        : [...prev, { ...item, quantity: Math.min(item.quantity, item.maxStock) }];
    });

    try {
      const prodId = Number(item.productId);
      const esIdNumerico = /^\d+$/.test(item.productId) && Number.isSafeInteger(prodId);
      if (item.productId && (localStorage.getItem('token') || sessionStorage.getItem('token'))) {
        const itemGuardado: any = await cartService.agregarItem(
          esIdNumerico ? prodId : item.productId,
          item.quantity,
          item.sku || undefined
        );
        if (itemGuardado?.id_item_carrito) {
          setItems((prev) =>
            prev.map((i) =>
              i.productId === item.productId && i.variantId === item.variantId
                ? {
                    ...i,
                    id_item_carrito: itemGuardado.id_item_carrito,
                    quantity: itemGuardado.cantidad,
                  }
                : i
            )
          );
        }
      }
    } catch (err: any) {
      console.error('Error al persistir ítem en el carrito:', err.message);
    }
  };

  // Tarea: Implementar la modificación de cantidades
  const updateQuantity = async (
    productId: string,
    variantId: string,
    quantity: number
  ) => {
    if (!Number.isInteger(quantity)) return;

    if (quantity <= 0) {
      await removeItem(productId, variantId);
      return;
    }

    const target = items.find(
      (i) => i.productId === productId && i.variantId === variantId
    );

    // Actualización visual inmediata
    setItems((prev) =>
      prev.map((i) =>
        i.productId === productId && i.variantId === variantId
          ? { ...i, quantity: Math.min(quantity, i.maxStock) }
          : i
      )
    );

    // Persistir en backend
    if (target?.id_item_carrito) {
      try {
        await cartService.modificarCantidad(target.id_item_carrito, quantity);
      } catch (err: any) {
        console.error('Error al modificar cantidad en el backend:', err.message);
        refreshCart();
      }
    }
  };

  // Tarea: Implementar la eliminación de productos del carrito
  const removeItem = async (productId: string, variantId: string) => {
    const target = items.find(
      (i) => i.productId === productId && i.variantId === variantId
    );

    // Actualización visual inmediata
    setItems((prev) =>
      prev.filter((i) => i.productId !== productId || i.variantId !== variantId)
    );

    // Persistir en backend
    if (target?.id_item_carrito) {
      try {
        await cartService.eliminarItem(target.id_item_carrito);
      } catch (err: any) {
        console.error('Error al eliminar ítem en el backend:', err.message);
        refreshCart();
      }
    }
  };

  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const discount = promoCode ? Math.min(subtotal, promoDiscount) : 0;

  const applyPromo = async (code: string) => {
    const normalized = code.trim().toUpperCase();
    setPromoNotice('');
    if (!normalized) return { ok: false, message: 'Ingresa un código promocional.' };
    if (subtotal <= 0) return { ok: false, message: 'Agrega productos al carrito antes de aplicar un código.' };
    try {
      const result = await validatePromotion(normalized, subtotal, 0);
      setPromoCode(result.code);
      setPromoDiscount(result.discount);
      setPromoSubtotal(subtotal);
      return { ok: true, message: result.message || '¡Código aplicado correctamente!' };
    } catch (err) {
      setPromoCode('');
      setPromoDiscount(0);
      return { ok: false, message: err instanceof Error && err.message ? err.message : 'Código inválido o expirado.' };
    }
  };

  useEffect(() => {
    if (!promoCode || promoSubtotal === subtotal) return;
    let active = true;
    const dropPromo = (notice: string) => {
      setPromoCode('');
      setPromoDiscount(0);
      setPromoNotice(notice);
    };
    if (subtotal <= 0) { dropPromo(`El código ${promoCode} se quitó porque el carrito quedó vacío.`); return; }
    validatePromotion(promoCode, subtotal, 0)
      .then(result => {
        if (!active) return;
        setPromoDiscount(result.discount);
        setPromoSubtotal(subtotal);
      })
      .catch(err => {
        if (active) dropPromo(err instanceof Error && err.message
          ? `El código ${promoCode} se quitó: ${err.message}`
          : `El código ${promoCode} se quitó porque ya no es válido para este carrito.`);
      });
    return () => { active = false; };
  }, [promoCode, promoSubtotal, subtotal]);
  const shipping =
    !items.length || shippingMethod === 'Retiro'
      ? 0
      : customShipping !== null
      ? customShipping
      : null;
  const total = subtotal - discount + (shipping ?? 0);

  return (
    <CartContext.Provider
      value={{
        clearCart,
        promoCode,
        applyPromo,
        promoNotice,
        discount,
        shipping,
        total,
        shippingMethod,
        setShippingMethod,
        setCustomShipping,
        items,
        addItem,
        removeItem,
        updateQuantity,
        refreshCart,
        loading,
        count,
        subtotal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('CartProvider requerido');
  return context;
}
