import { AccountNavigation } from '../AccountNavigation';
import { useStore } from '../../../context/StoreContext';
import { Link } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';
import { useStorefrontTemplate } from '../../../hooks/useStorefrontTemplate';

export function CatalogHeader() {
  const { landing } = useStore();
  const { count } = useCart();
  const { route } = useStorefrontTemplate();

  return (
    <>
      <div className="bg-[#1d1d1f] text-white text-center text-[11px] py-2 px-4">
        Compra online con envío a todo Chile.{' '}
        <Link to={route('seguimiento')} className="text-[var(--primary)] hover:opacity-70">
          Revisa tu pedido →
        </Link>
      </div>

      <header className="sticky top-0 z-50 bg-[#050505]/90 backdrop-blur-md py-3">
        <div className="max-w-[1160px] mx-auto px-5">
          <nav className="h-14 rounded-full bg-[#202022] border border-white/[0.06] px-5 md:px-7 flex items-center justify-between shadow-2xl shadow-black/30">
            <Link
              to={route()}
              aria-label="Inicio"
              className="flex items-center text-white hover:text-[var(--primary)] transition-colors"
            >
              {landing?.logo ? <img data-landing-image src={landing.logo} alt="Logo de la tienda" className="block w-auto h-auto max-w-[80px] sm:max-w-[120px] xl:max-w-[160px] max-h-10 sm:max-h-11 shrink-0 object-contain object-center" /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5" strokeWidth="1.7">
                <path d="M3 11.5 12 4l9 7.5" />
                <path d="M5.5 10v10h13V10" />
                <path d="M9.5 20v-6h5v6" />
              </svg>}
            </Link>

            <div className="flex items-center gap-5 md:gap-8 text-[12px] font-semibold text-white">
              <Link to={route()} className="hidden sm:block hover:text-[var(--primary)] transition-colors">
                Mi Tienda
              </Link>
              <Link to={route('catalogo')} className="hover:text-[var(--primary)] transition-colors">
                Catálogo
              </Link>
              <AccountNavigation className="hidden sm:block hover:text-[var(--primary)] transition-colors" />
              <Link to={route('seguimiento')} className="hidden md:block hover:text-[var(--primary)] transition-colors">
                Seguimiento
              </Link>
            </div>

            <Link
              to={route('carrito')}
              className="relative text-white hover:text-[var(--primary)] transition-colors"
              aria-label={`Carrito con ${count} productos`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5" strokeWidth="1.6">
                <path d="M6 8h12l-1 12H7L6 8Z" />
                <path d="M9 9V6a3 3 0 0 1 6 0v3" />
              </svg>
              {count > 0 && (
                <span className="absolute -top-2.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-[var(--primary)] text-white text-[9px] flex items-center justify-center">
                  {count}
                </span>
              )}
            </Link>
          </nav>
        </div>
      </header>
    </>
  );
}
