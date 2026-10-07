import { AccountNavigation } from './AccountNavigation';
import { useLandingContent } from '../../../landing/hooks/useLandingContent';
import { useLandingSectionVisibility } from '../../../landing/hooks/useLandingSectionVisibility';
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
        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[var(--accent)] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
          {count}
        </span>
      )}
    </div>
  );
}

/**
 * ============================================================
 * TEMPLATE 1 — EDITORIAL
 * ============================================================
 *
 * Layout principal de la plantilla editorial.
 *
 * Contiene los elementos persistentes de la plantilla:
 * - Barra institucional
 * - Header
 * - Navegación
 * - Categorías
 * - Footer
 *
 * El contenido de cada página se renderiza mediante <Outlet />.
 */
export function EditorialLayout() {
  const { categories } = useLandingContent();
  const isSectionVisible = useLandingSectionVisibility();
  const { config, landing } = useStore();
  const { count } = useCart();
  const navigate = useNavigate();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<any>(null);

  const { pathname, search } = useLocation();

  // Buscar si hay un usuario logueado al cargar el layout
  // Buscar si hay un usuario logueado al cargar o al cambiar de página
  useEffect(() => {
    authService.getMe().then(response => {
      if (response?.data) {
        setUser(response.data);
      } else {
        setUser(null); // Limpia el estado si el token no existe o expiró
      }
    });
  }, [pathname]); // <-- Agregamos 'pathname' para que se actualice al navegar

  const handleLogout = () => {
    authService.logout();
    setUser(null);
    navigate('/plantilla/1');
  };

  /**
   * Al cambiar de página:
   * - cierra el menú móvil;
   * - vuelve al inicio de la página.
   */
  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo(0, 0);
  }, [pathname, search]);



  return (
    <div className="template-editorial min-h-screen bg-[#fafaf8] flex flex-col">

      {/* =====================================================
          BARRA INSTITUCIONAL
      ====================================================== */}
      <div className="bg-[var(--institutional)] text-white py-2 px-4 text-xs flex items-center justify-center gap-2.5 font-medium">
        <img
          src="/logo-universidad-autonoma.png"
          alt="Logo Universidad Autónoma de Chile"
          className="w-8 h-8 object-contain bg-white rounded-md p-1 shadow-sm"
        />
        <span>
          Plataforma impulsada por <strong>Universidad Autónoma de Chile</strong>
        </span>
      </div>

      {/* =====================================================
          HEADER
      ====================================================== */}
      <header className="bg-white border-b border-[var(--border)] sticky top-0 z-40">

        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-6">

          {/* Logo / nombre de tienda */}
          <Link
            to="."
            className="flex items-center gap-3"
            aria-label={`Ir al inicio de ${config.name}`}
          >
            {config.logo ? (
              <img
                data-landing-image={landing?.logo ? true : undefined}
                src={config.logo}
                alt={`Logo de ${config.name}`}
                className="block w-auto h-auto max-w-[80px] sm:max-w-[120px] xl:max-w-[160px] max-h-10 sm:max-h-11 shrink-0 object-contain object-center"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-xs font-bold">
                {config.name?.slice(0, 2).toUpperCase() || 'MT'}
              </div>
            )}

            <span className="font-display text-xl text-[var(--foreground)]">
              {config.name}
            </span>
          </Link>

          {/* =================================================
              NAVEGACIÓN DESKTOP
          ================================================== */}
          <nav
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

          {/* =================================================
              ACCIONES
          ================================================== */}
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

        {/* =================================================
            NAVEGACIÓN MÓVIL
        ================================================== */}
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

            {/* Login / Usuario Móvil */}
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

        {/* =================================================
            CATEGORÍAS
        ================================================== */}
        {isSectionVisible('Categorías') && categories.length > 0 && (<div className="border-t border-[var(--border)] overflow-x-auto scrollbar-hide">
          <div className="max-w-7xl mx-auto px-4 flex gap-6 py-2">

            {categories.map((category) => (
              <Link
                key={category}
                to={
                  category === 'Todos'
                    ? 'catalogo'
                    : `catalogo?cat=${encodeURIComponent(category)}`
                }
                className="text-xs text-[var(--muted-foreground)] hover:text-[var(--primary)] whitespace-nowrap transition-colors"
              >
                {category}
              </Link>
            ))}

          </div>
        </div>)}

      </header>

      {/* =====================================================
          CONTENIDO DE LA PÁGINA
      ====================================================== */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* =====================================================
          FOOTER
      ====================================================== */}
      <footer className="bg-[var(--foreground)] text-white mt-16">

        <div className="max-w-7xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-4 gap-8">

          {/* Información de tienda */}
          <div className="md:col-span-2">

            <p className="font-display text-2xl mb-2">
              {config.name}
            </p>

            <p className="text-sm text-white/60">
              {config.description}
            </p>

            <div className="mt-4">
              <InstitutionalBadge />
            </div>

          </div>

          {/* Tienda */}
          <div>

            <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
              Tienda
            </p>

            <div className="flex flex-col gap-2 text-sm text-white/70">

              <Link
                to="catalogo"
                className="hover:text-white transition-colors"
              >
                Catálogo
              </Link>

              <Link
                to="seguimiento"
                className="hover:text-white transition-colors"
              >
                Seguimiento
              </Link>

            </div>

          </div>

          {/* Legal */}
          <div>

            <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
              Legal
            </p>

            <div className="flex flex-col gap-2 text-sm text-white/70">

              <Link
                to="legal/terms"
                className="hover:text-white transition-colors"
              >
                Términos
              </Link>

              <Link
                to="legal/privacy"
                className="hover:text-white transition-colors"
              >
                Privacidad
              </Link>

              <Link
                to="legal/refund"
                className="hover:text-white transition-colors"
              >
                Reembolsos
              </Link>

            </div>

          </div>

        </div>

        {/* Copyright */}
        <div className="border-t border-white/10 py-4 text-center text-xs text-white/40 px-4">
          © 2025 {config.name} · Plataforma e-commerce Universidad Autónoma de Chile
        </div>

      </footer>

    </div>
  );
}