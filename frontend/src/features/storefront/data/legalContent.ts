// Legal pages content model — shared between the emprendedor editor (backoffice)
// and the public store pages. Each page keeps an editable `draft` and the
// currently live `published` copy so the emprendedor can work without affecting
// what buyers see until they hit "Publicar".

export type LegalType = 'terms' | 'privacy' | 'refund';

export interface LegalPage {
  title: string;
  draft: string;
  published: string;
  lastPublished: string | null; // ISO date string
}

export const LEGAL_META: Record<LegalType, { label: string; short: string; description: string }> = {
  terms: {
    label: 'Términos y Condiciones',
    short: 'Términos',
    description: 'Reglas de uso de la tienda, compras y responsabilidades.',
  },
  privacy: {
    label: 'Política de Privacidad',
    short: 'Privacidad',
    description: 'Cómo recopilas, usas y proteges los datos de tus clientes.',
  },
  refund: {
    label: 'Política de Reembolso',
    short: 'Reembolsos',
    description: 'Condiciones de devolución y reembolso según la Ley del Consumidor.',
  },
};

export const LEGAL_ORDER: LegalType[] = ['terms', 'privacy', 'refund'];

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

export const LEGAL_TEMPLATES: Record<LegalType, string> = {
  terms: TERMS,
  privacy: PRIVACY,
  refund: REFUND,
};

export const defaultLegalPages: Record<LegalType, LegalPage> = {
  terms: { title: LEGAL_META.terms.label, draft: TERMS, published: TERMS, lastPublished: '2025-08-01' },
  privacy: { title: LEGAL_META.privacy.label, draft: PRIVACY, published: PRIVACY, lastPublished: '2025-08-01' },
  refund: { title: LEGAL_META.refund.label, draft: REFUND, published: REFUND, lastPublished: '2025-08-01' },
};
