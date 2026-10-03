import { AccountNavigation } from '../AccountNavigation';
import { Link } from 'react-router-dom';
import { Icon } from '../../ui';

export function MinimalSidebar() {
  return (
    <aside className="fixed left-0 top-0 bottom-0 z-50 hidden md:flex w-16 flex-col items-center bg-white border-r border-black/5">
      {/* Logo */}
      <Link
        to="."
        aria-label="Inicio"
        className="mt-5 w-9 h-9 rounded-full bg-[var(--primary)] text-white flex items-center justify-center font-semibold text-sm"
      >
        S
      </Link>

      {/* Navegación */}
      <nav
        className="flex flex-col items-center gap-3 mt-12"
        aria-label="Navegación lateral"
      >
        <Link
          to="."
          aria-label="Inicio"
          className="w-10 h-10 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-[var(--primary)] transition-colors"
        >
          <Icon name="home" className="w-5 h-5" />
        </Link>

        <Link
          to="catalogo"
          aria-label="Catálogo"
          className="w-10 h-10 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-[var(--primary)] transition-colors"
        >
          <Icon name="grid" className="w-5 h-5" />
        </Link>

        <Link
          to="seguimiento"
          aria-label="Seguimiento"
          className="w-10 h-10 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-[var(--primary)] transition-colors"
        >
          <Icon name="truck" className="w-5 h-5" />
        </Link>
      </nav>

      {/* Usuario */}
      <div className="mt-auto mb-5">
        <AccountNavigation className="w-9 h-9 rounded-full bg-gray-100 text-[var(--primary)] flex items-center justify-center text-xs font-semibold" />
      </div>
    </aside>
  );
}