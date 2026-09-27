// Datos de demostración del diseño; no se realizan llamadas al backend.
export type TemplateId = 'editorial' | 'minimal' | 'visual' | 'catalog';

export interface ProductVariant {
  id: string;
  sku: string;
  attributes: Record<string, string>;
  price: number;
  comparePrice?: number;
  stock: number;
  available: boolean;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  images: string[];
  basePrice: number;
  comparePrice?: number;
  variants: ProductVariant[];
  attributes: Record<string, string[]>;
  tags: string[];
  featured: boolean;
  status: 'active' | 'archived' | 'draft';
  seoTitle?: string;
  seoDescription?: string;
  createdAt: string;
}

export interface CartItem {
  productId: string;
  variantId: string;
  name: string;
  image: string;
  price: number;
  comparePrice?: number;
  quantity: number;
  attributes: Record<string, string>;
  sku: string;
  maxStock: number;
}

export interface Order {
  id: string;
  number: string;
  customer: { name: string; email: string; phone?: string };
  items: CartItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  status: 'pending' | 'paid' | 'preparing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  paymentStatus: 'pending' | 'paid' | 'rejected' | 'refunded';
  paymentMethod: string;
  shippingMethod: string;
  address: Address;
  trackingCode?: string;
  carrier?: string;
  createdAt: string;
  updatedAt: string;
  promoCode?: string;
}

export interface Address {
  street: string;
  number: string;
  apt?: string;
  city: string;
  region: string;
  postalCode?: string;
}

export interface StoreConfig {
  name: string;
  description: string;
  logo?: string;
  heroImage: string;
  bannerImages: string[];
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  template: TemplateId;
  requiresAuth: 'none' | 'optional' | 'required';
  paymentMethods: string[];
  shippingMethods: string[];
  socialLinks: Record<string, string>;
  contactEmail: string;
  contactPhone?: string;
  address?: string;
  metaTitle?: string;
  metaDescription?: string;
  gaId?: string;
  pixelId?: string;
}

export interface Promotion {
  id: string;
  name: string;
  code?: string;
  type: 'percentage' | 'fixed' | 'free_shipping';
  value: number;
  minAmount?: number;
  maxUses?: number;
  usedCount: number;
  startsAt: string;
  endsAt?: string;
  active: boolean;
}

