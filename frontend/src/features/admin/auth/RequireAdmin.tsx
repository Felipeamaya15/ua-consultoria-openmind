import { useEffect, useState } from 'react';
import {
  Navigate,
  Outlet,
  useLocation,
} from 'react-router-dom';

import { authService } from '../../auth/services/authService';

export function RequireAdmin() {
  const location = useLocation();
  const [access, setAccess] = useState<
    'loading' | 'owner' | 'denied'
  >('loading');

  useEffect(() => {
    let active = true;

    if (!authService.hasSession()) {
      setAccess('denied');
      return () => {
        active = false;
      };
    }

    authService
      .getEntrepreneurProfile()
      .then(() => {
        if (active) setAccess('owner');
      })
      .catch(() => {
        if (active) setAccess('denied');
      });

    return () => {
      active = false;
    };
  }, [location.pathname]);

  if (access === 'loading') {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        role="status"
      >
        <p className="text-sm text-[var(--muted-foreground)]">
          Comprobando acceso al panel...
        </p>
      </div>
    );
  }

  if (access === 'denied') {
    return (
      <Navigate
        to={
          authService.hasSession()
            ? '/plantilla/1'
            : '/plantilla/1/ingresar'
        }
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return <Outlet />;
}
