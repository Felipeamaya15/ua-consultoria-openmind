export const ADMIN_PAGE_HELP = {
  '/emprendedor': { title: 'Resumen de tu tienda', description: 'Revisa cómo va tu tienda y accede a las principales herramientas para administrar tu negocio.' },
  '/emprendedor/landing': { title: 'Página principal', description: 'Personaliza la página principal de tu tienda: cambia el título, la descripción, la imagen y el botón que verán tus clientes.' },
  '/emprendedor/productos': { title: 'Productos', description: 'Agrega, edita y organiza los productos que tus clientes podrán comprar. Revisa sus precios y las unidades disponibles.' },
  '/emprendedor/pedidos': { title: 'Pedidos', description: 'Revisa las compras, su estado y los datos que necesitas para preparar cada entrega.' },
  '/emprendedor/diseno': { title: 'Diseño de tu tienda', description: 'Elige una plantilla y personaliza los colores, las letras y la apariencia de tu tienda.' },
  '/emprendedor/promociones': { title: 'Promociones', description: 'Crea y administra promociones para tus productos o campañas. Comprueba sus condiciones antes de compartirlas.' },
  '/emprendedor/pagos': { title: 'Formas de pago', description: 'Configura las formas de pago que podrán usar tus clientes. Completa los datos del proveedor que quieras habilitar.' },
  '/emprendedor/entregas': { title: 'Entregas y retiro', description: 'Define cómo recibirán sus compras tus clientes y cuánto cobrarás por cada destino. También puedes ofrecer retiro en tienda.' },
  '/emprendedor/autenticacion': { title: 'Acceso de clientes', description: 'Elige cómo podrán registrarse e iniciar sesión tus clientes, y si necesitan una cuenta para comprar.' },
  '/emprendedor/correos': { title: 'Correos para tus clientes', description: 'Personaliza los mensajes preparados para informar a tus clientes sobre sus compras.' },
  '/emprendedor/seo': { title: 'Tu tienda en buscadores', description: 'Mejora cómo se presenta tu tienda en los buscadores. Los campos de medición son opcionales.' },
  '/emprendedor/configuracion': { title: 'Datos de tu negocio', description: 'Administra el nombre, el logo y los datos de contacto de tu tienda. Los campos marcados como obligatorios deben completarse.' },
  '/emprendedor/legal': { title: 'Páginas legales', description: 'Prepara los textos de términos, privacidad y devoluciones que podrán consultar tus clientes. Revisa que correspondan a tu negocio.' },
  '/emprendedor/perfil': { title: 'Tu cuenta', description: 'Revisa y actualiza tus datos personales y de contacto.' },
} as const;
export function getAdminPageHelp(pathname: string) {
  const path = pathname.replace(/\/$/, '');
  if (path === '/emprendedor/diseno/editor') return undefined;
  return Object.entries(ADMIN_PAGE_HELP).find(([route]) => path === route || route !== '/emprendedor' && path.startsWith(route + '/'))?.[1];
}
