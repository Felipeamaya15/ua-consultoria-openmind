import React from 'react';

interface Layout4Props {
  children: React.ReactNode;
  businessName: string;
  logoUrl: string | null;
}

export const Layout4: React.FC<Layout4Props> = ({ children, businessName, logoUrl }) => {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', fontFamily: 'sans-serif' }}>
      {/* Navbar Superior */}
      <header style={{ 
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
        padding: '1.5rem 3rem', borderBottom: '1px solid #f3f4f6' 
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: '900', fontSize: '1.25rem', color: '#111827' }}>
          {logoUrl && <img src={logoUrl} alt="Logo de la tienda" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />}
          {businessName}
        </div>
        
      </header>

      {/* Contenedor Principal */}
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem 2rem', textAlign: 'center' }}>
        {children}
      </main>
    </div>
  );
};