
import { Link } from 'react-router-dom';
import { useStore } from '../../../context/StoreContext';

export function MinimalFooter() {
  const { config } = useStore();

  return (
    <footer className="px-4 md:px-8 pb-6 mt-20">
      <div className="max-w-6xl mx-auto bg-[#111111] text-white rounded-[28px] px-6 md:px-10 py-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div>
            <p className="text-2xl font-semibold mb-2">
              {config.name}.
            </p>

            <p className="text-sm text-white/50 max-w-sm">
              Descubre productos de tiendas que te encantan.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/60">
            <Link
              to="legal/privacy"
              className="hover:text-white transition-colors"
            >
              Privacidad
            </Link>

            <Link
              to="legal/terms"
              className="hover:text-white transition-colors"
            >
              Términos
            </Link>

            <Link
              to="legal/refund"
              className="hover:text-white transition-colors"
            >
              Reembolsos
            </Link>

            <Link
              to="seguimiento"
              className="hover:text-white transition-colors"
            >
              Seguimiento
            </Link>
          </nav>
        </div>

        <div className="border-t border-white/10 mt-8 pt-5 text-[11px] text-white/35">
          © 2025 {config.name} · Universidad Autónoma de Chile
        </div>
      </div>
    </footer>
  );
}