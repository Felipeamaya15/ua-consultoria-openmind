import { isActiveEditorPreview } from '../visual/pages';
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { CartItem as BaseCartItem } from '../data/mockData';
import { cartService } from '../services/cartService';
import { useStoreIdentity } from './StoreIdentityContext';
import { guestCartKey, readGuestCart, saveGuestCart } from '../services/guestCartStorage';
import { validatePromotion } from '../services/promotionService';
import { useActivityCart, type ActivityCartItem } from './activityCart';
import { useCartSession, currentCartToken } from './cartSession';
import { fetchPublicProducts } from '../services/catalogService';

export interface CartItem extends BaseCartItem {
  id_item_carrito?: number;
}

interface CartState {
  clearCart: () => Promise<void>;
  promoCode: string;
  applyPromo: (code: string) => Promise<{ ok: boolean; message: string }>;
  removePromo: () => void;
  promoNotice: string;
  discount: number;
  shipping: number | null;
  total: number;
  shippingMethod: string;
  setShippingMethod: (method: string) => void;
  setCustomShipping: (cost: number | null) => void;
  items: CartItem[];

  activities: ActivityCartItem[];
  count: number;
  subtotal: number;
  addItem: (item: CartItem) => Promise<void> | void;
  updateQuantity: (productId: string, variantId: string, quantity: number) => Promise<void> | void;
  removeItem: (productId: string, variantId: string) => Promise<void> | void;
  refreshCart: () => Promise<void>;
  loading: boolean;
}

const PENDING_CART_SNAPSHOT_KEY = 'openmind-pending-payment-cart';
const RESTORE_CART_FLAG_KEY = 'openmind-restore-cart';

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const {token,scope}=useCartSession();
  const {identity}=useStoreIdentity();
  if (!scope) return <div role="status" className="p-4 text-sm">Cargando tu carrito…</div>;
  return <ScopedCartProvider key={`${guestCartKey(identity) || 'store'}:${scope}`} sessionToken={token} scope={scope}>{children}</ScopedCartProvider>;
}

