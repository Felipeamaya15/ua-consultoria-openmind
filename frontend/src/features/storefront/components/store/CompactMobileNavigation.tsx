import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useStorefrontTemplate } from '../../hooks/useStorefrontTemplate';
import { AccountNavigation, notifyStorefrontAuthChange, useStorefrontIdentity } from './AccountNavigation';
import { authService } from '../../../auth/services/authService';

export function CompactMobileNavigation() {
  const {route} = useStorefrontTemplate();
  const {pathname} = useLocation();
  const {user} = useStorefrontIdentity();
  const navigate = useNavigate();
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if(ref.current) ref.current.open=false; }, [pathname]);

  const handleLogout = () => {
    authService.logout();
    notifyStorefrontAuthChange();
    if (ref.current) ref.current.open = false;
    navigate(route());
  };

  return (
    <details
      ref={ref}
      className="store-mobile-navigation"
      onKeyDown={event => {
        if (event.key === 'Escape' && ref.current?.open) {
          event.preventDefault();
          ref.current.open = false;
          ref.current.querySelector('summary')?.focus();
        }
      }}
    >
      <summary aria-label="Abrir navegación de la tienda">
        <svg data-qa-menu-icon="F02" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1f2937" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <span className="sr-only">Menú</span>
      </summary>
      <nav aria-label="Navegación móvil">
        <Link to={route()}>Inicio</Link>
        <Link to={route('catalogo')}>Catálogo</Link>
        <Link to={route('seguimiento')}>Seguimiento</Link>
        <AccountNavigation />
        {user && (
          <button type="button" onClick={handleLogout} className="text-left text-sm font-medium px-2.5 py-1.5 rounded-lg">
            Salir
          </button>
        )}
      </nav>
    </details>
  );
}