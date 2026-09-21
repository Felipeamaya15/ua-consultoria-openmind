import { createBrowserRouter } from 'react-router-dom';
import { LandingPage } from '../../features/landing/pages/LandingPage';
import { ManualTransferConfigPage } from '../../features/payments/pages/ManualTransferConfigPage';

// Componente temporal (Mock) para que la ruta del catálogo exista
const CatalogPlaceholder = () => (
  <div style={{ padding: '5rem 2rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
    <h1 style={{ color: '#111827' }}>Catálogo Público</h1>
    <p style={{ color: '#6b7280' }}>Aquí se listarán los productos de Nova Store próximamente.</p>
  </div>
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/catalogo',
    element: <CatalogPlaceholder />,
  },
  {
    path: '/pagos/transferencia-manual',
    element: <ManualTransferConfigPage />,
  }
]);
