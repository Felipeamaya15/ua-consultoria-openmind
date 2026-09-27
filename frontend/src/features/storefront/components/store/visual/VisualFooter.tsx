import { Link } from 'react-router-dom';

import { useStore } from '../../../context/StoreContext';

export function VisualFooter() {
  const { config } = useStore();

  return (
    <footer className="bg-[#111111] text-white">
      <div className="max-w-6xl mx-auto px-5 py-14">

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">

          <div>
            <p className="font-serif text-2xl mb-4">
              {config.name}
            </p>

            <p className="text-sm text-white/65 leading-relaxed max-w-sm">
              Tu tienda online de confianza. Productos
              seleccionados y envío rápido a todo Chile.
            </p>
          </div>

          <div>
            <p className="text-[10px] font-semibold tracking-[0.2em] mb-5">
              TIENDA
            </p>

            <nav className="flex flex-col gap-3 text-sm text-white/70">
              <Link
                to="catalogo"
                className="hover:text-white"
              >
                Catálogo
              </Link>

              <Link
                to="nuestra-historia"
                className="hover:text-white"
              >
                Nuestra historia
              </Link>

              <Link
                to="seguimiento"
                className="hover:text-white"
              >
                Seguimiento
              </Link>
            </nav>
          </div>

          <div>
            <p className="text-[10px] font-semibold tracking-[0.2em] mb-5">
              PROYECTO APOYADO POR
            </p>

            <p className="font-serif text-lg">
              Universidad Autónoma de Chile
            </p>
          </div>

        </div>

        <div className="border-t border-white/15 mt-12 pt-6 flex flex-col md:flex-row justify-between gap-4 text-xs text-white/40">

          <p>
            © 2026 {config.name}. Todos los derechos reservados.
          </p>

          <nav className="flex flex-wrap gap-5">
            <Link
              to="legal/terms"
              className="hover:text-white"
            >
              Términos
            </Link>

            <Link
              to="legal/privacy"
              className="hover:text-white"
            >
              Privacidad
            </Link>

            <Link
              to="legal/refund"
              className="hover:text-white"
            >
              Reembolsos
            </Link>
          </nav>

        </div>

      </div>
    </footer>
  );
}