import React from 'react';
import { useNavigate } from 'react-router-dom';

interface EnterStoreButtonProps {
  catalogRoute: string;
}

export const EnterStoreButton: React.FC<EnterStoreButtonProps> = ({ catalogRoute }) => {
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
      <button 
        onClick={() => navigate(catalogRoute)}
        style={{
          padding: '1rem 2rem', fontSize: '1.1rem', fontWeight: '600', color: '#ffffff', 
          backgroundColor: '#5454EB', border: 'none', borderRadius: '9999px', cursor: 'pointer', 
          display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 14px rgba(84, 84, 235, 0.4)'
        }}
      >
        Ver catálogo &rarr;
      </button>
      <button 
        style={{
          padding: '1rem 2rem', fontSize: '1.1rem', fontWeight: '600', color: '#5454EB', 
          backgroundColor: '#eef2ff', border: 'none', borderRadius: '9999px', cursor: 'pointer', 
          display: 'flex', alignItems: 'center', gap: '0.5rem'
        }}
      >
        Conocer más &rarr;
      </button>
    </div>
  );
};