import { Navigate, Outlet } from 'react-router-dom';
import { hasDemoSession } from './demoSession';

export function RequireAdmin() {
  const isEntrepreneur = hasDemoSession();
  
  return isEntrepreneur ? <Outlet /> : <Navigate to="/plantilla/1/ingresar" replace />;
}