function ScopedCartProvider({children,sessionToken,scope}:{children:ReactNode;sessionToken:string|null;scope:string}) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoSubtotal, setPromoSubtotal] = useState(0);
  const [promoNotice, setPromoNotice] = useState('');
  const [shippingMethod, setShippingMethod] = useState('');
  const [customShipping, setCustomShipping] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const { identity } = useStoreIdentity();
  const hasToken = !!sessionToken;
  const baseKey = guestCartKey(identity);
  const storageKey = !hasToken && baseKey ? `${baseKey}:guest-v2` : null;
  const snapshotKey = `${PENDING_CART_SNAPSHOT_KEY}:${baseKey || 'store'}:${scope}`;
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);

  useEffect(() => {
    if (isActiveEditorPreview() || !storageKey) return;
    setItems(readGuestCart(storageKey));
    setHydratedKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    if (!isActiveEditorPreview() && storageKey && hydratedKey === storageKey) saveGuestCart(storageKey, items);
  }, [storageKey, hydratedKey, items]);


  const refreshCart = useCallback(async () => {
    if (isActiveEditorPreview()) return;
    if (!sessionToken || currentCartToken() !== sessionToken) return;
    try {
      setLoading(true);
      const data: any = await cartService.obtenerCarrito();
      if (currentCartToken() !== sessionToken) return;


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

      setItems(current => [...persistedItems, ...current.filter(item =>
        /^[a-f\d]{24}$/i.test(item.productId) && !item.id_item_carrito &&
        !persistedItems.some(saved => saved.productId === item.productId && saved.variantId === item.variantId),
      )]);

    } catch (err: any) {
      console.warn('No se pudo sincronizar el carrito con el backend:', err.message);
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  const clearCart = async () => {
    if (currentCartToken() !== sessionToken) return;
    try {
      if (items.length > 0 && typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(snapshotKey, JSON.stringify(items));
      }
    } catch {}
    const persisted = items.filter(item => item.id_item_carrito);
    setItems([]);
    clearActivities();
    setPromoCode('');
    setPromoDiscount(0);
    setPromoNotice('');
    setShippingMethod('');
    setCustomShipping(null);
    await Promise.allSettled(persisted.map(item => cartService.eliminarItem(item.id_item_carrito!)));
  };


  const addItem = async (item: CartItem) => {
    if (currentCartToken() !== sessionToken) return;
    if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.maxStock <= 0) return;


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
      if (item.productId && sessionToken && currentCartToken() === sessionToken) {
        const itemGuardado: any = await cartService.agregarItem(
          esIdNumerico ? prodId : item.productId,
          item.quantity,
          item.sku || undefined
        );
        if (currentCartToken() !== sessionToken) return;
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

  useEffect(() => {
    if (isActiveEditorPreview() || typeof window === 'undefined') return;
    const checkRestore = () => {
      try {
        if (sessionStorage.getItem(RESTORE_CART_FLAG_KEY) !== '1') return;
        sessionStorage.setItem(RESTORE_CART_FLAG_KEY, '');
        if (currentCartToken() !== sessionToken) return;
        const raw = sessionStorage.getItem(snapshotKey);
        if (!raw) return;
        const parsed = JSON.parse(raw) as CartItem[];
        if (!Array.isArray(parsed) || !parsed.length) return;
        setItems((current) => {
          if (current.length > 0) return current;
          return parsed;
        });
      } catch {}
    };
    checkRestore();
    window.addEventListener('openmind_restore_cart', checkRestore);
    return () => window.removeEventListener('openmind_restore_cart', checkRestore);
  }, [snapshotKey, sessionToken]);


  const updateQuantity = async (
    productId: string,
    variantId: string,
    quantity: number
  ) => {
    if (currentCartToken() !== sessionToken || !Number.isInteger(quantity)) return;

    if (quantity <= 0) {
      await removeItem(productId, variantId);
      return;
    }

    const target = items.find(
      (i) => i.productId === productId && i.variantId === variantId
    );


    setItems((prev) =>
      prev.map((i) =>
        i.productId === productId && i.variantId === variantId
          ? { ...i, quantity: Math.min(quantity, i.maxStock) }
          : i
      )
    );


    if (target?.id_item_carrito) {
      try {
        await cartService.modificarCantidad(target.id_item_carrito, quantity);
      } catch (err: any) {
        console.error('Error al modificar cantidad en el backend:', err.message);
        refreshCart();
      }
    }
  };


  const removeItem = async (productId: string, variantId: string) => {
    if (currentCartToken() !== sessionToken) return;
    const target = items.find(
      (i) => i.productId === productId && i.variantId === variantId
    );


    setItems((prev) =>
      prev.filter((i) => i.productId !== productId || i.variantId !== variantId)
    );


    if (target?.id_item_carrito) {
      try {
        await cartService.eliminarItem(target.id_item_carrito);
      } catch (err: any) {
        console.error('Error al eliminar ítem en el backend:', err.message);
        refreshCart();
      }
    }
  };

  const productIdentityList = JSON.stringify([...new Set(items.map(item=>item.productId))].sort());
  useEffect(() => {
    if (!baseKey || productIdentityList==='[]' || isActiveEditorPreview()) return;
    let live = true;
    const inspected = new Set<string>(JSON.parse(productIdentityList));
    fetchPublicProducts().then(products => {
      if (!live || currentCartToken() !== sessionToken) return;
      const known = new Set<string>();
      products.forEach(product => { known.add(String(product.id)); if(product.catalogId)known.add(String(product.catalogId)); });
      setItems(current => {

        const next=current.filter(item=>!inspected.has(item.productId)||/^\d+$/.test(item.productId)||known.has(item.productId));
        return next.length===current.length?current:next;
      });
    }).catch(() => {});
    return () => { live=false; };
  }, [baseKey,productIdentityList,sessionToken]);
  const { items: activities, clear: clearActivities } = useActivityCart();
  const count = items.reduce((sum, i) => sum + i.quantity, 0) + activities.reduce((sum,i)=>sum+i.quantity,0);
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0)
    + activities.reduce((sum,i)=>sum+i.quantity*i.price,0);
  const discount = promoCode ? Math.min(subtotal, promoDiscount) : 0;

  const applyPromo = async (code: string) => {
    const normalized = code.trim().toUpperCase();
    setPromoNotice('');
    if (!normalized) return { ok: false, message: 'Ingresa un código promocional.' };
    if (subtotal <= 0) return { ok: false, message: 'Agrega artículos al carrito antes de aplicar un código.' };
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

  const removePromo = () => { setPromoCode(''); setPromoDiscount(0); setPromoSubtotal(0); setPromoNotice('Promoción eliminada.'); };

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
        removePromo,
        promoNotice,
        discount,
        shipping,
        total,
        shippingMethod,
        setShippingMethod,
        setCustomShipping,
        items,
        activities,
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