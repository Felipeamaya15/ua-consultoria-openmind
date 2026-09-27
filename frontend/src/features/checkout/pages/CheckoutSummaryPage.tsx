import React from 'react';

const items = [
  { name: 'Polera Nova Store', detail: 'Talla M · Color negro', quantity: 2, price: 15990 },
  { name: 'Mug corporativo', detail: 'Ceramica · 350 ml', quantity: 1, price: 8990 },
  { name: 'Sticker pack', detail: 'Set de 6 unidades', quantity: 1, price: 3990 },
];

const currencyFormatter = new Intl.NumberFormat('es-CL', {
  currency: 'CLP',
  style: 'currency',
});

const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
const shipping = 2990;
const discount = 5000;
const total = subtotal + shipping - discount;

export const CheckoutSummaryPage: React.FC = () => {
  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#f7f7fb', fontFamily: 'sans-serif', padding: '2rem' }}>
      <section style={{ maxWidth: '1120px', margin: '0 auto' }}>
        <header style={{ marginBottom: '2rem' }}>
          <p style={{ color: '#5454EB', fontWeight: 800, margin: '0 0 0.5rem' }}>SCRUM-151</p>
          <h1 style={{ color: '#111827', fontSize: '2.5rem', margin: 0 }}>Resumen del checkout</h1>
          <p style={{ color: '#6b7280', fontSize: '1.05rem', marginTop: '0.75rem' }}>
            Revisa los productos, datos de entrega y total antes de confirmar la compra.
          </p>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, 0.75fr)', gap: '1.5rem' }}>
          <section style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '1.5rem' }}>
            <h2 style={{ color: '#111827', marginTop: 0 }}>Productos seleccionados</h2>

            <div style={{ display: 'grid', gap: '1rem' }}>
              {items.map((item) => (
                <article
                  key={item.name}
                  style={{
                    alignItems: 'center',
                    border: '1px solid #eef0f4',
                    borderRadius: '14px',
                    display: 'grid',
                    gap: '1rem',
                    gridTemplateColumns: '56px minmax(0, 1fr) auto',
                    padding: '1rem',
                  }}
                >
                  <div
                    style={{
                      alignItems: 'center',
                      backgroundColor: '#eeeeff',
                      borderRadius: '14px',
                      color: '#5454EB',
                      display: 'flex',
                      fontWeight: 900,
                      height: '56px',
                      justifyContent: 'center',
                    }}
                  >
                    x{item.quantity}
                  </div>
                  <div>
                    <h3 style={{ color: '#111827', margin: '0 0 0.25rem' }}>{item.name}</h3>
                    <p style={{ color: '#6b7280', margin: 0 }}>{item.detail}</p>
                  </div>
                  <strong style={{ color: '#111827' }}>
                    {currencyFormatter.format(item.price * item.quantity)}
                  </strong>
                </article>
              ))}
            </div>
          </section>

          <aside style={{ display: 'grid', gap: '1rem' }}>
            <section style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '1.5rem' }}>
              <h2 style={{ color: '#111827', marginTop: 0 }}>Entrega</h2>
              <p style={{ color: '#111827', fontWeight: 700, marginBottom: '0.25rem' }}>Retiro en tienda</p>
              <p style={{ color: '#6b7280', marginTop: 0 }}>Disponible desde manana a las 10:00.</p>
              <div style={{ backgroundColor: '#f3f4f6', borderRadius: '12px', color: '#374151', padding: '0.9rem' }}>
                Nova Store · Avenida Central 123
              </div>
            </section>

            <section style={{ backgroundColor: '#111827', borderRadius: '16px', color: '#ffffff', padding: '1.5rem' }}>
              <h2 style={{ marginTop: 0 }}>Total a pagar</h2>
              <dl style={{ display: 'grid', gap: '0.8rem', margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <dt>Subtotal</dt>
                  <dd style={{ margin: 0 }}>{currencyFormatter.format(subtotal)}</dd>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <dt>Envio</dt>
                  <dd style={{ margin: 0 }}>{currencyFormatter.format(shipping)}</dd>
                </div>
                <div style={{ color: '#86efac', display: 'flex', justifyContent: 'space-between' }}>
                  <dt>Descuento</dt>
                  <dd style={{ margin: 0 }}>- {currencyFormatter.format(discount)}</dd>
                </div>
              </dl>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.16)', display: 'flex', justifyContent: 'space-between', marginTop: '1.25rem', paddingTop: '1.25rem' }}>
                <span style={{ fontWeight: 800 }}>Total</span>
                <strong style={{ fontSize: '1.5rem' }}>{currencyFormatter.format(total)}</strong>
              </div>

              <button
                style={{
                  backgroundColor: '#5454EB',
                  border: 'none',
                  borderRadius: '9999px',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontWeight: 800,
                  marginTop: '1.5rem',
                  padding: '0.9rem 1.25rem',
                  width: '100%',
                }}
                type="button"
              >
                Confirmar pedido
              </button>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
};
