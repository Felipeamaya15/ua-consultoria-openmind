import type { StorePageId } from '../../visual/pages';
import { lazy, Suspense, type ReactNode } from 'react';
import type { Product } from '../../data/mockData';
const ProductDetail = lazy(() => import('../../pages/ProductDetail'));

// Synthetic examples; the shared product view bypasses public requests and real cart writes.
const art = (color: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 600"><rect width="700" height="600" fill="#f2f0eb"/><path d="M210 190h280l45 285H165z" fill="${color}"/><path d="M280 210v-60a70 70 0 01140 0v60" fill="none" stroke="${color}" stroke-width="22"/></svg>`)}`;
const images = ['#64786c', '#b18b68', '#758aa0'].map(art);
const exampleProduct: Product = {
  id: 'bolso-ejemplo', name: 'Bolso de algodón', description: 'Un bolso práctico, liviano y reutilizable. Algodón natural, costuras reforzadas y espacio para acompañarte cada día.',
  category: 'Accesorios', images, basePrice: 19990, comparePrice: 24990,
  attributes: { Color: ['Natural', 'Verde', 'Azul'], Tamaño: ['Mediano', 'Grande'] },
  variants: ['Natural', 'Verde', 'Azul'].flatMap((Color, index) => ['Mediano', 'Grande'].map((Tamaño, size) => ({ id: `example-${index}-${size}`, sku: `EJEMPLO-${index}-${size}`, attributes: { Color, Tamaño }, price: 19990, comparePrice: 24990, stock: 12, available: true }))),
  tags: [], featured: false, status: 'active', createdAt: '',
};
const Section = ({ title, children }: { title: string; children: ReactNode }) => <section data-page-panel data-visual-section="pagePanel"><h2>{title}</h2>{children}</section>;
const Field = ({ label, value = '' }: { label: string; value?: string }) => <label className="ve-example-field">{label}<input readOnly value={value} placeholder={label} /></label>;
const Action = ({ children, outline = false }: { children: ReactNode; outline?: boolean }) => <button type="button" data-visual-section="pageButton" data-page-action={outline ? 'outline' : 'primary'}>{children}</button>;
function Summary() { return <Section title="Resumen del pedido"><p>Bolso de algodón × 2 <strong>$39.980</strong></p><p>Subtotal <strong>$39.980</strong></p><p>Envío <strong>$3.990</strong></p><p>Total <strong data-page-price>$43.970</strong></p></Section>; }
function Order() { return <Section title="Pedido de ejemplo #EJEMPLO-001"><p>Bolso de algodón · Natural · 2 unidades</p><p>Total: $43.970 · Transferencia</p><ol className="ve-example-timeline"><li>✓ Recibido</li><li>✓ Pago confirmado</li><li>Preparando tu pedido</li><li>En camino</li><li>Entregado</li></ol></Section>; }
export const EXAMPLE_PAGES: readonly StorePageId[] = ['product', 'cart', 'login', 'checkout', 'confirmation', 'tracking', 'profile', 'orders'];
export function EditorPageExample({ page, search }: { page: StorePageId; search: string }) {
  if (page === 'product') return <><p role="note">Datos ficticios para editar el diseño. No se realiza ninguna compra.</p><Suspense fallback={<p role="status">Cargando vista previa del producto…</p>}><ProductDetail previewProduct={exampleProduct} /></Suspense></>;
  const params = new URLSearchParams(search);
  const step = params.get('visualStep') || 'contact';
  const register = params.get('modo') === 'registro';
  let content: ReactNode;
  if (page === 'cart') content = <><h1>Tu carrito</h1><div data-page-columns className="ve-example-columns"><Section title="Productos"><div className="ve-example-item"><img data-page-item-image src={images[0]} alt="Bolso de algodón" /><div><h2>Bolso de algodón</h2><p>Color: Natural · Mediano</p><div data-page-quantity><Field label="Cantidad" value="2" /></div><p data-page-price>$39.980</p><Action outline>Eliminar</Action></div></div></Section><div><Summary /><Action>Continuar al checkout</Action><Action outline>Seguir comprando</Action></div></div></>;
  else if (page === 'login') content = <form data-page-form onSubmit={e => e.preventDefault()}><Section title={register ? 'Crear cuenta' : 'Iniciar sesión'}><p>{register ? 'Completa tus datos para registrarte' : 'Accede a tu cuenta de cliente'}</p>{register && <Field label="Nombre" value="María Ejemplo" />}<Field label="Correo electrónico" value="cliente@example.test" /><Field label="Contraseña" value="••••••••" />{register && <Field label="Confirmar contraseña" value="••••••••" />}<Action>{register ? 'Crear cuenta' : 'Iniciar sesión'}</Action><Action outline>{register ? 'Ya tengo cuenta' : 'Registrarme'}</Action></Section></form>;
  else if (page === 'confirmation' || (page === 'checkout' && step === 'confirm')) content = <><h1>¡Gracias por tu compra!</h1><p>Confirmación de ejemplo, sin pedido creado.</p><Order /><div className="ve-example-actions"><Action>Ver mi pedido</Action><Action outline>Seguir comprando</Action></div></>;
  else if (page === 'checkout') content = <><h1>Checkout · {step === 'delivery' ? 'Entrega' : step === 'payment' ? 'Pago' : 'Contacto'}</h1><div data-page-columns className="ve-example-columns"><Section title={step === 'delivery' ? 'Opciones de entrega' : step === 'payment' ? 'Métodos de pago' : 'Datos de contacto'}>
    {step === 'contact' && <><Field label="Nombre" value="María Ejemplo" /><Field label="Correo electrónico" value="cliente@example.test" /><Field label="Teléfono" value="+56 9 1234 5678" /></>}
    {step === 'delivery' && <><label><input type="radio" name="example-delivery" defaultChecked /> Despacho a domicilio · $3.990</label><label><input type="radio" name="example-delivery" /> Retiro en tienda · Gratis</label><Field label="Dirección" value="Calle de ejemplo 123" /><Field label="Región" value="Metropolitana" /><Field label="Comuna" value="Santiago" /><p>Transportista de ejemplo · 2 a 4 días hábiles</p></>}
    {step === 'payment' && <><label><input type="radio" name="example-payment" defaultChecked /> Transferencia bancaria</label><label><input type="radio" name="example-payment" /> Webpay · Tarjetas</label><p>Instrucciones de ejemplo: transferencia a la cuenta indicada por la tienda. Estos métodos son ilustrativos; su disponibilidad real depende de la configuración de pagos.</p></>}
    <Action>{step === 'payment' ? 'Confirmar compra' : 'Continuar'}</Action></Section><Summary /></div></>;
  else if (page === 'tracking') content = <><h1>Seguimiento de tu pedido</h1><form data-page-form onSubmit={e => e.preventDefault()}><Section title="Buscar pedido"><Field label="Número de pedido" value="EJEMPLO-001" /><Field label="Correo electrónico" value="cliente@example.test" /><Action>Consultar pedido</Action></Section></form><Order /></>;
  else if (page === 'profile') content = <><h1>Mi perfil</h1><form data-page-form onSubmit={e => e.preventDefault()}><Section title="Datos personales"><Field label="Nombre" value="María Ejemplo" /><Field label="Correo electrónico" value="cliente@example.test" /><Field label="Teléfono" value="+56 9 1234 5678" /><Field label="Dirección" value="Calle de ejemplo 123" /><Action>Guardar cambios</Action></Section></form></>;
  else content = <><h1>Mis pedidos</h1><Section title="Pedidos recientes"><p>EJEMPLO-001 · Preparando · $43.970</p><Action outline>Ver detalle</Action><p>EJEMPLO-002 · Entregado · $19.990</p><Action outline>Ver detalle</Action></Section><Order /></>;
  return <div className="ve-example" data-landing-content><p role="note">Vista previa de diseño · Datos ficticios. Los botones seleccionan su apariencia y no realizan operaciones.</p>{content}</div>;
}
