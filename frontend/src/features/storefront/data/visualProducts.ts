export interface VisualProduct {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  image: string;
}

export const visualProducts: VisualProduct[] = [
  {
    id: 'p1',
    name: 'Billetera Cuero Plana',
    category: 'Accesorios',
    description:
      'Billetera de cuero curtido vegetal, costura a mano. Capacidad para 6 tarjetas y billetes. Se patina con el uso.',
    price: 24900,
    image:
      'https://images.unsplash.com/photo-1579014134953-1580d7f123f3?w=800&h=900&fit=crop&auto=format',
  },
  {
    id: 'p4',
    name: 'Vela Botánica Soja',
    category: 'Hogar',
    description:
      'Vela de cera de soja con extracto de flores secas. Aroma a lavanda y madera. Quema limpia de hasta 45 horas.',
    price: 12900,
    image:
      'https://images.unsplash.com/photo-1631700962214-7a2ba7727287?w=600&h=700&fit=crop&auto=format',
  },
  {
    id: 'p5',
    name: 'Cuaderno Tapas Duras',
    category: 'Papelería',
    description:
      'Cuaderno A5 con tapas rígidas y papel de 120 g/m². 192 páginas lisas. Encuadernación cosida a la vista.',
    price: 9900,
    image:
      'https://images.unsplash.com/photo-1568945721873-b249709fe8fb?w=600&h=500&fit=crop&auto=format',
  },
  {
    id: 'p2',
    name: 'Polera Algodón Orgánico',
    category: 'Vestuario',
    description:
      'Polera unisex en algodón 100% orgánico certificado GOTS. Corte recto y holgado. Disponible en tallas XS–XL.',
    price: 19900,
    image:
      'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=700&h=850&fit=crop&auto=format',
  },
  {
    id: 'p6',
    name: 'Florero Minimalista',
    category: 'Decoración',
    description:
      'Florero de boca angosta, ideal para ramas secas o flores de tallo largo. Acabado mate en blanco neutro. Diseño minimalista escandinavo.',
    price: 18500,
    image:
      'https://images.unsplash.com/photo-1603252711728-c430e4cf5b36?w=600&h=800&fit=crop&auto=format',
  },
  {
    id: 'p3',
    name: 'Kit Escritorio Cuero',
    category: 'Accesorios',
    description:
      'Set de escritorio en cuero natural: portanotas, posavasos y estuche para lápices. Grabado personalizado disponible.',
    price: 42000,
    image:
      'https://images.unsplash.com/photo-1627123424574-724758594e93?w=800&h=600&fit=crop&auto=format',
  },
];

export const formatVisualPrice = (price: number) =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(price);