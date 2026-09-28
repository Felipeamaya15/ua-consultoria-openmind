import { Navigate, Outlet } from 'react-router-dom';

export function RequireAdmin() {
  const hasToken = !!localStorage.getItem('token');
  
  return hasToken ? <Outlet /> : <Navigate to="/plantilla/1/ingresar" replace />;
}