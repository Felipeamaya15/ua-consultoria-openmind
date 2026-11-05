import { AccountNavigation, notifyStorefrontAuthChange, useStorefrontIdentity } from '../AccountNavigation';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../ui';
import { authService } from '../../../../auth/services/authService';
import { useStorefrontTemplate } from '../../../hooks/useStorefrontTemplate';

export function MinimalSidebar() {
  const { user } = useStorefrontIdentity();
  const { route } = useStorefrontTemplate();
  const navigate = useNavigate();

  const handleLogout = () => {
    authService.logout();
    notifyStorefrontAuthChange();
    navigate(route());
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 z-50 hidden md:flex w-20 flex-col items-center bg-white border-r border-black/10 px-1.5 py-4">
      {/* Botón superior: Iniciar sesión / Cuenta / Cerrar sesión */}
      <div className="w-full flex flex-col items-center gap-1.5">
        <AccountNavigation className="w-full min-h-10 px-1.5 py-1.5 rounded-xl bg-[var(--primary)] text-[var(--on-primary)] flex items-center justify-center text-[10px] leading-tight font-semibold text-center break-words whitespace-normal shadow-2xs hover:opacity-90 transition-opacity" />
        {user && (
          <button
            type="button"
            onClick={handleLogout}
            className="w-full min-h-7 px-1.5 py-1 rounded-lg border border-gray-200 bg-gray-50 text-[#151515] hover:bg-gray-100 text-[10px] leading-tight font-semibold text-center transition-colors"
          >
            Salir
          </button>
        )}
      </div>

      {/* Navegación lateral */}
      <nav
        className="flex flex-col items-center gap-3 mt-10"
        aria-label="Navegación lateral"
      >
        <Link
          to="."
          aria-label="Inicio"
          title="Inicio"
          className="w-10 h-10 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 hover:text-[var(--primary)] transition-colors"
        >
          <Icon name="home" className="w-5 h-5" />
        </Link>

        <Link
          to="catalogo"
          aria-label="Catálogo"
          title="Catálogo"
          className="w-10 h-10 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 hover:text-[var(--primary)] transition-colors"
        >
          <Icon name="grid" className="w-5 h-5" />
        </Link>

        <Link
          to="seguimiento"
          aria-label="Seguimiento"
          title="Seguimiento"
          className="w-10 h-10 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 hover:text-[var(--primary)] transition-colors"
        >
          <Icon name="truck" className="w-5 h-5" />
        </Link>
      </nav>
    </aside>
  );
}