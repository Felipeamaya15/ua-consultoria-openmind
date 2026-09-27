import { createContext, useContext, useState, type ReactNode } from 'react';
import type { CartItem } from '../data/mockData';
interface CartState {
  clearCart: () => void; promoCode: string; applyPromo: (code: string) => boolean; discount: number; shipping: number; total: number; shippingMethod: string; setShippingMethod: (method: string) => void;
  items: CartItem[]; count: number; subtotal: number;
  addItem: (item: CartItem) => void;
  updateQuantity: (productId: string, variantId: string, quantity: number) => void;
  removeItem: (productId: string, variantId: string) => void;
}
const CartContext = createContext<CartState | null>(null);
// Estado de demostración compartido entre rutas; se reinicia al recargar.
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [promoCode, setPromoCode] = useState('');
  const [shippingMethod, setShippingMethod] = useState('');
  const applyPromo = (code: string) => {
    const normalized = code.trim().toUpperCase();
    const valid = ['VERANO20', 'NUEVO5000'].includes(normalized);
    setPromoCode(valid ? normalized : '');
    return valid;
  };
  const clearCart = () => { setItems([]); setPromoCode(''); setShippingMethod(''); };
  const removeItem = (productId: string, variantId: string) => setItems(prev => prev.filter(i => i.productId !== productId || i.variantId !== variantId));
  const addItem = (item: CartItem) => {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.maxStock <= 0) return;
    setItems(prev => {
      const exists = prev.some(i => i.productId === item.productId && i.variantId === item.variantId);
      return exists ? prev.map(i => i.productId === item.productId && i.variantId === item.variantId
        ? { ...i, quantity: Math.min(i.quantity + item.quantity, i.maxStock) } : i)
        : [...prev, { ...item, quantity: Math.min(item.quantity, item.maxStock) }];
    });
  };
  const updateQuantity = (productId: string, variantId: string, quantity: number) => {
    if (!Number.isInteger(quantity)) return;
    if (quantity <= 0) return removeItem(productId, variantId);
    setItems(prev => prev.map(i => i.productId === productId && i.variantId === variantId ? { ...i, quantity: Math.min(quantity, i.maxStock) } : i));
  };
  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const discount = Math.min(subtotal, promoCode === 'VERANO20' ? Math.round(subtotal * 0.2) : promoCode === 'NUEVO5000' ? 5000 : 0);
  const shipping = !items.length || shippingMethod === 'Retiro' || subtotal > 50000 ? 0 : 3490;
  const total = subtotal - discount + shipping;
  return <CartContext.Provider value={{ clearCart, promoCode, applyPromo, discount, shipping, total, shippingMethod, setShippingMethod, items, addItem, removeItem, updateQuantity, count, subtotal }}>{children}</CartContext.Provider>;
}
export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('CartProvider requerido');
  return context;
}
