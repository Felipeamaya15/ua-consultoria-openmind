import { CommercialPreferencesLink } from '../CommercialPreferencesLink';
import { StoreBusinessDescription } from '../StoreBusinessDescription';
import { InstitutionalBadge } from '../../ui';
import { VISUAL_SECTION } from '../../../visual/sectionIds';
import { Link } from 'react-router-dom';

import { useStore } from '../../../context/StoreContext';

export function VisualFooter() {
  const { config, landing } = useStore();

  return (
    <footer data-visual-section={VISUAL_SECTION.footer} className="bg-[#111111] text-white">
      <div className="max-w-6xl mx-auto px-5 py-14">

        <div data-visual-part="footerLayout" className="grid grid-cols-1 md:grid-cols-3 gap-12">

          <div>
            {config.logo && <img data-landing-image className="store-footer-logo" src={config.logo} alt={`Logo de ${config.name}`} />}
          <p data-visual-part="footerTitle" className="font-serif text-2xl mb-4">
              {config.name}
            </p>

            <StoreBusinessDescription className="text-sm leading-relaxed max-w-sm" />
          </div>

          <div>
            <p data-visual-part="footerTitle" className="text-[10px] font-semibold tracking-[0.2em] mb-5">
              TIENDA
            </p>

            <nav className="flex flex-col gap-3 text-sm text-white/70">
              <Link
                to="catalogo"
                className="hover:text-white"
              >
                Catálogo
              </Link>

              {landing?.contenido?.bloques?.some(block=>block.visible&&block.tipo==='historia') && <Link
                to="nuestra-historia"
                className="hover:text-white"
              >
                Nuestra historia
              </Link>}

              <Link
                to="seguimiento"
                className="hover:text-white"
              >
                Seguimiento
              </Link>
            </nav>
          </div>

          <div data-visual-part="branding"><InstitutionalBadge showVersion={true} /></div>

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

            <Link
              to="legal/cookies"
              className="hover:text-white"
            >
              Cookies
            </Link>
          </nav>

        </div>

      </div>
    <CommercialPreferencesLink />
    </footer>
  );
}
