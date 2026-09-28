import React from 'react';

export const LinkifyConfigPage: React.FC = () => {
  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#f7f7fb', fontFamily: 'sans-serif', padding: '2rem' }}>
      <section style={{ maxWidth: '1040px', margin: '0 auto' }}>
        <header style={{ marginBottom: '2rem' }}>
          <p style={{ color: '#5454EB', fontWeight: 800, margin: '0 0 0.5rem' }}>SCRUM-158</p>
          <h1 style={{ color: '#111827', fontSize: '2.5rem', margin: 0 }}>
            Configuracion de Linkify
          </h1>
          <p style={{ color: '#6b7280', fontSize: '1.05rem', marginTop: '0.75rem' }}>
            Conecta Linkify para publicar enlaces de pago y sincronizar estados con la tienda.
          </p>
        </header>

        <form style={{ display: 'grid', gap: '1.5rem' }}>
          <section style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '1.5rem' }}>
            <h2 style={{ color: '#111827', marginTop: 0 }}>Datos de conexion</h2>
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <label style={{ color: '#374151', display: 'grid', fontWeight: 700, gap: '0.45rem' }}>
                Nombre de la cuenta
                <input
                  defaultValue="Nova Store"
                  style={{ border: '1px solid #d1d5db', borderRadius: '10px', padding: '0.85rem' }}
                  type="text"
                />
              </label>
              <label style={{ color: '#374151', display: 'grid', fontWeight: 700, gap: '0.45rem' }}>
                URL publica
                <input
                  defaultValue="https://linkify.cl/nova-store"
                  style={{ border: '1px solid #d1d5db', borderRadius: '10px', padding: '0.85rem' }}
                  type="url"
                />
              </label>
              <label style={{ color: '#374151', display: 'grid', fontWeight: 700, gap: '0.45rem' }}>
                API Key
                <input
                  placeholder="lk_live_************************"
                  style={{ border: '1px solid #d1d5db', borderRadius: '10px', padding: '0.85rem' }}
                  type="password"
                />
              </label>
              <label style={{ color: '#374151', display: 'grid', fontWeight: 700, gap: '0.45rem' }}>
                Ambiente
                <select style={{ border: '1px solid #d1d5db', borderRadius: '10px', padding: '0.85rem' }}>
                  <option>Sandbox</option>
                  <option>Produccion</option>
                </select>
              </label>
            </div>
          </section>

          <section style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '1.5rem' }}>
            <h2 style={{ color: '#111827', marginTop: 0 }}>Preferencias de integracion</h2>
            <div style={{ display: 'grid', gap: '1rem' }}>
              {[
                ['Sincronizar pagos aprobados', 'Marca pedidos como pagados cuando Linkify confirme el pago.'],
                ['Enviar correo al cliente', 'Notifica al cliente cuando el enlace de pago este disponible.'],
                ['Activar expiracion automatica', 'Desactiva enlaces no pagados despues de 48 horas.'],
              ].map(([title, description]) => (
                <label
                  key={title}
                  style={{
                    alignItems: 'center',
                    border: '1px solid #eef0f4',
                    borderRadius: '14px',
                    display: 'flex',
                    gap: '1rem',
                    justifyContent: 'space-between',
                    padding: '1rem',
                  }}
                >
                  <span>
                    <strong style={{ color: '#111827', display: 'block' }}>{title}</strong>
                    <span style={{ color: '#6b7280' }}>{description}</span>
                  </span>
                  <input defaultChecked style={{ height: '22px', width: '22px' }} type="checkbox" />
                </label>
              ))}
            </div>
          </section>

          <section style={{ backgroundColor: '#111827', borderRadius: '16px', color: '#ffffff', display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(0, 1fr) auto', padding: '1.5rem' }}>
            <div>
              <h2 style={{ margin: '0 0 0.4rem' }}>Estado de la integracion</h2>
              <p style={{ color: '#d1d5db', margin: 0 }}>
                Ultima validacion exitosa. Webhook listo para recibir eventos de pago.
              </p>
            </div>
            <button
              style={{
                alignSelf: 'center',
                backgroundColor: '#5454EB',
                border: 'none',
                borderRadius: '9999px',
                color: '#ffffff',
                cursor: 'pointer',
                fontWeight: 800,
                padding: '0.9rem 1.25rem',
              }}
              type="button"
            >
              Guardar configuracion
            </button>
          </section>
        </form>
      </section>
    </main>
  );
};
