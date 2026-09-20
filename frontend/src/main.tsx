import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { API_BASE_URL, ApiStatus, checkApiConnection } from './api';

const initialStatus: ApiStatus = {
  ok: false,
  status: null,
  message: 'Verificando conexion con el backend...',
};

function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>(initialStatus);

  useEffect(() => {
    checkApiConnection().then(setApiStatus);
  }, []);

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem', textAlign: 'center' }}>
      <h1>Frontend React + Vite funcionando en Docker</h1>
      <p>Comunicacion API REST entre frontend y backend configurada.</p>

      <section
        style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          margin: '2rem auto 0',
          maxWidth: '520px',
          padding: '1.5rem',
          textAlign: 'left',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Estado API REST</h2>
        <p>
          <strong>Base URL:</strong> {API_BASE_URL}
        </p>
        <p>
          <strong>HTTP:</strong> {apiStatus.status ?? 'Sin respuesta'}
        </p>
        <p>
          <strong>Resultado:</strong>{' '}
          <span style={{ color: apiStatus.ok ? '#15803d' : '#b91c1c' }}>
            {apiStatus.message}
          </span>
        </p>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
