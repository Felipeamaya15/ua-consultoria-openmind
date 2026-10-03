import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { CartItem as BaseCartItem } from '../data/mockData';
import { cartService } from '../services/cartService';

export interface CartItem extends BaseCartItem {
  id_item_carrito?: number;
}

interface CartState {
  clearCart: () => Promise<void>;
  promoCode: string;
  applyPromo: (code: string) => boolean;
  discount: number;
  shipping: number;
  total: number;
  shippingMethod: string;
  setShippingMethod: (method: string) => void;
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
  const [shippingMethod, setShippingMethod] = useState('');
  const [loading, setLoading] = useState(false);

  // 1. Sincronizar el carrito real desde PostgreSQL
  const refreshCart = useCallback(async () => {
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
        productId: String(it.id_producto),
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
      if (itemsList.length > 0) {
        setItems(
          itemsList.map((it: any) => ({
            id_item_carrito: it.id_item_carrito || it.id,
            productId: String(it.id_producto || 1),
            variantId: it.sku || `item-${it.id_item_carrito || it.id_producto}`,
            sku: it.sku || '',
            name: it.nombre_producto || it.nombre || 'Polera Oversize Test',
            price: Number(it.precio_unitario || it.precio || 14990),
            quantity: Number(it.cantidad || 1),
            maxStock: Number(it.stock_disponible || it.stock || 25),
            image:
              it.imagen ||
              'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500',
            attributes: it.atributos || {},
          }))
        );
      } else {
        setItems([]);
      }
    } catch (err: any) {
      console.warn('No se pudo sincronizar el carrito con el backend:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  const applyPromo = (code: string) => {
    const normalized = code.trim().toUpperCase();
    const valid = ['VERANO20', 'NUEVO5000'].includes(normalized);
    setPromoCode(valid ? normalized : '');
    return valid;
  };

  const clearCart = async () => {
    const persisted = items.filter(item => item.id_item_carrito);
    setItems([]);
    setPromoCode('');
    setShippingMethod('');
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
      if (/^\d+$/.test(item.productId) && Number.isSafeInteger(prodId) &&
          (localStorage.getItem('token') || sessionStorage.getItem('token'))) {
        const itemGuardado: any = await cartService.agregarItem(
          prodId,
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
      }
    }
  };

  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const discount = Math.min(
    subtotal,
    promoCode === 'VERANO20'
      ? Math.round(subtotal * 0.2)
      : promoCode === 'NUEVO5000'
      ? 5000
      : 0
  );
  const shipping =
    !items.length || shippingMethod === 'Retiro' || subtotal > 50000 ? 0 : 3490;
  const total = subtotal - discount + shipping;

  return (
    <CartContext.Provider
      value={{
        clearCart,
        promoCode,
        applyPromo,
        discount,
        shipping,
        total,
        shippingMethod,
        setShippingMethod,
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