export const mockProducts: Product[] = [
  {
    id: 'p1',
    name: 'Polera Esencial',
    description: 'Polera de algodón 100% orgánico, corte recto y suave al tacto. Ideal para el uso diario.',
    category: 'Ropa',
    images: [
      'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&h=700&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=600&h=700&fit=crop&auto=format',
    ],
    basePrice: 12990,
    comparePrice: 18990,
    variants: [
      { id: 'v1', sku: 'POL-NEG-S', attributes: { Color: 'Negro', Talla: 'S' }, price: 12990, comparePrice: 18990, stock: 5, available: true },
      { id: 'v2', sku: 'POL-NEG-M', attributes: { Color: 'Negro', Talla: 'M' }, price: 12990, comparePrice: 18990, stock: 12, available: true },
      { id: 'v3', sku: 'POL-NEG-L', attributes: { Color: 'Negro', Talla: 'L' }, price: 12990, comparePrice: 18990, stock: 0, available: false },
      { id: 'v4', sku: 'POL-BLA-M', attributes: { Color: 'Blanco', Talla: 'M' }, price: 12990, comparePrice: 18990, stock: 8, available: true },
    ],
    attributes: { Color: ['Negro', 'Blanco', 'Azul marino'], Talla: ['S', 'M', 'L', 'XL'] },
    tags: ['algodón', 'básico', 'oferta'],
    featured: true,
    status: 'active',
    createdAt: '2025-01-15',
  },
  {
    id: 'p2',
    name: 'Mochila Urbana Pro',
    description: 'Mochila de 28L con compartimento acolchado para laptop 15", impermeable y con Puerto USB.',
    category: 'Accesorios',
    images: [
      'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&h=700&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=600&h=700&fit=crop&auto=format',
    ],
    basePrice: 49990,
    variants: [
      { id: 'v5', sku: 'MOC-NEG-28L', attributes: { Color: 'Negro', Capacidad: '28L' }, price: 49990, stock: 15, available: true },
      { id: 'v6', sku: 'MOC-GRI-28L', attributes: { Color: 'Gris', Capacidad: '28L' }, price: 49990, stock: 6, available: true },
    ],
    attributes: { Color: ['Negro', 'Gris', 'Verde oliva'], Capacidad: ['20L', '28L'] },
    tags: ['mochila', 'laptop', 'urbano'],
    featured: true,
    status: 'active',
    createdAt: '2025-02-01',
  },
  {
    id: 'p3',
    name: 'Auriculares InSound 300',
    description: 'Auriculares inalámbricos con cancelación de ruido activa, 30h de batería y audio Hi-Fi.',
    category: 'Tecnología',
    images: [
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&h=700&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=600&h=700&fit=crop&auto=format',
    ],
    basePrice: 89990,
    comparePrice: 119990,
    variants: [
      { id: 'v7', sku: 'AUR-NEG-BT', attributes: { Color: 'Negro', Conectividad: 'Bluetooth' }, price: 89990, comparePrice: 119990, stock: 20, available: true },
      { id: 'v8', sku: 'AUR-PLA-BT', attributes: { Color: 'Plateado', Conectividad: 'Bluetooth' }, price: 89990, comparePrice: 119990, stock: 7, available: true },
    ],
    attributes: { Color: ['Negro', 'Plateado', 'Azul'], Conectividad: ['Bluetooth', 'USB-C'] },
    tags: ['audio', 'wireless', 'oferta'],
    featured: true,
    status: 'active',
    createdAt: '2025-03-10',
  },
  {
    id: 'p4',
    name: 'Planta Suculenta Mix',
    description: 'Set de 3 suculentas en macetas de cerámica artesanal. Perfectas para escritorio o repisa.',
    category: 'Hogar',
    images: [
      'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&h=700&fit=crop&auto=format',
    ],
    basePrice: 14990,
    variants: [
      { id: 'v9', sku: 'PLT-MIX-S', attributes: { Tamaño: 'Pequeño', Material: 'Cerámica' }, price: 14990, stock: 30, available: true },
      { id: 'v10', sku: 'PLT-MIX-M', attributes: { Tamaño: 'Mediano', Material: 'Cerámica' }, price: 24990, stock: 12, available: true },
    ],
    attributes: { Tamaño: ['Pequeño', 'Mediano', 'Grande'], Material: ['Cerámica', 'Terracota'] },
    tags: ['plantas', 'decoración', 'regalo'],
    featured: false,
    status: 'active',
    createdAt: '2025-03-20',
  },
  {
    id: 'p5',
    name: 'Cuaderno Premium A5',
    description: 'Cuaderno de tapa dura, 200 páginas de papel 90g, encuadernación cosida. Hojas punteadas.',
    category: 'Papelería',
    images: [
      'https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=600&h=700&fit=crop&auto=format',
    ],
    basePrice: 8990,
    variants: [
      { id: 'v11', sku: 'CUA-NEG-A5', attributes: { Color: 'Negro', Formato: 'A5 Punteado' }, price: 8990, stock: 50, available: true },
      { id: 'v12', sku: 'CUA-VER-A5', attributes: { Color: 'Verde', Formato: 'A5 Punteado' }, price: 8990, stock: 25, available: true },
    ],
    attributes: { Color: ['Negro', 'Verde', 'Terracota', 'Azul'], Formato: ['A5 Punteado', 'A5 Rayado', 'A4 Punteado'] },
    tags: ['papelería', 'escritura', 'organización'],
    featured: false,
    status: 'active',
    createdAt: '2025-04-01',
  },
  {
    id: 'p6',
    name: 'Café Especialidad Etiopía',
    description: 'Café de origen único, tostado medio-claro. Notas de arándano, jazmín y chocolate. 250g.',
    category: 'Alimentos',
    images: [
      'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&h=700&fit=crop&auto=format',
    ],
    basePrice: 9990,
    variants: [
      { id: 'v13', sku: 'CAF-ETI-MO', attributes: { Molienda: 'Molido', Peso: '250g' }, price: 9990, stock: 40, available: true },
      { id: 'v14', sku: 'CAF-ETI-GR', attributes: { Molienda: 'En grano', Peso: '250g' }, price: 9990, stock: 30, available: true },
    ],
    attributes: { Molienda: ['Molido', 'En grano'], Peso: ['250g', '500g', '1kg'] },
    tags: ['café', 'especialidad', 'orgánico'],
    featured: true,
    status: 'active',
    createdAt: '2025-04-15',
  },
];

export const defaultStoreConfig: StoreConfig = {
  name: 'Mi Tienda',
  description: 'Descubre nuestros productos exclusivos con la mejor calidad y precio.',
  heroImage: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1400&h=800&fit=crop&auto=format',
  bannerImages: [
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1400&h=600&fit=crop&auto=format',
    'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=1400&h=600&fit=crop&auto=format',
  ],
  primaryColor: '#1a3a6b',
  secondaryColor: '#eef1f8',
  accentColor: '#e04b1a',
  template: 'editorial',
  requiresAuth: 'optional',
  paymentMethods: ['Transbank', 'MercadoPago', 'Transferencia bancaria'],
  shippingMethods: ['Chilexpress', 'Starken', 'Retiro en tienda'],
  socialLinks: { instagram: '#', facebook: '#' },
  contactEmail: 'contacto@mitienda.cl',
  contactPhone: '+56 9 1234 5678',
};

export const categories = ['Todos', 'Ropa', 'Accesorios', 'Tecnología', 'Hogar', 'Papelería', 'Alimentos'];

export const formatPrice = (price: number): string =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(price);
