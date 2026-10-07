import { AccountNavigation } from '../AccountNavigation';
import { useStore } from '../../../context/StoreContext';
import { Link } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';

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
        <span className="absolute -top-2 -right-2 min-w-4 h-4 px-1 rounded-full bg-white text-[var(--primary)] text-[9px] font-bold flex items-center justify-center">
          {count}
        </span>
      )}
    </div>
  );
}

export function MinimalHeader() {
  const { landing } = useStore();
  const { count } = useCart();

  return (
    <div className="px-4 md:px-8 pt-5">
      <header className="max-w-6xl mx-auto bg-white rounded-2xl border border-black/5 shadow-sm px-4 md:px-6 h-16 md:max-lg:h-auto md:max-lg:min-h-16 md:max-lg:py-3 md:max-lg:flex-wrap flex items-center justify-between gap-4">

        {/* Nombre */}
        <Link
          to="."
          className="flex items-center gap-2 font-semibold text-[var(--primary)] whitespace-nowrap"
        >
          {landing?.logo && <img data-landing-image src={landing.logo} alt="Logo de la tienda" className="block w-auto h-auto max-w-[80px] sm:max-w-[120px] xl:max-w-[160px] max-h-10 sm:max-h-11 shrink-0 object-contain object-center" />}
          Mi Tienda.
        </Link>

        {/* Navegación */}
        <nav
          className="hidden md:flex md:max-lg:order-3 md:max-lg:w-full md:max-lg:justify-center items-center bg-[#f4f4f4] rounded-full p-1"
          aria-label="Navegación principal"
        >
          <Link
            to="."
            className="px-5 py-2 rounded-full text-xs font-medium text-gray-600 hover:bg-white hover:text-[var(--primary)] transition-colors"
          >
            Inicio
          </Link>

          <Link
            to="catalogo"
            className="px-5 py-2 rounded-full text-xs font-medium text-gray-600 hover:bg-white hover:text-[var(--primary)] transition-colors"
          >
            Catálogo
          </Link>

          <Link
            to="seguimiento"
            className="px-5 py-2 rounded-full text-xs font-medium text-gray-600 hover:bg-white hover:text-[var(--primary)] transition-colors"
          >
            Seguimiento
          </Link>
        </nav>

        {/* Acciones */}
        <div className="flex items-center gap-2 md:gap-4">
          <AccountNavigation className="hidden sm:block text-xs font-medium text-[var(--primary)]" />

          <Link
            to="ingresar"
            className="hidden md:block px-4 py-2 rounded-full border border-gray-200 text-xs font-medium text-[var(--primary)] hover:bg-gray-50 transition-colors"
          >
            Registrarse
          </Link>

          <Link
            to="carrito"
            aria-label={`Ver carrito (${count} productos)`}
            className="w-10 h-10 rounded-full bg-[var(--primary)] text-white flex items-center justify-center hover:opacity-90 transition-opacity"
          >
            <MinimalCartIcon count={count} />
          </Link>
        </div>
      </header>
    </div>
  );
}