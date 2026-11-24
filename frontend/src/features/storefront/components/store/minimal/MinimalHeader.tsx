import { MinimalCartIcon } from './MinimalCartIcon';
export { MinimalCartIcon } from './MinimalCartIcon';
import { useEffect, useState } from 'react';
import { AdminModal } from '../../../../admin/components/ui/AdminModal';
import { MinimalSidebar } from './MinimalSidebar';
import { InstitutionalBadge, Icon } from '../../ui';
import { VISUAL_SECTION } from '../../../visual/sectionIds';
import { useStore } from '../../../context/StoreContext';
import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';
import { useStorefrontTemplate } from '../../../hooks/useStorefrontTemplate';

export function MinimalHeader() {
  const [menuOpen,setMenuOpen]=useState(false);
  const {pathname,search}=useLocation();
  useEffect(()=>setMenuOpen(false),[pathname,search]);
  useEffect(()=>{const media=window.matchMedia('(min-width: 768px)');const close=()=>{if(media.matches)setMenuOpen(false);};media.addEventListener('change',close);return()=>media.removeEventListener('change',close);},[]);
  const { config } = useStore();
  const { count } = useCart();
  const { route } = useStorefrontTemplate();


  return (
    <div data-visual-header-shell className="minimal-header-shell px-3 sm:px-4 md:px-8 pt-4 sm:pt-5">
      <header data-visual-section={VISUAL_SECTION.header} data-visual-part="headerLayout" className="max-w-6xl mx-auto bg-white rounded-2xl border border-black/5 shadow-sm px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 min-h-16 flex items-center justify-between gap-2 sm:gap-4">


        <InstitutionalBadge compact /><Link data-visual-part="logo" onClick={event => {
            if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.currentTarget.pathname === window.location.pathname) {
              window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
            }
          }}
          to={route()}
          aria-label={`Ir al inicio de ${config.name || 'la tienda'}`}
          className="flex min-w-0 max-w-full items-center gap-2 font-semibold text-[var(--primary)]"
        >
          {config.logo && <img data-landing-image src={config.logo} alt={`Logo de ${config.name}`} className="block w-auto h-auto max-w-[60px] sm:max-w-[110px] xl:max-w-[150px] max-h-9 sm:max-h-11 shrink-0 object-contain object-center" />}
          <span className="min-w-0 truncate text-sm sm:text-lg font-bold">{config.name}</span>
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
        <button type="button" className="minimal-menu-button md:hidden" aria-label="Abrir menú de navegación" aria-expanded={menuOpen} onClick={()=>setMenuOpen(true)}><Icon name="menu" className="w-5 h-5" /></button>
        <AdminModal open={menuOpen} onClose={()=>setMenuOpen(false)} title="Menú de la tienda" className="minimal-navigation-drawer" size="sm"><MinimalSidebar mobile onNavigate={()=>setMenuOpen(false)} /></AdminModal>
      </header>
    </div>
  );
}