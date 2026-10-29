import { InstitutionalBadge } from '../../ui';
import { VISUAL_SECTION } from '../../../visual/sectionIds';
import { Link } from 'react-router-dom';

import { useStore } from '../../../context/StoreContext';

export function VisualFooter() {
  const { config } = useStore();

  return (
    <footer data-visual-section={VISUAL_SECTION.footer} className="bg-[var(--primary)] text-[var(--on-primary)] border-t border-[color-mix(in_srgb,currentColor_20%,transparent)]">
      <div className="max-w-6xl mx-auto px-5 py-14">

        <div data-visual-part="footerLayout" className="grid grid-cols-1 md:grid-cols-3 gap-12">

          <div>
            <p data-visual-part="footerTitle" className="font-serif text-2xl mb-4">
              {config.name}
            </p>

            <p className="text-sm text-[color-mix(in_srgb,currentColor_65%,transparent)] leading-relaxed max-w-sm">
              Tu tienda online de confianza. Productos
              seleccionados y envío rápido a todo Chile.
            </p>
          </div>

          <div>
            <p data-visual-part="footerTitle" className="text-[10px] font-semibold tracking-[0.2em] mb-5">
              TIENDA
            </p>

            <nav className="flex flex-col gap-3 text-sm text-[color-mix(in_srgb,currentColor_70%,transparent)]">
              <Link
                to="catalogo"
                className="hover:text-inherit"
              >
                Catálogo
              </Link>

              <Link
                to="nuestra-historia"
                className="hover:text-inherit"
              >
                Nuestra historia
              </Link>

              <Link
                to="seguimiento"
                className="hover:text-inherit"
              >
                Seguimiento
              </Link>
            </nav>
          </div>

          <div data-visual-part="branding"><InstitutionalBadge showVersion={true} /></div>

        </div>

        <div className="border-t border-[color-mix(in_srgb,currentColor_15%,transparent)] mt-12 pt-6 flex flex-col md:flex-row justify-between gap-4 text-xs text-[color-mix(in_srgb,currentColor_60%,transparent)]">

          <p>
            © 2026 {config.name}. Todos los derechos reservados.
          </p>

          <nav className="flex flex-wrap gap-5">
            <Link
              to="legal/terms"
              className="hover:text-inherit"
            >
              Términos
            </Link>

            <Link
              to="legal/privacy"
              className="hover:text-inherit"
            >
              Privacidad
            </Link>

            <Link
              to="legal/refund"
              className="hover:text-inherit"
            >
              Reembolsos
            </Link>

            <Link
              to="legal/cookies"
              className="hover:text-inherit"
            >
              Cookies
            </Link>
          </nav>

        </div>

      </div>
    </footer>
  );
}