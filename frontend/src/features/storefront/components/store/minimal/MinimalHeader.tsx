import { InstitutionalBadge } from '../../ui';
import { CompactMobileNavigation } from '../CompactMobileNavigation';
import { VISUAL_SECTION } from '../../../visual/sectionIds';
import { useStore } from '../../../context/StoreContext';
import { Link } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';
import { useStorefrontTemplate } from '../../../hooks/useStorefrontTemplate';

export function MinimalCartIcon({ count }: { count: number }) {
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
  const { route } = useStorefrontTemplate();


  return (
    <div data-visual-header-shell className="px-3 sm:px-4 md:px-8 pt-4 sm:pt-5">
      <header data-visual-section={VISUAL_SECTION.header} data-visual-part="headerLayout" className="max-w-6xl mx-auto bg-white rounded-2xl border border-black/5 shadow-sm px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 min-h-16 flex items-center justify-between gap-2 sm:gap-4">


        <InstitutionalBadge compact /><Link data-visual-part="logo" onClick={event => {
            if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
              window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
            }
          }}
          to={route()}
          aria-label={`Ir al inicio de ${config.name || 'la tienda'}`}
          className="flex min-w-0 max-w-full items-center gap-2 font-semibold text-[var(--primary)]"
        >
          {config.logo && <img data-landing-image src={config.logo} alt={`Logo de ${config.name}`} className="block w-auto h-auto max-w-[60px] sm:max-w-[110px] xl:max-w-[150px] max-h-9 sm:max-h-11 shrink-0 object-contain object-center" />}
          <span className="whitespace-nowrap text-base sm:text-lg font-bold">{config.name}</span>
        </Link>


        <div className="flex shrink-0 items-center gap-2 md:gap-4">


          <Link
            to={route('carrito')}
            aria-label={`Ver carrito (${count} productos)`}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[var(--primary)] text-[var(--on-primary)] flex md:hidden items-center justify-center hover:opacity-90 transition-opacity"
          >
            <MinimalCartIcon count={count} />
          </Link>
        </div>
        <CompactMobileNavigation />
      </header>
    </div>
  );
}