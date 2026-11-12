import { CommercialPreferencesLink } from '../CommercialPreferencesLink';
import { StoreBusinessDescription } from '../StoreBusinessDescription';
import { InstitutionalBadge } from '../../ui';
import { VISUAL_SECTION } from '../../../visual/sectionIds';
import { Link } from 'react-router-dom';

import { useStore } from '../../../context/StoreContext';
import { useStorefrontTemplate } from '../../../hooks/useStorefrontTemplate';

export function VisualFooter() {
  const { config } = useStore();
  const { route } = useStorefrontTemplate();

  return (
    <footer data-visual-section={VISUAL_SECTION.footer} className="bg-[var(--primary)] text-[var(--on-primary)] border-t border-[color-mix(in_srgb,currentColor_20%,transparent)] mt-16">
      <div className="max-w-6xl mx-auto px-5 py-12">

        <div data-visual-part="footerLayout" className="grid grid-cols-1 md:grid-cols-4 gap-8 text-left items-start">

          <div className="md:col-span-2 text-left">
            {config.logo && <img data-landing-image className="store-footer-logo" src={config.logo} alt={`Logo de ${config.name}`} />}
            <p data-visual-part="footerTitle" className="font-serif text-2xl mb-3 text-left">
              {config.name}
            </p>
            <StoreBusinessDescription className="text-sm leading-relaxed text-left" />
          </div>

          <div className="text-left">
            <p data-visual-part="footerTitle" className="text-xs font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,currentColor_70%,transparent)] mb-4 text-left">
              Tienda
            </p>

            <nav className="flex flex-col gap-2.5 text-sm text-[color-mix(in_srgb,currentColor_80%,transparent)]">
              <Link
                to={route('catalogo')}
                className="hover:text-inherit transition-colors"
              >
                Catálogo
              </Link>

              <Link
                to={route('seguimiento')}
                className="hover:text-inherit transition-colors"
              >
                Seguimiento
              </Link>
            </nav>
          </div>

          <div className="text-left">
            <p data-visual-part="footerTitle" className="text-xs font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,currentColor_70%,transparent)] mb-4 text-left">
              Legal
            </p>

            <nav className="flex flex-col gap-2.5 text-sm text-[color-mix(in_srgb,currentColor_80%,transparent)]">
              <Link
                to={route('legal/terms')}
                className="hover:text-inherit transition-colors"
              >
                Términos
              </Link>

              <Link
                to={route('legal/privacy')}
                className="hover:text-inherit transition-colors"
              >
                Privacidad
              </Link>

              <Link
                to={route('legal/refund')}
                className="hover:text-inherit transition-colors"
              >
                Reembolsos
              </Link>

              <Link
                to={route('legal/cookies')}
                className="hover:text-inherit transition-colors"
              >
                Cookies
              </Link>
            </nav>
          </div>

        </div>

        <div data-visual-part="branding" className="border-t border-[color-mix(in_srgb,currentColor_15%,transparent)] mt-10 pt-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[color-mix(in_srgb,currentColor_75%,transparent)]">
          <InstitutionalBadge compact showVersion={true} />
          <p className="text-center sm:text-right">© {new Date().getFullYear()} {config.name} · OpenMind</p>
        </div>

      </div>
      <CommercialPreferencesLink />
    </footer>
  );
}