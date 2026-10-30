import { CommercialPreferencesLink } from '../CommercialPreferencesLink';
import { StoreBusinessDescription } from '../StoreBusinessDescription';
import { InstitutionalBadge } from '../../ui';
import { VISUAL_SECTION } from '../../../visual/sectionIds';

import { Link } from 'react-router-dom';
import { useStore } from '../../../context/StoreContext';

export function MinimalFooter() {
  const { config } = useStore();

  return (
    <footer data-visual-section={VISUAL_SECTION.footer} className="px-4 md:px-8 pb-6 mt-20">
      <div className="max-w-6xl mx-auto bg-[var(--primary)] text-[var(--on-primary)] rounded-[28px] px-6 md:px-10 py-10">
        <div data-visual-part="footerLayout" className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div>
            {config.logo && <img data-landing-image className="store-footer-logo" src={config.logo} alt={`Logo de ${config.name}`} />}
          <p data-visual-part="footerTitle" className="text-2xl font-semibold mb-2">
              {config.name}.
            </p>

          <StoreBusinessDescription className="text-sm leading-relaxed max-w-sm" />
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[color-mix(in_srgb,currentColor_60%,transparent)]">
            <Link
              to="legal/privacy"
              className="hover:text-inherit transition-colors"
            >
              Privacidad
            </Link>

            <Link
              to="legal/terms"
              className="hover:text-inherit transition-colors"
            >
              Términos
            </Link>

            <Link
              to="legal/refund"
              className="hover:text-inherit transition-colors"
            >
              Reembolsos
            </Link>

            <Link
              to="legal/cookies"
              className="hover:text-inherit transition-colors"
            >
              Cookies
            </Link>

            <Link
              to="seguimiento"
              className="hover:text-inherit transition-colors"
            >
              Seguimiento
            </Link>
          </nav>
        </div>

        <div data-visual-part="branding" className="border-t border-[color-mix(in_srgb,currentColor_10%,transparent)] mt-8 pt-5 text-[11px] text-[color-mix(in_srgb,currentColor_60%,transparent)]">
          <InstitutionalBadge showVersion={true} /><p>© 2025 {config.name}</p>
        </div>
      </div>
    <CommercialPreferencesLink />
    </footer>
  );
}
