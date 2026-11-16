import { legalSlugs } from './navigation';

export interface PanelSearchFeature {
  id: string;
  label: string;
  description: string;
  to: string;
  keywords: string[];
}

export interface PanelSearchModule {
  id: string;
  label: string;
  icon: string;
  to: string;
  keywords: string[];
  features: PanelSearchFeature[];
}

export interface AdminSearchResult {
  module: PanelSearchModule;
  moduleMatched: boolean;
  matchingFeatures: PanelSearchFeature[];
}

export const PANEL_SEARCH_MODULES: PanelSearchModule[] = [
  {
    id: 'dashboard',
    label: 'Estadísticas',
    icon: 'grid',
    to: '/emprendedor',
    keywords: ['inicio', 'dashboard', 'resumen', 'metricas', 'analisis', 'ventas', 'graficos'],
    features: [
      {
        id: 'dashboard-metrics',
        label: 'Métricas comerciales y período',
        description: 'Consulta ingresos, pedidos y rendimiento de los últimos 7 días, 30 días o el año.',
        to: '/emprendedor',
        keywords: ['ingresos', 'kpi', 'ticket promedio', 'periodo', 'rendimiento', 'estadisticas'],
      },
      {
        id: 'dashboard-recent-orders',
        label: 'Pedidos recientes',
        description: 'Revisa rápidamente las últimas compras recibidas en tu tienda.',
        to: '/emprendedor',
        keywords: ['ultimos pedidos', 'compras recientes', 'actividad'],
      },
      {
        id: 'dashboard-reports',
        label: 'Reportes e informes (PDF y Excel)',
        description: 'Descarga informes comerciales por año o mes en PDF o Excel.',
        to: '/emprendedor',
        keywords: ['informes', 'reportes', 'pdf', 'excel', 'descargar', 'exportar'],
      },
    ],
  },
  {
    id: 'products',
    label: 'Productos',
    icon: 'box',
    to: '/emprendedor/productos',
    keywords: ['catalogo', 'inventario', 'articulos', 'stock', 'precios', 'sku'],
    features: [
      {
        id: 'products-create',
        label: 'Crear nuevo producto',
        description: 'Agrega un producto con fotos, video, variantes, precios y stock.',
        to: '/emprendedor/productos/nuevo',
        keywords: ['nuevo producto', 'agregar producto', 'publicar producto', 'subir producto'],
      },
      {
        id: 'products-catalog',
        label: 'Catálogo, variantes, stock y ofertas',
        description: 'Edita precios, descuentos, stock disponible, SEO y estado activo o desactivado.',
        to: '/emprendedor/productos',
        keywords: ['variantes', 'tallas', 'colores', 'stock bajo', 'oferta', 'descuento', 'desactivar', 'eliminar', 'video', 'seo'],
      },
    ],
  },
  {
    id: 'orders',
    label: 'Pedidos',
    icon: 'orders',
    to: '/emprendedor/pedidos',
    keywords: ['ordenes', 'compras', 'despachos', 'clientes', 'entregas'],
    features: [
      {
        id: 'orders-list',
        label: 'Gestión y estados de pedidos',
        description: 'Filtra por estado o fecha, revisa el detalle y actualiza el avance del pedido.',
        to: '/emprendedor/pedidos',
        keywords: ['buscar pedido', 'estado', 'enviado', 'entregado', 'cancelado', 'exportar excel'],
      },
      {
        id: 'orders-pending',
        label: 'Pedidos pendientes y validar transferencias',
        description: 'Verifica pagos por transferencia bancaria o Linkify y envía notificaciones.',
        to: '/emprendedor/pedidos?estado=pendiente',
        keywords: ['pendientes', 'transferencia', 'linkify', 'confirmar pago', 'validar pago'],
      },
    ],
  },
  {
    id: 'sales',
    label: 'Ventas',
    icon: 'file',
    to: '/emprendedor/ventas',
    keywords: ['ingresos', 'facturacion', 'pagos confirmados', 'ticket'],
    features: [
      {
        id: 'sales-summary',
        label: 'Resumen y productos más vendidos',
        description: 'Analiza el total vendido, ticket promedio y top de productos por SKU.',
        to: '/emprendedor/ventas?vista=resumen',
        keywords: ['resumen', 'mas vendidos', 'sku', 'total vendido', 'ticket promedio'],
      },
      {
        id: 'sales-history',
        label: 'Historial de ventas y exportar Excel',
        description: 'Consulta el detalle cronológico de ventas confirmadas y descárgalo en Excel.',
        to: '/emprendedor/ventas?vista=historial',
        keywords: ['historial', 'exportar', 'excel', 'fechas'],
      },
    ],
  },
  {
    id: 'landing',
    label: 'Página principal',
    icon: 'home',
    to: '/emprendedor/landing',
    keywords: ['landing', 'inicio tienda', 'contenido', 'negocio', 'portada', 'secciones', 'horarios'],
    features: [
      {
        id: 'landing-business',
        label: 'Información del negocio y conexión de correo',
        description: 'Configura nombre de la tienda, descripción, correo y envío desde Gmail o SMTP.',
        to: '/emprendedor/landing#informacion-negocio',
        keywords: ['nombre tienda', 'correo negocio', 'gmail', 'smtp', 'conectar correo'],
      },
      {
        id: 'landing-cover',
        label: 'Portada, logo y carrusel de imágenes',
        description: 'Edita el título principal, botón de acción, imagen de portada, logo y carrusel.',
        to: '/emprendedor/landing#pagina-principal',
        keywords: ['hero', 'banner', 'carrusel', 'logo', 'imagen principal', 'titulo principal'],
      },
      {
        id: 'landing-sections',
        label: 'Secciones de mi tienda (servicios, talleres y bloques)',
        description: 'Crea, ordena y edita historias, galerías, destacados, servicios y talleres.',
        to: '/emprendedor/landing#secciones-tienda',
        keywords: ['secciones', 'bloques', 'servicios', 'talleres', 'galeria', 'historia', 'multimedia', 'formulario'],
      },
      {
        id: 'landing-benefits',
        label: 'Beneficios de comprar en tu tienda',
        description: 'Destaca ventajas como envíos, garantías o atención personalizada.',
        to: '/emprendedor/landing#beneficios',
        keywords: ['beneficios', 'ventajas', 'iconos'],
      },
      {
        id: 'landing-contact',
        label: 'Contacto, horarios, dirección y redes sociales',
        description: 'Define teléfono, WhatsApp, dirección en Chile, Google Maps, horarios y redes.',
        to: '/emprendedor/landing#contacto-horarios',
        keywords: ['whatsapp', 'telefono', 'direccion', 'mapa', 'google maps', 'horarios', 'instagram', 'facebook'],
      },
    ],
  },
  {
    id: 'activities',
    label: 'Servicios y talleres',
    icon: 'file',
    to: '/emprendedor/actividades',
    keywords: ['actividades', 'cursos', 'charlas', 'consultas', 'inscripciones', 'cupos', 'formularios'],
    features: [
      {
        id: 'activities-consultations',
        label: 'Solicitudes de información (consultas)',
        description: 'Revisa preguntas de clientes, responde por correo y archiva consultas resueltas.',
        to: '/emprendedor/actividades?tipo=consulta',
        keywords: ['consultas', 'dudas', 'preguntas', 'responder', 'archivadas', 'vigentes'],
      },
      {
        id: 'activities-enrollments',
        label: 'Inscripciones a talleres gratuitos',
        description: 'Administra participantes inscritos, confirma o cancela cupos.',
        to: '/emprendedor/actividades?tipo=inscripcion',
        keywords: ['inscripciones', 'participantes', 'cupos', 'talleres gratuitos', 'confirmar'],
      },
      {
        id: 'activities-builder',
        label: 'Crear o editar formularios de servicios y talleres',
        description: 'Configura secciones de servicios y talleres con fechas, horarios y formularios.',
        to: '/emprendedor/landing#secciones-tienda',
        keywords: ['crear servicio', 'crear taller', 'editar taller', 'editar servicio', 'formulario'],
      },
    ],
  },
  {
    id: 'design',
    label: 'Diseño',
    icon: 'settings',
    to: '/emprendedor/diseno',
    keywords: ['apariencia', 'plantillas', 'colores', 'tema', 'paletas', 'tipografia'],
    features: [
      {
        id: 'design-templates',
        label: 'Plantillas y paletas de colores',
        description: 'Elige entre Studio Pop, Soft Discovery, Velta Editorial u Obsidian Showcase.',
        to: '/emprendedor/diseno',
        keywords: ['plantilla', 'studio pop', 'soft discovery', 'velta', 'obsidian', 'paleta', 'colores'],
      },
      {
        id: 'design-editor',
        label: 'Editor visual en vivo',
        description: 'Personaliza colores, fuentes, botones e imágenes viendo tu tienda en tiempo real.',
        to: '/emprendedor/diseno/editor',
        keywords: ['editor visual', 'fuentes', 'tipografia', 'personalizar', 'vista previa'],
      },
    ],
  },
  {
    id: 'promotions',
    label: 'Promociones',
    icon: 'link',
    to: '/emprendedor/promociones',
    keywords: ['cupones', 'descuentos', 'codigos', 'ofertas'],
    features: [
      {
        id: 'promotions-coupons',
        label: 'Cupones y códigos de descuento',
        description: 'Crea códigos por porcentaje, monto fijo o envío gratis con fechas y límite de usos.',
        to: '/emprendedor/promociones',
        keywords: ['codigo promocional', 'porcentaje', 'envio gratis', 'vigencia', 'usos'],
      },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: 'arrowUpRight',
    to: '/emprendedor/marketing',
    keywords: ['publicaciones', 'redes sociales', 'difusion', 'afiches', 'biblioteca'],
    features: [
      {
        id: 'marketing-posts',
        label: 'Generador de publicaciones y borradores',
        description: 'Diseña piezas gráficas de tus productos o actividades y descárgalas en PNG o JPG.',
        to: '/emprendedor/marketing',
        keywords: ['publicacion', 'flyer', 'png', 'jpg', 'borradores', 'instagram'],
      },
      {
        id: 'marketing-library',
        label: 'Biblioteca multimedia',
        description: 'Sube y reutiliza imágenes, videos y enlaces en tus secciones y publicaciones.',
        to: '/emprendedor/marketing#biblioteca',
        keywords: ['biblioteca', 'imagenes', 'videos', 'archivos', 'multimedia'],
      },
      {
        id: 'marketing-sharing',
        label: 'Difusión de tienda, servicios y talleres',
        description: 'Prepara contenido listo para compartir de tus productos, servicios y talleres.',
        to: '/emprendedor/marketing#difusion',
        keywords: ['difusion', 'compartir', 'enlaces'],
      },
      {
        id: 'marketing-social',
        label: 'Estado de redes sociales',
        description: 'Revisa los perfiles sociales conectados de tu tienda.',
        to: '/emprendedor/marketing#redes-sociales',
        keywords: ['redes sociales', 'instagram', 'facebook', 'whatsapp'],
      },
    ],
  },
  {
    id: 'payments',
    label: 'Pagos',
    icon: 'card',
    to: '/emprendedor/pagos',
    keywords: ['cobros', 'medios de pago', 'pasarelas', 'banco', 'tarjetas'],
    features: [
      {
        id: 'payments-gateways',
        label: 'Webpay / Transbank, Mercado Pago, PayPal y TUU',
        description: 'Habilita y configura credenciales de pasarelas de pago con tarjeta o billetera.',
        to: '/emprendedor/pagos',
        keywords: ['transbank', 'webpay', 'mercadopago', 'mercado pago', 'paypal', 'tuu', 'tarjeta'],
      },
      {
        id: 'payments-transfer',
        label: 'Transferencia bancaria, Linkify y expiración',
        description: 'Configura datos bancarios, valida transferencias pendientes y define expiración.',
        to: '/emprendedor/pagos',
        keywords: ['transferencia', 'cuenta bancaria', 'rut', 'linkify', 'expiracion', 'pendientes'],
      },
    ],
  },
  {
    id: 'shipping',
    label: 'Entregas',
    icon: 'truck',
    to: '/emprendedor/entregas',
    keywords: ['envios', 'despacho', 'logistica', 'tarifas', 'retiro'],
    features: [
      {
        id: 'shipping-rates',
        label: 'Tarifas de Chilexpress y Starken por comuna',
        description: 'Configura costos y plazos de despacho por región y comuna de Chile.',
        to: '/emprendedor/entregas',
        keywords: ['chilexpress', 'starken', 'tarifas', 'regiones', 'comunas', 'despacho'],
      },
      {
        id: 'shipping-pickup',
        label: 'Retiro en tienda y horarios de entrega',
        description: 'Habilita el retiro presencial indicando dirección, días y horarios.',
        to: '/emprendedor/entregas',
        keywords: ['retiro en tienda', 'pickup', 'sucursal', 'presencial'],
      },
    ],
  },
  {
    id: 'authentication',
    label: 'Acceso de clientes',
    icon: 'shield',
    to: '/emprendedor/autenticacion',
    keywords: ['login', 'registro', 'cuentas', 'clientes', 'seguridad', 'oauth'],
    features: [
      {
        id: 'auth-methods',
        label: 'Métodos de acceso y regla de compra',
        description: 'Activa inicio con correo o Google y define si comprar requiere cuenta.',
        to: '/emprendedor/autenticacion',
        keywords: ['google', 'contrasena', 'invitado', 'guest checkout', 'cuenta obligatoria'],
      },
    ],
  },
  {
    id: 'contacts',
    label: 'Contactos',
    icon: 'user',
    to: '/emprendedor/contactos',
    keywords: ['clientes', 'correos', 'base de datos', 'consentimiento', 'campanas'],
    features: [
      {
        id: 'contacts-list',
        label: 'Listado de contactos y exportar Excel / CSV',
        description: 'Consulta compradores, su autorización comercial y exporta listas filtradas.',
        to: '/emprendedor/contactos',
        keywords: ['exportar', 'csv', 'excel', 'autorizacion', 'marketing autorizado'],
      },
      {
        id: 'contacts-campaigns',
        label: 'Campañas de correo promocional',
        description: 'Crea borradores, previsualiza y envía campañas a contactos autorizados.',
        to: '/emprendedor/contactos?vista=campanas',
        keywords: ['campanas', 'email marketing', 'boletin', 'newsletter', 'envio masivo'],
      },
    ],
  },
  {
    id: 'emails',
    label: 'Correos',
    icon: 'mail',
    to: '/emprendedor/correos',
    keywords: ['plantillas', 'notificaciones', 'emails', 'mensajes'],
    features: [
      {
        id: 'emails-templates',
        label: 'Plantillas de correos automáticos',
        description: 'Personaliza asunto, vista previa y cuerpo de cada estado de pedido.',
        to: '/emprendedor/correos',
        keywords: ['pedido recibido', 'pago confirmado', 'enviado', 'variables automaticas'],
      },
      {
        id: 'emails-emergency',
        label: 'Envío de correo de emergencia',
        description: 'Dispara manualmente una notificación puntual para un cliente o pedido.',
        to: '/emprendedor/correos',
        keywords: ['emergencia', 'reenviar correo', 'prueba correo'],
      },
    ],
  },
  {
    id: 'seo',
    label: 'Buscadores y visitas',
    icon: 'search',
    to: '/emprendedor/seo',
    keywords: ['seo', 'google', 'analytics', 'meta pixel', 'facebook pixel', 'posicionamiento'],
    features: [
      {
        id: 'seo-meta',
        label: 'Título y descripción SEO de la tienda',
        description: 'Mejora cómo aparece tu tienda en Google y resultados de búsqueda.',
        to: '/emprendedor/seo',
        keywords: ['meta titulo', 'meta descripcion', 'buscadores', 'posicionamiento'],
      },
      {
        id: 'seo-tracking',
        label: 'Google Analytics y Meta Pixel',
        description: 'Conecta tu ID de medición de Analytics y Pixel para seguimiento de campañas.',
        to: '/emprendedor/seo',
        keywords: ['google analytics', 'ga4', 'pixel', 'meta', 'facebook', 'visitas'],
      },
    ],
  },
  {
    id: 'legal',
    label: 'Páginas legales',
    icon: 'file',
    to: `/emprendedor/legal/${legalSlugs.terms}`,
    keywords: ['legal', 'terminos', 'privacidad', 'reembolso', 'devoluciones', 'cookies', 'normativa'],
    features: [
      {
        id: 'legal-terms',
        label: 'Términos y condiciones',
        description: 'Redacta, guarda borrador y publica los términos de uso de tu tienda.',
        to: `/emprendedor/legal/${legalSlugs.terms}`,
        keywords: ['terminos', 'condiciones'],
      },
      {
        id: 'legal-privacy',
        label: 'Política de privacidad',
        description: 'Edita y publica cómo tratas los datos personales de tus clientes.',
        to: `/emprendedor/legal/${legalSlugs.privacy}`,
        keywords: ['privacidad', 'datos personales'],
      },
      {
        id: 'legal-refund',
        label: 'Política de reembolso',
        description: 'Define las condiciones de cambios, devoluciones y garantías.',
        to: `/emprendedor/legal/${legalSlugs.refund}`,
        keywords: ['reembolso', 'devolucion', 'garantia', 'cambios'],
      },
      {
        id: 'legal-cookies',
        label: 'Política de cookies',
        description: 'Informa el uso de cookies y tecnologías de medición en tu tienda.',
        to: `/emprendedor/legal/${legalSlugs.cookies}`,
        keywords: ['cookies', 'consentimiento'],
      },
    ],
  },
  {
    id: 'profile',
    label: 'Mi cuenta / Perfil',
    icon: 'user',
    to: '/emprendedor/perfil',
    keywords: ['perfil', 'cuenta', 'usuario', 'contrasena', 'clave', 'datos personales'],
    features: [
      {
        id: 'profile-settings',
        label: 'Datos personales y cambiar contraseña',
        description: 'Actualiza tu información de cuenta y credenciales de acceso.',
        to: '/emprendedor/perfil',
        keywords: ['cambiar clave', 'contrasena', 'correo perfil', 'nombre'],
      },
    ],
  },
];

export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesAllTokens(haystack: string, tokens: string[]): boolean {
  return tokens.every(token => haystack.includes(token));
}

export function searchAdminPanel(query: string): AdminSearchResult[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  const tokens = normalized.split(' ').filter(Boolean);
  if (!tokens.length) return [];

  const results: AdminSearchResult[] = [];

  for (const module of PANEL_SEARCH_MODULES) {
    const moduleHaystack = normalizeSearchText(
      [module.label, ...module.keywords].join(' '),
    );
    const moduleMatched = matchesAllTokens(moduleHaystack, tokens);

    const matchingFeatures = module.features.filter(feature => {
      const featureHaystack = normalizeSearchText(
        [feature.label, feature.description, ...feature.keywords].join(' '),
      );
      if (matchesAllTokens(featureHaystack, tokens)) return true;
      // Also match combined module + feature context (e.g. "productos seo" or "ventas excel").
      return matchesAllTokens(`${moduleHaystack} ${featureHaystack}`, tokens);
    });

    if (moduleMatched || matchingFeatures.length > 0) {
      results.push({
        module,
        moduleMatched,
        matchingFeatures:
          matchingFeatures.length > 0
            ? matchingFeatures
            : moduleMatched
              ? module.features
              : [],
      });
    }
  }

  // Prioritize direct module label matches first, then feature matches.
  return results.sort((a, b) => {
    const aDirect = normalizeSearchText(a.module.label).includes(normalized) ? 1 : 0;
    const bDirect = normalizeSearchText(b.module.label).includes(normalized) ? 1 : 0;
    if (aDirect !== bDirect) return bDirect - aDirect;
    if (a.moduleMatched !== b.moduleMatched) return Number(b.moduleMatched) - Number(a.moduleMatched);
    return b.matchingFeatures.length - a.matchingFeatures.length;
  });
}
