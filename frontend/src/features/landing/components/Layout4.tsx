import React from 'react';

interface Layout4Props {
  children: React.ReactNode;
  businessName: string;
}

export const Layout4: React.FC<Layout4Props> = ({ children, businessName }) => {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', fontFamily: 'sans-serif' }}>
      {/* Navbar Superior */}
      <header style={{ 
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
        padding: '1.5rem 3rem', borderBottom: '1px solid #f3f4f6' 
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: '900', fontSize: '1.25rem', color: '#111827' }}>
          <div style={{ backgroundColor: '#5454EB', color: 'white', padding: '0.4rem 0.6rem', borderRadius: '8px', fontSize: '1rem' }}>
            ≡
          </div>
          {businessName}
        </div>
        
        {/* Enlaces de Navegación */}
        <nav style={{ display: 'flex', gap: '2.5rem', color: '#6b7280', fontSize: '0.95rem', fontWeight: '600' }}>
          <span style={{ color: '#111827', cursor: 'pointer' }}>Inicio</span>
          <span style={{ cursor: 'pointer' }}>Catálogo</span>
          <span style={{ cursor: 'pointer' }}>Nosotros</span>
          <span style={{ cursor: 'pointer' }}>Contacto</span>
        </nav>
        
        {/* Botón Derecho */}
        <div>
          <button style={{ 
            padding: '0.6rem 1.2rem', borderRadius: '9999px', backgroundColor: '#f3f4f6', 
            border: 'none', color: '#5454EB', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem'
          }}>
            <span style={{ width: '8px', height: '8px', backgroundColor: '#5454EB', borderRadius: '50%' }}></span>
            U. Autónoma
          </button>
        </div>
      </header>

      {/* Contenedor Principal */}
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem 2rem', textAlign: 'center' }}>
        {children}
      </main>
    </div>
  );
};