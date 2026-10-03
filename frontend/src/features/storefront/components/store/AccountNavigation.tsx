import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { authService } from '../../../auth/services/authService';
import { useStorefrontTemplate } from '../../hooks/useStorefrontTemplate';

type User = { is_staff: boolean; is_store_owner: boolean };
export function isStoreAdministrator(user: User | null): boolean {
  return Boolean(user && (user.is_store_owner));
}

export function useStorefrontIdentity() {
  const { pathname } = useLocation();
  const [identity, setIdentity] = useState<{user: User | null; loading: boolean}>({user: null, loading: true});
  useEffect(() => {
    let active = true;
    setIdentity({user: null, loading: true});
    authService.getMe().then(response => {
      if (active) setIdentity({user: response?.data ?? null, loading: false});
    }).catch(() => { if (active) setIdentity({user: null, loading: false}); });
    return () => { active = false; };
  }, [pathname]);
  return identity;
}

export function AccountNavigation({ className = '' }: { className?: string }) {
  const { user, loading } = useStorefrontIdentity();
  const { route } = useStorefrontTemplate();
  if (loading) return null;
  const admin = isStoreAdministrator(user);
  if (user?.is_staff && !admin) return null;
  return <Link className={className} to={admin ? '/emprendedor' : route(user ? 'perfil' : 'ingresar')}>
    {admin ? 'Volver al panel' : user ? 'Mi cuenta' : 'Iniciar sesión'}
  </Link>;
}

export function RequireCustomer({ children }: { children: React.ReactNode }) {
  const { user, loading } = useStorefrontIdentity();
  const { route } = useStorefrontTemplate();
  if (loading) return <p role="status">Comprobando sesión…</p>;
  if (!user) return <Navigate to={route('ingresar')} replace />;
  if (user.is_staff && !user.is_store_owner) return <p role="alert">El perfil comprador no está disponible para esta cuenta.</p>;
  if (isStoreAdministrator(user)) return <Navigate to="/emprendedor" replace />;
  return <>{children}</>;
}
