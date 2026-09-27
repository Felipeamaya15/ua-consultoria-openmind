import { Navigate, Outlet } from 'react-router-dom';
import { hasDemoSession } from './demoSession';
export function RequireAdmin() {
  return hasDemoSession() ? <Outlet /> : <Navigate to="/plantilla/1/ingresar" replace />;
}
