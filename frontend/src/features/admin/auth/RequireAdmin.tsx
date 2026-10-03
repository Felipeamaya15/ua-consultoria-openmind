import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { authService } from '../../auth/services/authService';

export function RequireAdmin() {
  const [access, setAccess] = useState<'loading' | 'owner' | 'denied'>('loading');
  useEffect(() => {
    let active = true;
    authService.getEntrepreneurProfile().then(() => { if (active) setAccess('owner'); })
      .catch(() => { if (active) setAccess('denied'); });
    return () => { active = false; };
  }, []);
  if (access === 'loading') return <p role="status">Comprobando acceso al panel…</p>;
  if (access === 'denied') return <Navigate to={localStorage.getItem('token') ? '/plantilla/1' : '/plantilla/1/ingresar'} replace />;
  return <Outlet />;
}
