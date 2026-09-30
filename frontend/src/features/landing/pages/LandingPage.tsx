import { Navigate } from 'react-router-dom';

// Compatibilidad con enlaces anteriores; el contenido se muestra en los heroes.
export const LandingPage = () => <Navigate to="/" replace />;
