import React from 'react';

export const ManualTransferConfigPage: React.FC = () => {
  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#f7f7fb', fontFamily: 'sans-serif', padding: '2rem' }}>
      <section style={{ maxWidth: '1080px', margin: '0 auto' }}>
        <header style={{ marginBottom: '2rem' }}>
          <p style={{ color: '#5454EB', fontWeight: 800, margin: '0 0 0.5rem' }}>SCRUM-159</p>
          <h1 style={{ color: '#111827', fontSize: '2.5rem', margin: 0 }}>
            Transferencia bancaria manual
          </h1>
          <p style={{ color: '#6b7280', fontSize: '1.05rem', marginTop: '0.75rem' }}>
            Configura los datos que vera el cliente para pagar por transferencia y subir su comprobante.
          </p>
        </header>

        <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 0.8fr)' }}>
          <form style={{ display: 'grid', gap: '1.5rem' }}>
            <section style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '1.5rem' }}>
              <h2 style={{ color: '#111827', marginTop: 0 }}>Datos bancarios</h2>
              <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                <label style={{ color: '#374151', display: 'grid', fontWeight: 700, gap: '0.45rem' }}>
                  Titular
                  <input defaultValue="Nova Store SpA" style={{ border: '1px solid #d1d5db', borderRadius: '10px', padding: '0.85rem' }} type="text" />
                </label>
                <label style={{ color: '#374151', display: 'grid', fontWeight: 700, gap: '0.45rem' }}>
                  RUT
                  <input defaultValue="76.123.456-7" style={{ border: '1px solid #d1d5db', borderRadius: '10px', padding: '0.85rem' }} type="text" />
                </label>
                <label style={{ color: '#374151', display: 'grid', fontWeight: 700, gap: '0.45rem' }}>
                  Banco
                  <select style={{ border: '1px solid #d1d5db', borderRadius: '10px', padding: '0.85rem' }}>
                    <option>Banco Estado</option>
                    <option>Banco de Chile</option>
                    <option>Santander</option>
                    <option>BCI</option>
                  </select>
                </label>
                <label style={{ color: '#374151', display: 'grid', fontWeight: 700, gap: '0.45rem' }}>
                  Tipo de cuenta
                  <select style={{ border: '1px solid #d1d5db', borderRadius: '10px', padding: '0.85rem' }}>
                    <option>Cuenta corriente</option>
                    <option>Cuenta vista</option>
                    <option>Cuenta RUT</option>
                  </select>
                </label>
                <label style={{ color: '#374151', display: 'grid', fontWeight: 700, gap: '0.45rem', gridColumn: '1 / -1' }}>
                  Numero de cuenta
                  <input defaultValue="1234567890" style={{ border: '1px solid #d1d5db', borderRadius: '10px', padding: '0.85rem' }} type="text" />
                </label>
              </div>
            </section>

            <section style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '1.5rem' }}>
              <h2 style={{ color: '#111827', marginTop: 0 }}>Instrucciones para el cliente</h2>
              <label style={{ color: '#374151', display: 'grid', fontWeight: 700, gap: '0.45rem' }}>
                Mensaje visible en checkout
                <textarea
                  defaultValue="Realiza la transferencia con el monto exacto y sube el comprobante para validar tu pedido."
                  rows={5}
                  style={{ border: '1px solid #d1d5db', borderRadius: '10px', padding: '0.85rem', resize: 'vertical' }}
                />
              </label>
            </section>
          </form>

          <aside style={{ display: 'grid', gap: '1rem' }}>
            <section style={{ backgroundColor: '#111827', borderRadius: '16px', color: '#ffffff', padding: '1.5rem' }}>
              <h2 style={{ marginTop: 0 }}>Vista previa</h2>
              <p style={{ color: '#d1d5db' }}>El cliente vera estos datos antes de finalizar el pedido.</p>
              <div style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '12px', display: 'grid', gap: '0.7rem', padding: '1rem' }}>
                <span><strong>Titular:</strong> Nova Store SpA</span>
                <span><strong>Banco:</strong> Banco Estado</span>
                <span><strong>Cuenta:</strong> 1234567890</span>
                <span><strong>Correo:</strong> pagos@novastore.cl</span>
              </div>
            </section>

            <section style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '1.5rem' }}>
              <h2 style={{ color: '#111827', marginTop: 0 }}>Reglas de validacion</h2>
              <label style={{ alignItems: 'center', color: '#374151', display: 'flex', fontWeight: 700, gap: '0.75rem', marginBottom: '0.9rem' }}>
                <input defaultChecked type="checkbox" />
                Exigir comprobante
              </label>
              <label style={{ alignItems: 'center', color: '#374151', display: 'flex', fontWeight: 700, gap: '0.75rem', marginBottom: '0.9rem' }}>
                <input defaultChecked type="checkbox" />
                Validar monto exacto
              </label>
              <label style={{ alignItems: 'center', color: '#374151', display: 'flex', fontWeight: 700, gap: '0.75rem' }}>
                <input type="checkbox" />
                Aprobar automaticamente
              </label>
            </section>

            <button
              style={{
                backgroundColor: '#5454EB',
                border: 'none',
                borderRadius: '9999px',
                color: '#ffffff',
                cursor: 'pointer',
                fontWeight: 800,
                padding: '0.95rem 1.25rem',
              }}
              type="button"
            >
              Guardar metodo de pago
            </button>
          </aside>
        </div>
      </section>
    </main>
  );
};
