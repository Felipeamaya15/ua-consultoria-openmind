import type { TemplateId } from '../../storefront/data/mockData';
export const templatePaths: Record<TemplateId,string> = {editorial:'/plantilla/1',minimal:'/plantilla/2',visual:'/plantilla/3',catalog:'/plantilla/4'};
export const legalSlugs = {terms:'terminos',privacy:'privacidad',refund:'reembolso'} as const;
export const menuItems = [
  {path:'/emprendedor',label:'Dashboard',icon:'grid'},
  {path:'/emprendedor/productos',label:'Productos',icon:'box'},
  {path:'/emprendedor/pedidos',label:'Pedidos',icon:'orders'},
  {path:'/emprendedor/diseno',label:'Diseño',icon:'settings'},
  {path:'/emprendedor/landing',label:'Landing Page',icon:'home'},
  {path:'/emprendedor/promociones',label:'Promociones',icon:'link'},
  {path:'/emprendedor/pagos',label:'Pagos',icon:'card'},
  {path:'/emprendedor/entregas',label:'Entregas',icon:'truck'},
  {path:'/emprendedor/autenticacion',label:'Autenticación',icon:'shield'},
  {path:'/emprendedor/correos',label:'Correos',icon:'mail'},
  {path:'/emprendedor/seo',label:'SEO / Analítica',icon:'search'},
  {path:'/emprendedor/configuracion',label:'Configuración',icon:'settings'},
];
