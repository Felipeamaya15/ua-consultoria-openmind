import { Navigate } from 'react-router-dom';

/**
 * Redirige cualquier intento de acceso legacy por URL a la raíz limpia de la tienda.
 */
export function SelectedTemplateRedirect() {
  return <Navigate to="/" replace />;
}
