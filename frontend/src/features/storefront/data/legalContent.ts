// Legal pages content model — shared between the emprendedor editor (backoffice)
// and the public store pages. Each page keeps an editable `draft` and the
// currently live `published` copy so the emprendedor can work without affecting
// what buyers see until they hit "Publicar".

import type { LegalContentVersion } from './legalVersions';

export type LegalType = 'terms' | 'privacy' | 'refund' | 'cookies';

export interface CookieBannerConfig {
  title: string;
  message: string;
  acceptText: string;
  declineText: string;
  enabled: boolean;
}

export interface LegalPageDefinition {
  type: LegalType;
  slug: string;
  label: string;
  short: string;
  description: string;
}

export interface LegalPage {
  title: string;
  draft: string;
  published: string;
  lastPublished: string | null; // ISO date string
  version?: number;
  fecha_vigencia?: string | null;
  vigente?: boolean;
  estado?: string;
  banner?: CookieBannerConfig;
  versions?: LegalContentVersion[];
  currentVersionId?: string | null;
}

/** Catálogo único de páginas legales disponibles en el e-commerce. */
export const LEGAL_PAGE_DEFINITIONS: readonly LegalPageDefinition[] = [
  {
    type: 'terms',
    slug: 'terminos',
    label: 'Términos y Condiciones',
    short: 'Términos',
    description: 'Reglas de uso de la tienda, compras y responsabilidades.',
  },
  {
    type: 'privacy',
    slug: 'privacidad',
    label: 'Política de Privacidad',
    short: 'Privacidad',
    description: 'Cómo recopilas, usas y proteges los datos de tus clientes.',
  },
  {
    type: 'refund',
    slug: 'reembolso',
    label: 'Política de Reembolso',
    short: 'Reembolsos',
    description: 'Condiciones de devolución y reembolso según la Ley del Consumidor.',
  },
  {
    type: 'cookies',
    slug: 'cookies',
    label: 'Política de Cookies',
    short: 'Cookies',
    description: 'Información sobre el uso de cookies y tecnologías de seguimiento en la tienda.',
  },
] as const;

export const LEGAL_ORDER: LegalType[] = LEGAL_PAGE_DEFINITIONS.map(({ type }) => type);

export const LEGAL_META: Record<LegalType, Omit<LegalPageDefinition, 'type' | 'slug'>> =
  Object.fromEntries(
    LEGAL_PAGE_DEFINITIONS.map(({ type, slug: _slug, ...metadata }) => [type, metadata]),
  ) as Record<LegalType, Omit<LegalPageDefinition, 'type' | 'slug'>>;

export const LEGAL_SLUGS: Record<LegalType, string> = Object.fromEntries(
  LEGAL_PAGE_DEFINITIONS.map(({ type, slug }) => [type, slug]),
) as Record<LegalType, string>;

const TERMS = `**1. Aceptación de los términos**

Al acceder y utilizar esta plataforma de comercio electrónico, usted acepta cumplir y quedar vinculado por los presentes Términos y Condiciones. Si no acepta estos términos, no debe utilizar el servicio.

**2. Descripción del servicio**

Esta plataforma permite a emprendedores comercializar sus productos a través de una tienda en línea. La Universidad Autónoma de Chile provee la infraestructura tecnológica a través de su programa de emprendimiento.

**3. Registro y cuenta de usuario**

Para realizar compras puede requerirse la creación de una cuenta. Usted es responsable de mantener la confidencialidad de sus credenciales de acceso.

**4. Política de compras**

Los precios mostrados incluyen IVA cuando corresponde. El vendedor es responsable de la descripción y disponibilidad de los productos.

**5. Limitación de responsabilidad**

La plataforma actúa como intermediario tecnológico. La responsabilidad directa sobre los productos recae en el emprendedor/vendedor.

**6. Modificaciones**

Nos reservamos el derecho de modificar estos términos con previo aviso a los usuarios registrados.`;

