import { InstitutionalBadge } from '../../ui';
import { CompactMobileNavigation } from '../CompactMobileNavigation';
import { VISUAL_SECTION } from '../../../visual/sectionIds';
import { AccountNavigation, notifyStorefrontAuthChange, useStorefrontIdentity } from '../AccountNavigation';
import { useStore } from '../../../context/StoreContext';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';
import { useStorefrontTemplate } from '../../../hooks/useStorefrontTemplate';
import { authService } from '../../../../auth/services/authService';

export function CatalogHeader() {
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
    <header data-visual-section={VISUAL_SECTION.header} className="sticky top-0 z-50 bg-[#050505]/90 backdrop-blur-md py-2.5">
      <div className="max-w-[1160px] mx-auto px-3 sm:px-5">
        <nav data-visual-part="headerLayout" className="min-h-14 rounded-3xl lg:rounded-full bg-[#202022] border border-white/[0.08] px-3 sm:px-5 lg:px-6 py-1.5 flex flex-row items-center justify-between gap-2 sm:gap-3 lg:gap-4 shadow-xl shadow-black/25">

          <div className="flex flex-1 min-w-0 items-center gap-2 sm:gap-3">
            <InstitutionalBadge compact />
            <Link data-visual-part="logo"
              to={route()}
              aria-label={`Ir al inicio de ${config.name || 'la tienda'}`}
              className="flex min-w-0 flex-1 items-center gap-2 text-white hover:text-[var(--primary)] transition-colors"
            >
              {config.logo ? <img data-landing-image src={config.logo} alt={`Logo de ${config.name}`} className="block w-auto h-auto max-w-[48px] sm:max-w-[80px] lg:max-w-[110px] max-h-8 sm:max-h-9 shrink-0 object-contain object-center" /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5 shrink-0" strokeWidth="1.7">
                <path d="M3 11.5 12 4l9 7.5" />
                <path d="M5.5 10v10h13V10" />
                <path d="M9.5 20v-6h5v6" />
              </svg>}
              <span className="min-w-0 text-sm sm:text-base font-bold leading-tight break-words">{config.name}</span>
            </Link>
          </div>


          <div className="flex shrink-0 items-center gap-2 sm:gap-3 lg:gap-5 text-white">
            <div data-visual-part="navigation" className="hidden md:flex shrink-0 items-center gap-3 lg:gap-6 text-xs font-semibold text-white">
              <Link to={route('catalogo')} className="whitespace-nowrap hover:text-[var(--primary)] transition-colors">
                Catálogo
              </Link>

              <Link to={route('seguimiento')} className="whitespace-nowrap hover:text-[var(--primary)] transition-colors">
                Seguimiento
              </Link>

              <AccountNavigation className="whitespace-nowrap underline underline-offset-4 hover:text-[var(--primary)] transition-colors" />

              {user && (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-xs font-medium text-white/85 hover:text-white transition-colors whitespace-nowrap"
                >
                  Salir
                </button>
              )}
            </div>

            <Link
              to={route('carrito')}
              className="relative inline-flex items-center justify-center p-1 text-white hover:text-[var(--primary)] transition-colors"
              aria-label={`Carrito con ${count} productos`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5" strokeWidth="1.6">
                <path d="M6 8h12l-1 12H7L6 8Z" />
                <path d="M9 9V6a3 3 0 0 1 6 0v3" />
              </svg>
              {count > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-[var(--primary)] text-[var(--on-primary)] text-[10px] font-bold flex items-center justify-center">
                  {count}
                </span>
              )}
            </Link>

            <CompactMobileNavigation />
          </div>
        </nav>
      </div>
    </header>
  );
}