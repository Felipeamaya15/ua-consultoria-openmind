import { AccountNavigation } from '../AccountNavigation';
import { useStore } from '../../../context/StoreContext';
import { Link } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';
import { useStorefrontTemplate } from '../../../hooks/useStorefrontTemplate';

export function VisualHeader() {
  const { landing } = useStore();
  const { count } = useCart();
  const { route } = useStorefrontTemplate();

  return (
       <header className="bg-white border-t-4 border-[var(--primary)] border-b border-black/10">
      <div className="max-w-6xl mx-auto px-5 min-h-16 flex items-center justify-between gap-5">

        <Link
          to={route()}
          className="flex items-center gap-3 flex-shrink-0"
        >
          {landing?.logo && <img data-landing-image src={landing.logo} alt="Logo de la tienda" className="block w-auto h-auto max-w-[80px] sm:max-w-[120px] xl:max-w-[160px] max-h-10 sm:max-h-11 shrink-0 object-contain object-center" />}
          <span className="font-serif text-2xl">
            Velta
          </span>

          <span className="hidden sm:block h-5 w-px bg-black/15" />

          <span className="hidden sm:block text-[10px] tracking-[0.25em] text-black/50">
            TIENDA
          </span>
        </Link>

        <div className="hidden xl:flex bg-[#111111] text-white rounded-md px-5 py-2 text-center leading-tight">
          <span className="font-serif text-xs">
            UNIVERSIDAD
            <br />
            <strong className="text-sm">
              Autónoma
            </strong>
            <br />
            de Chile
          </span>
        </div>

        <nav className="flex items-center gap-4 md:gap-6 text-sm">
          <Link
            to={route('catalogo')}
            className="hover:opacity-50 transition-opacity"
          >
            Catálogo
          </Link>

          <Link
            to={route('nuestra-historia')}
            className="hidden sm:block hover:opacity-50 transition-opacity"
          >
            Nuestra historia
          </Link>

          <Link
            to={route('seguimiento')}
            className="hidden md:block hover:opacity-50 transition-opacity"
          >
            Seguimiento
          </Link>

          <AccountNavigation className="hidden lg:block hover:opacity-50 transition-opacity" />

          <Link
            to={route('carrito')}
            className="relative"
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
              <span className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-black text-white text-[9px] flex items-center justify-center">
                {count}
              </span>
            )}
          </Link>
        </nav>

      </div>
    </header>
  );
}