const PRIVACY = `**1. Información que recopilamos**

Recopilamos información que usted nos proporciona directamente al crear una cuenta, realizar una compra o contactarnos, incluyendo nombre, correo electrónico, dirección y datos de pago (procesados de forma segura por proveedores externos).

**2. Uso de la información**

Utilizamos su información para procesar pedidos, comunicar el estado de sus compras, mejorar nuestros servicios y cumplir con obligaciones legales.

**3. Compartir información**

No vendemos ni cedemos su información personal a terceros, salvo cuando sea necesario para procesar su pedido (por ejemplo, empresas de despacho) o cuando la ley lo requiera.

**4. Seguridad**

Implementamos medidas de seguridad técnicas y organizativas para proteger su información personal contra acceso no autorizado.

**5. Derechos del titular**

Tiene derecho a acceder, rectificar o eliminar sus datos personales contactándonos a través de los canales habilitados.

**6. Cookies**

Utilizamos cookies para mejorar la experiencia de navegación. Puede configurar su navegador para rechazarlas, aunque esto puede afectar la funcionalidad del sitio.`;

const REFUND = `**1. Derecho a devolución**

Según la Ley del Consumidor chilena, tiene derecho a devolver un producto dentro de los 10 días hábiles desde la recepción si este no corresponde a lo ofertado.

**2. Condiciones de devolución**

Para solicitar un reembolso el producto debe: estar en su estado original sin uso, con embalaje original cuando corresponda, y acompañado de la boleta o comprobante de compra.

**3. Proceso de reembolso**

Contacte al vendedor a través de los medios indicados en la tienda. El vendedor tiene 10 días hábiles para procesar la solicitud. Los reembolsos se realizan por el mismo medio de pago utilizado en la compra.

**4. Excepciones**

No aplican reembolsos para: productos personalizados creados específicamente para el comprador, productos digitales una vez descargados, productos de higiene personal sin sellar.

**5. Productos defectuosos**

Si el producto presenta defectos de fabricación, tiene derecho a reparación, reemplazo o devolución del dinero según la garantía legal correspondiente.`;

const COOKIES = `**1. ¿Qué son las cookies?**

Las cookies son pequeños archivos de texto que los sitios web almacenan en su navegador o dispositivo para recordar información sobre su visita, facilitar la navegación y mejorar su experiencia de usuario.

**2. Tipos de cookies que utilizamos**

- **Cookies técnicas y necesarias:** Esenciales para el funcionamiento básico del e-commerce, como mantener su sesión iniciada, recordar los artículos en su carrito de compras y procesar el pago de forma segura.
- **Cookies de personalización:** Permiten recordar sus preferencias de navegación (como idioma o moneda seleccionada).
- **Cookies de análisis y rendimiento:** Nos ayudan a comprender cómo interactúan los usuarios con nuestra tienda, qué productos son más visitados y optimizar el rendimiento técnico del sitio.

**3. Finalidad del tratamiento**

Utilizamos estas tecnologías únicamente para brindarle un servicio seguro, eficiente y adaptado a sus necesidades comerciales. No utilizamos cookies para vender sus datos a terceros con fines publicitarios no autorizados.

**4. Gestión y configuración de cookies**

Usted puede configurar o deshabilitar el uso de cookies en cualquier momento a través de la configuración de su navegador web (Google Chrome, Mozilla Firefox, Safari, Microsoft Edge). Tenga en cuenta que bloquear ciertas cookies necesarias puede afectar el funcionamiento correcto de la tienda y del proceso de compra.

**5. Actualizaciones de la política**

Podemos actualizar esta Política de Cookies para reflejar cambios tecnológicos o normativos. Se informará a los usuarios sobre cambios relevantes a través de nuestro sitio web.`;

export const LEGAL_TEMPLATES: Record<LegalType, string> = {
  terms: TERMS,
  privacy: PRIVACY,
  refund: REFUND,
  cookies: COOKIES,
};

export const defaultCookieBanner: CookieBannerConfig = {
  title: 'Aviso de Cookies',
  message: 'Utilizamos cookies propias y de terceros para garantizar el funcionamiento seguro de la tienda, recordar tus preferencias y analizar la navegación. Para más información, consulta nuestra',
  acceptText: 'Aceptar cookies',
  declineText: 'Solo necesarias',
  enabled: true,
};

export const defaultLegalPages: Record<LegalType, LegalPage> = {
  terms: { title: LEGAL_META.terms.label, draft: TERMS, published: TERMS, lastPublished: '2025-08-01' },
  privacy: { title: LEGAL_META.privacy.label, draft: PRIVACY, published: PRIVACY, lastPublished: '2025-08-01' },
  refund: { title: LEGAL_META.refund.label, draft: REFUND, published: REFUND, lastPublished: '2025-08-01' },
  cookies: {
    title: LEGAL_META.cookies.label,
    draft: COOKIES,
    published: COOKIES,
    lastPublished: '2025-08-01',
    banner: defaultCookieBanner,
  },
};
