import React from 'react';

interface BusinessInfoProps {
  description: string;
}

export const BusinessInfo: React.FC<BusinessInfoProps> = ({ description }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: '850px', marginBottom: '2.5rem' }}>
      
      {/* Etiqueta Abierto Ahora */}
      <div style={{ 
        backgroundColor: '#eef2ff', color: '#5454EB', padding: '0.4rem 1.2rem', 
        borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '1px',
        marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' 
      }}>
        <span style={{ width: '6px', height: '6px', backgroundColor: '#5454EB', borderRadius: '50%' }}></span>
        ABIERTO AHORA
      </div>
      
      {/* Icono central y subtítulo */}
      <div style={{ backgroundColor: '#5454EB', color: 'white', width: '64px', height: '64px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', fontSize: '1.5rem' }}>
        ≡
      </div>
      <div style={{ color: '#5454EB', fontWeight: 'bold', letterSpacing: '2px', fontSize: '0.85rem', marginBottom: '1.5rem', textTransform: 'uppercase' }}>
        NOVA STORE
      </div>

      {/* Título Principal */}
      <h1 style={{ fontSize: '4.5rem', color: '#111827', margin: '0 0 1.5rem 0', fontWeight: '900', lineHeight: '1.1', letterSpacing: '-1px' }}>
        Todo lo que necesitas, en un solo lugar
      </h1>
      
      {/* Descripción dinámica inyectada desde la API */}
      <p style={{ fontSize: '1.25rem', color: '#6b7280', margin: '0', lineHeight: '1.6', maxWidth: '650px' }}>
        {description}
      </p>
    </div>
  );
};