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
  const { config, landing } = useStore();
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
      <div data-visual-part="headerLayout" className="max-w-6xl mx-auto px-4 sm:px-5 min-h-16 flex items-center justify-between gap-4">

        {/* Izquierda: Logo Universidad al lado del logo y nombre completo de la tienda */}
        <div className="flex min-w-0 items-center gap-3">
          <InstitutionalBadge compact />
          <Link data-visual-part="logo"
            to={route()}
            aria-label={`Ir al inicio de ${config.name || 'la tienda'}`}
            className="flex min-w-0 items-center gap-3 text-[#111111] hover:opacity-75 transition-opacity"
          >
            {config.logo && <img data-landing-image src={config.logo} alt={`Logo de ${config.name}`} className="block w-auto h-auto max-w-[80px] sm:max-w-[120px] xl:max-w-[160px] max-h-10 sm:max-h-11 shrink-0 object-contain object-center" />}
            <span className="font-serif text-xl sm:text-2xl truncate whitespace-nowrap">
              {config.name}
            </span>

            <span className="hidden sm:block h-5 w-px bg-black/15" />

            <span className="hidden sm:block text-[10px] tracking-[0.25em] text-black/60 uppercase">
              TIENDA
            </span>
          </Link>
        </div>

        {/* Derecha: Catálogo -> Seguimiento -> Iniciar sesión (/ Salir) -> Carrito -> Menú móvil */}
        <div className="flex shrink-0 items-center gap-4 md:gap-6 text-sm">
          <nav data-visual-part="navigation" className="hidden md:flex shrink-0 items-center gap-4 md:gap-6 text-sm">
            <Link
              to={route('catalogo')}
              className="hover:opacity-50 transition-opacity"
            >
              Catálogo
            </Link>

            {landing?.contenido?.bloques?.some(block=>block.visible&&block.tipo==='historia') && <Link
              to={route('nuestra-historia')}
              className="hidden sm:inline-block hover:opacity-50 transition-opacity"
            >
              Nuestra historia
            </Link>}

            <Link
              to={route('seguimiento')}
              className="hidden md:inline-block hover:opacity-50 transition-opacity"
            >
              Seguimiento
            </Link>

            <AccountNavigation className="font-semibold underline underline-offset-4 hover:opacity-50 transition-opacity" />

            {user && (
              <button
                type="button"
                onClick={handleLogout}
                className="text-sm font-medium hover:opacity-50 transition-opacity"
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