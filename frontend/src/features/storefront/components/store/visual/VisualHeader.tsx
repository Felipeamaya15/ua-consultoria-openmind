import { InstitutionalBadge } from '../../ui';
import { CompactMobileNavigation } from '../CompactMobileNavigation';
import { VISUAL_SECTION } from '../../../visual/sectionIds';
import { AccountNavigation, notifyStorefrontAuthChange, useStorefrontIdentity } from '../AccountNavigation';
import { useStore } from '../../../context/StoreContext';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';
import { useStorefrontTemplate } from '../../../hooks/useStorefrontTemplate';
import { authService } from '../../../../auth/services/authService';

export function VisualHeader() {
  const { config } = useStore();
  const { count } = useCart();
  const { route } = useStorefrontTemplate();
  const { user } = useStorefrontIdentity();
  const navigate = useNavigate();

  const handleLogout = () => {
    authService.logout();
    notifyStorefrontAuthChange();
    navigate(route());
  };

  return (
    <header data-visual-section={VISUAL_SECTION.header} className="bg-white border-t-4 border-[var(--primary)] border-b border-black/10">
      <div data-visual-part="headerLayout" className="max-w-6xl mx-auto px-3 sm:px-5 py-2 min-h-16 flex items-center justify-between gap-2 sm:gap-3 lg:gap-4">


        <div className="flex flex-1 min-w-0 items-center gap-2 sm:gap-3">
          <InstitutionalBadge compact />
          <Link data-visual-part="logo" onClick={event => {
              if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.currentTarget.pathname === window.location.pathname) window.scrollTo({top:0,left:0,behavior:'instant'});
            }}
            to={route()}
            aria-label={`Ir al inicio de ${config.name || 'la tienda'}`}
            className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 text-[#111111] hover:opacity-75 transition-opacity"
          >
            {config.logo && <img data-landing-image src={config.logo} alt={`Logo de ${config.name}`} className="block w-auto h-auto max-w-[56px] sm:max-w-[90px] xl:max-w-[150px] max-h-9 sm:max-h-10 shrink-0 object-contain object-center" />}
            <span className="min-w-0 font-serif text-base sm:text-lg lg:text-2xl leading-tight break-words">
              {config.name}
            </span>
          </Link>
        </div>


        <div className="flex shrink-0 items-center gap-2.5 sm:gap-3 lg:gap-6 text-sm">
          <nav data-visual-part="navigation" className="hidden md:flex shrink-0 items-center gap-3 lg:gap-6 text-xs lg:text-sm">
            <Link
              to={route('catalogo')}
              className="whitespace-nowrap hover:opacity-50 transition-opacity"
            >
              Catálogo
            </Link>

            <Link
              to={route('seguimiento')}
              className="hidden md:inline-block whitespace-nowrap hover:opacity-50 transition-opacity"
            >
              Seguimiento
            </Link>

            <AccountNavigation className="whitespace-nowrap font-semibold underline underline-offset-4 hover:opacity-50 transition-opacity" />

            {user && (
              <button
                type="button"
                onClick={handleLogout}
                className="text-xs lg:text-sm font-medium whitespace-nowrap hover:opacity-50 transition-opacity"
              >
                Salir
              </button>
            )}
          </nav>

          <Link
            to={route('carrito')}
            className="relative inline-flex items-center justify-center p-1"
            aria-label={`Carrito con ${count} productos`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              className="w-5 h-5"
              strokeWidth="1.5"
            >
              <path d="M6 8h12l-1 12H7L6 8Z" />
              <path d="M9 9V6a3 3 0 0 1 6 0v3" />
            </svg>

            {count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-black text-white text-[10px] flex items-center justify-center">
                {count}
              </span>
            )}
          </Link>

          <CompactMobileNavigation />
        </div>

      </div>
    </header>
  );
}