import { InstitutionalBadge } from '../../ui';
import { CompactMobileNavigation } from '../CompactMobileNavigation';
import { VISUAL_SECTION } from '../../../visual/sectionIds';
import { AccountNavigation, notifyStorefrontAuthChange, useStorefrontIdentity } from '../AccountNavigation';
import { useStore } from '../../../context/StoreContext';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';
import { authService } from '../../../../auth/services/authService';
import { useStorefrontTemplate } from '../../../hooks/useStorefrontTemplate';

function MinimalCartIcon({ count }: { count: number }) {
  return (
    <div className="relative">
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.7}
          d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
        />
      </svg>

      {count > 0 && (
        <span className="absolute -top-2 -right-2 min-w-4 h-4 px-1 rounded-full bg-white text-[var(--primary)] text-[10px] font-bold flex items-center justify-center">
          {count}
        </span>
      )}
    </div>
  );
}

export function MinimalHeader() {
  const { config } = useStore();
  const { count } = useCart();
  const { user } = useStorefrontIdentity();
  const { route } = useStorefrontTemplate();
  const navigate = useNavigate();

  const handleLogout = () => {
    authService.logout();
    notifyStorefrontAuthChange();
    navigate(route());
  };

  return (
    <div data-visual-header-shell className="px-3 sm:px-4 md:px-8 pt-4 sm:pt-5">
      <header data-visual-section={VISUAL_SECTION.header} data-visual-part="headerLayout" className="max-w-6xl mx-auto bg-white rounded-2xl border border-black/5 shadow-sm px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 min-h-16 flex items-center justify-between gap-2 sm:gap-4">

        {/* Nombre */}
        <InstitutionalBadge compact /><Link data-visual-part="logo"
          to="."
          aria-label={`Ir al inicio de ${config.name || 'la tienda'}`}
          className="flex min-w-0 max-w-full items-center gap-2 font-semibold text-[var(--primary)]"
        >
          {config.logo && <img data-landing-image src={config.logo} alt={`Logo de ${config.name}`} className="block w-auto h-auto max-w-[60px] sm:max-w-[110px] xl:max-w-[150px] max-h-9 sm:max-h-11 shrink-0 object-contain object-center" />}
          <span className="whitespace-nowrap text-base sm:text-lg font-bold">{config.name}</span>
        </Link>

        {/* Navegación (pastilla clara con texto oscuro legible) */}
        <nav data-visual-part="navigation"
          data-minimal-nav-pill
          className="hidden md:flex items-center gap-1 bg-[#f4f4f4] text-[#0f1623] rounded-full p-1.5 border border-black/10"
          aria-label="Navegación principal"
        >
          <Link
            to="."
            className="px-5 py-2 rounded-full text-xs font-semibold text-[#0f1623] hover:bg-white hover:text-[var(--primary)] transition-colors"
          >
            Inicio
          </Link>

          <Link
            to="catalogo"
            className="px-5 py-2 rounded-full text-xs font-semibold text-[#0f1623] hover:bg-white hover:text-[var(--primary)] transition-colors"
          >
            Catálogo
          </Link>

          <Link
            to="seguimiento"
            className="px-5 py-2 rounded-full text-xs font-semibold text-[#0f1623] hover:bg-white hover:text-[var(--primary)] transition-colors"
          >
            Seguimiento
          </Link>
        </nav>

        {/* Acciones */}
        <div className="flex shrink-0 items-center gap-2 md:gap-4">
          <AccountNavigation className="hidden sm:inline-flex text-xs font-semibold underline underline-offset-4" />

          {user ? (
            <button
              type="button"
              onClick={handleLogout}
              className="hidden sm:inline-flex px-4 py-2 rounded-full border border-current/30 text-xs font-semibold hover:opacity-80 transition-opacity"
            >
              Salir
            </button>
          ) : (
            <Link
              to="ingresar?modo=registro"
              className="hidden md:inline-flex px-4 py-2 rounded-full border border-current/30 text-xs font-semibold hover:opacity-80 transition-opacity"
            >
              Registrarse
            </Link>
          )}

          <Link
            to="carrito"
            aria-label={`Ver carrito (${count} productos)`}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[var(--primary)] text-[var(--on-primary)] flex items-center justify-center hover:opacity-90 transition-opacity"
          >
            <MinimalCartIcon count={count} />
          </Link>
        </div>
        <CompactMobileNavigation />
      </header>
    </div>
  );
}