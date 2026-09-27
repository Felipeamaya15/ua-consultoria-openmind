import { mockProducts, type Order } from './mockData';
export const mockOrders: Order[] = [
  {
    id: 'ord1',
    number: 'ORD-2025-0001',
    customer: { name: 'María González', email: 'maria@email.com', phone: '+56912345678' },
    items: [
      { productId: 'p1', variantId: 'v2', name: 'Polera Esencial', image: mockProducts[0].images[0], price: 12990, quantity: 2, attributes: { Color: 'Negro', Talla: 'M' }, sku: 'POL-NEG-M', maxStock: 12 },
    ],
    subtotal: 25980, discount: 2000, shipping: 3490, total: 27470,
    status: 'delivered', paymentStatus: 'paid', paymentMethod: 'Transbank',
    shippingMethod: 'Chilexpress', carrier: 'Chilexpress',
    address: { street: 'Av. Providencia', number: '1234', city: 'Santiago', region: 'Metropolitana' },
    trackingCode: 'CX20251234567',
    createdAt: '2025-06-01T10:30:00Z', updatedAt: '2025-06-05T14:20:00Z',
  },
  {
    id: 'ord2',
    number: 'ORD-2025-0002',
    customer: { name: 'Carlos Muñoz', email: 'carlos@email.com' },
    items: [
      { productId: 'p3', variantId: 'v7', name: 'Auriculares InSound 300', image: mockProducts[2].images[0], price: 89990, quantity: 1, attributes: { Color: 'Negro', Conectividad: 'Bluetooth' }, sku: 'AUR-NEG-BT', maxStock: 20 },
    ],
    subtotal: 89990, discount: 0, shipping: 0, total: 89990,
    status: 'preparing', paymentStatus: 'paid', paymentMethod: 'MercadoPago',
    shippingMethod: 'Starken',
    address: { street: 'Los Leones', number: '567', city: 'Las Condes', region: 'Metropolitana' },
    createdAt: '2025-06-10T15:00:00Z', updatedAt: '2025-06-11T09:00:00Z',
  },
  {
    id: 'ord3',
    number: 'ORD-2025-0003',
    customer: { name: 'Ana Riquelme', email: 'ana@email.com' },
    items: [
      { productId: 'p2', variantId: 'v5', name: 'Mochila Urbana Pro', image: mockProducts[1].images[0], price: 49990, quantity: 1, attributes: { Color: 'Negro', Capacidad: '28L' }, sku: 'MOC-NEG-28L', maxStock: 15 },
      { productId: 'p5', variantId: 'v11', name: 'Cuaderno Premium A5', image: mockProducts[4].images[0], price: 8990, quantity: 3, attributes: { Color: 'Negro', Formato: 'A5 Punteado' }, sku: 'CUA-NEG-A5', maxStock: 50 },
    ],
    subtotal: 76960, discount: 5000, shipping: 3490, total: 75450,
    status: 'pending', paymentStatus: 'pending', paymentMethod: 'Transferencia bancaria',
    shippingMethod: 'Chilexpress',
    address: { street: 'Blanco Encalada', number: '890', city: 'Valparaíso', region: 'Valparaíso' },
    createdAt: '2025-06-12T11:30:00Z', updatedAt: '2025-06-12T11:30:00Z',
    promoCode: 'VERANO20',
  },
];


