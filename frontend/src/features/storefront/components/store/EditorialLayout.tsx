import { CommercialPreferencesLink } from './CommercialPreferencesLink';
import { StoreBusinessDescription } from './StoreBusinessDescription';
import { isActiveEditorPreview } from '../../visual/pages';
import { StorePageContent } from './StorePageContent';
import { VISUAL_SECTION } from '../../visual/sectionIds';
import { AccountNavigation } from './AccountNavigation';
import { StoreVisualRoot } from './StoreVisualRoot';

import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useStore } from '../../context/StoreContext';
import { useCart } from '../../context/CartContext';
import { InstitutionalBadge } from '../ui';
import { authService } from '../../../auth/services/authService';

function CartIcon({ count }: { count: number }) {
  return (
    <div className="relative">
      <svg
        className="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
        />
      </svg>

      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[var(--accent)] text-[var(--on-accent)] text-[10px] font-bold rounded-full flex items-center justify-center">
          {count}
        </span>
      )}
    </div>
  );
}

export function EditorialLayout() {
  const { config } = useStore();
  const { count } = useCart();
  const navigate = useNavigate();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<any>(null);

  const { pathname, search } = useLocation();

  useEffect(() => {
    if (isActiveEditorPreview()) return;
    authService.getMe().then(response => {
      if (response?.data) {
        setUser(response.data);
      } else {
        setUser(null);
      }
    });
  }, [pathname]);

  const handleLogout = () => {
    authService.logout();
    setUser(null);
    navigate('/plantilla/1');
  };

  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo(0, 0);
  }, [pathname, search]);

  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen]);

  return (
    <StoreVisualRoot className="template-editorial min-h-screen bg-[#fafaf8] flex flex-col">
      {/* HEADER */}
      <header data-visual-section={VISUAL_SECTION.header} className="bg-white border-b border-[var(--border)] sticky top-0 z-40">
        <div data-visual-part="headerLayout" className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-6">
          {/* Logo / nombre de tienda */}
          <InstitutionalBadge compact /><Link data-visual-part="logo"
            to="."
            className="flex min-w-0 max-w-full items-center gap-3"
            aria-label={`Ir al inicio de ${config.name || 'la tienda'}`}
          >
            {config.logo ? (
              <img
                data-landing-image
                src={config.logo}
                alt={`Logo de ${config.name}`}
                className="block w-auto h-auto max-w-[80px] sm:max-w-[120px] xl:max-w-[160px] max-h-10 sm:max-h-11 shrink-0 object-contain object-center"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-[var(--on-primary)] text-xs font-bold">
                {config.name?.slice(0, 2).toUpperCase() || 'MT'}
              </div>
            )}

            <span className="font-display text-xl truncate text-[var(--foreground)]">
              {config.name}
            </span>
          </Link>

          {/* NAVEGACIÓN DESKTOP */}
          <nav data-visual-part="navigation"
            className="hidden md:flex items-center gap-6"
            aria-label="Navegación principal"
          >
            <Link
              to="."
              className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              Inicio
            </Link>

            <Link
              to="catalogo"
              className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              Catálogo
            </Link>

            <Link
              to="seguimiento"
              className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              Seguimiento
            </Link>
          </nav>

          {/* ACCIONES */}
          <div className="flex items-center gap-3">
            {/* Carrito */}
            <Link
              to="carrito"
              className="text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
              aria-label={`Ver carrito (${count} productos)`}
            >
              <CartIcon count={count} />
            </Link>

            {/* Login / Usuario Desktop */}
            {user ? (
              <div className="hidden sm:flex items-center gap-4 border-l border-[var(--border)] pl-4 ml-2">
                <span className="text-sm font-semibold text-[var(--foreground)]">
                  <AccountNavigation className="underline" />
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                >
                  Salir
                </button>
              </div>
            ) : (
              <AccountNavigation className="hidden sm:block text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors ml-2" />
            )}

            {/* Botón menú móvil */}
            <button
              type="button"
              className="md:hidden text-[var(--foreground)] p-1 ml-2"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label="Menú"
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* NAVEGACIÓN MÓVIL */}
        {mobileOpen && (
          <nav
            id="mobile-navigation"
            aria-label="Navegación móvil"
            className="md:hidden border-t border-[var(--border)] bg-white px-4 py-3 flex flex-col gap-2"
          >
            <Link
              to="."
              className="text-sm py-2"
              onClick={() => setMobileOpen(false)}
            >
              Inicio
            </Link>

            <Link
              to="catalogo"
              className="text-sm py-2"
              onClick={() => setMobileOpen(false)}
            >
              Catálogo
            </Link>

            <Link
              to="seguimiento"
              className="text-sm py-2"
              onClick={() => setMobileOpen(false)}
            >
              Seguimiento
            </Link>

            {user ? (
              <>
                <div className="text-sm py-2 font-semibold text-[var(--foreground)] border-t border-[var(--border)] mt-2 pt-4">
                  <AccountNavigation className="underline" />
                </div>
                <button
                  type="button"
                  className="text-sm py-2 text-left text-[var(--muted-foreground)]"
                  onClick={() => {
                    handleLogout();
                    setMobileOpen(false);
                  }}
                >
                  Salir
                </button>
              </>
            ) : (
              <AccountNavigation className="text-sm py-2 border-t border-[var(--border)] mt-2 pt-4" />
            )}
          </nav>
        )}
      </header>

      {/* CONTENIDO DE LA PÁGINA */}
      <main id="main-content" tabIndex={-1} className="flex-1">
        <StorePageContent><Outlet /></StorePageContent>
      </main>

      {/* FOOTER */}
      <footer data-visual-section={VISUAL_SECTION.footer} className="bg-[var(--primary)] text-[var(--on-primary)] mt-16">
        <div data-visual-part="footerLayout" className="max-w-7xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Información de tienda */}
          <div className="md:col-span-2">
            {config.logo && <img data-landing-image className="store-footer-logo" src={config.logo} alt={`Logo de ${config.name}`} />}
            <p data-visual-part="footerTitle" className="font-display text-2xl mb-2">
              {config.name}
            </p>
            <StoreBusinessDescription className="text-sm leading-relaxed" />
          </div>

          {/* Tienda */}
          <div>
            <p data-visual-part="footerTitle" className="text-xs font-semibold uppercase tracking-wider text-[color-mix(in_srgb,currentColor_60%,transparent)] mb-3">
              Tienda
            </p>
            <div className="flex flex-col gap-2 text-sm text-[color-mix(in_srgb,currentColor_70%,transparent)]">
              <Link
                to="catalogo"
                className="hover:text-inherit transition-colors"
              >
                Catálogo
              </Link>
              <Link
                to="seguimiento"
                className="hover:text-inherit transition-colors"
              >
                Seguimiento
              </Link>
            </div>
          </div>

          {/* Legal */}
          <div>
            <p data-visual-part="footerTitle" className="text-xs font-semibold uppercase tracking-wider text-[color-mix(in_srgb,currentColor_60%,transparent)] mb-3">
              Legal
            </p>
            <div className="flex flex-col gap-2 text-sm text-[color-mix(in_srgb,currentColor_70%,transparent)]">
              <Link
                to="legal/terms"
                className="hover:text-inherit transition-colors"
              >
                Términos
              </Link>
              <Link
                to="legal/privacy"
                className="hover:text-inherit transition-colors"
              >
                Privacidad
              </Link>
              <Link
                to="legal/refund"
                className="hover:text-inherit transition-colors"
              >
                Reembolsos
              </Link>
              <Link
                to="legal/cookies"
                className="hover:text-inherit transition-colors"
              >
                Cookies
              </Link>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div data-visual-part="branding" className="border-t border-[color-mix(in_srgb,currentColor_10%,transparent)] py-4 text-xs text-[color-mix(in_srgb,currentColor_60%,transparent)] px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <InstitutionalBadge compact showVersion={true} />
          <p className="text-center sm:text-right">© {new Date().getFullYear()} {config.name} · OpenMind</p>
        </div>

        <CommercialPreferencesLink />
      </footer>
    </StoreVisualRoot>
  );
}