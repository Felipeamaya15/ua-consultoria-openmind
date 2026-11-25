
import type { TemplateId } from '../../storefront/data/mockData';

export const PUBLIC_STORE_PATH = '/';

export const templatePaths: Record<TemplateId, string> = {
  editorial: '/admin/preview/plantilla/1',
  minimal: '/admin/preview/plantilla/2',
  visual: '/admin/preview/plantilla/3',
  catalog: '/admin/preview/plantilla/4',
};

export const legalSlugs = {
  terms: 'terminos',
  privacy: 'privacidad',
  refund: 'reembolso',
  cookies: 'cookies',
} as const;

export const menuItems = [
  { path: '/emprendedor', label: 'Estadísticas', icon: 'grid' },
  { path: '/emprendedor/productos', label: 'Productos', icon: 'box' },
  { path: '/emprendedor/pedidos', label: 'Pedidos', icon: 'orders' },
  { path: '/emprendedor/ventas', label: 'Ventas', icon: 'file' },
  { path: '/emprendedor/landing', label: 'Página principal', icon: 'home' },
  { path: '/emprendedor/actividades', label: 'Servicios y talleres', icon: 'file' },
  { path: '/emprendedor/diseno', label: 'Diseño', icon: 'settings' },
  { path: '/emprendedor/promociones', label: 'Promociones', icon: 'link' },
  { path: '/emprendedor/marketing', label: 'Marketing', icon: 'arrowUpRight' },
  { path: '/emprendedor/pagos', label: 'Pagos', icon: 'card' },
  { path: '/emprendedor/entregas', label: 'Entregas', icon: 'truck' },
  { path: '/emprendedor/autenticacion', label: 'Acceso de clientes', icon: 'shield' },
  { path: '/emprendedor/contactos', label: 'Contactos', icon: 'user' },
  { path: '/emprendedor/correos', label: 'Correos', icon: 'mail' },
  { path: '/emprendedor/seo', label: 'Buscadores y visitas', icon: 'search' },
];
