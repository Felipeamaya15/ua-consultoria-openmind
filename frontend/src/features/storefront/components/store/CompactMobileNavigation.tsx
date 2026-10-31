import { useStore } from '../../context/StoreContext';
import { Link, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useStorefrontTemplate } from '../../hooks/useStorefrontTemplate';
import { AccountNavigation } from './AccountNavigation';

export function CompactMobileNavigation() {
  const {landing} = useStore();
  const {route,template} = useStorefrontTemplate();
  const {pathname} = useLocation();
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if(ref.current) ref.current.open=false; }, [pathname]);
  return (
    <details
      ref={ref}
      className="store-mobile-navigation"
      onKeyDown={event => {
        if (event.key === 'Escape' && ref.current?.open) {
          event.preventDefault();
          ref.current.open = false;
          ref.current.querySelector('summary')?.focus();
        }
      }}
    >
      <summary aria-label="Abrir navegación de la tienda">Menú</summary>
      <nav aria-label="Navegación móvil">
        <Link to={route()}>Inicio</Link>
        <Link to={route('catalogo')}>Catálogo</Link>
        <Link to={route('seguimiento')}>Seguimiento</Link>
        {template === 'visual' && landing?.contenido?.bloques?.some(block=>block.visible&&block.tipo==='historia') && <Link to={route('nuestra-historia')}>Nuestra historia</Link>}
        <AccountNavigation />
      </nav>
    </details>
  );
}