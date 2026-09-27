import { Link } from 'react-router-dom';
import { useStorefrontTemplate } from '../../../hooks/useStorefrontTemplate';

export function CatalogFooter() {
  const { route } = useStorefrontTemplate();

  return (
    <footer className="bg-[#050505] border-t border-white/10 text-white">
      <div className="max-w-[1160px] mx-auto px-5 py-10 md:py-12 grid grid-cols-1 md:grid-cols-3 gap-7 items-start">
        <div>
          <p className="text-lg font-extrabold tracking-tight">
            Mi Tienda
          </p>

          <p className="mt-2 max-w-xs text-[12px] leading-5 text-white/45">
            Compra simple, productos seleccionados e información clara.
          </p>
        </div>

        <div className="md:text-center">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#e04b1a]">
            Compra con confianza
          </p>

          <p className="mt-2 text-[12px] text-white/45">
            Envíos a todo Chile · Pago seguro
          </p>
        </div>

        <div className="flex flex-wrap md:justify-end gap-x-5 gap-y-2 text-[11px] text-white/50">
          <Link
            to={route('legal/privacy')}
            className="hover:text-white transition-colors"
          >
            Privacidad
          </Link>

          <Link
            to={route('legal/terms')}
            className="hover:text-white transition-colors"
          >
            Términos
          </Link>

          <Link
            to={route('legal/refund')}
            className="hover:text-white transition-colors"
          >
            Reembolso
          </Link>

          <Link
            to={route('seguimiento')}
            className="hover:text-white transition-colors"
          >
            Ayuda
          </Link>
        </div>
      </div>
    </footer>
  );
}
