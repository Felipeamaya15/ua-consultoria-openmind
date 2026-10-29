import { CommercialPreferencesLink } from '../CommercialPreferencesLink';
import { StoreBusinessDescription } from '../StoreBusinessDescription';
import { useStore } from '../../../context/StoreContext';
import { VISUAL_SECTION } from '../../../visual/sectionIds';
import { InstitutionalBadge } from '../../ui';
import { Link } from 'react-router-dom';
import { useStorefrontTemplate } from '../../../hooks/useStorefrontTemplate';

export function CatalogFooter() {
  const { config } = useStore();
  const { route } = useStorefrontTemplate();

  return (
 <footer
      data-visual-section={VISUAL_SECTION.footer}
      className="bg-[var(--visual-footer-background,#050505)] border-t border-[color-mix(in_srgb,currentColor_10%,transparent)] text-[var(--visual-footer-color,#ffffff)]"
    >
      <div
        data-visual-part="footerLayout"
        className="max-w-[1160px] mx-auto px-5 py-10 md:py-12 grid grid-cols-1 md:grid-cols-2 gap-8 items-start"
      >
        <div>
          {config.logo && <img data-landing-image className="store-footer-logo" src={config.logo} alt={`Logo de ${config.name}`} />}
          <p
            data-visual-part="footerTitle"
            className="text-lg font-extrabold tracking-tight"
          >
            {config.name}
          </p>

        <StoreBusinessDescription className="mt-2 max-w-sm text-xs leading-relaxed text-[color-mix(in_srgb,currentColor_85%,transparent)]" />
        </div>

        <div className="flex flex-wrap md:justify-end gap-x-5 gap-y-2 text-[11px] text-[color-mix(in_srgb,currentColor_75%,transparent)]">
          <Link
            to={route('legal/privacy')}
            className="hover:text-inherit transition-colors"
          >
            Privacidad
          </Link>

          <Link
            to={route('legal/terms')}
            className="hover:text-inherit transition-colors"
          >
            Términos
          </Link>

          <Link
            to={route('legal/refund')}
            className="hover:text-inherit transition-colors"
          >
            Reembolso
          </Link>

          <Link
            to={route('legal/cookies')}
            className="hover:text-inherit transition-colors"
          >
            Cookies
          </Link>

          <Link
            to={route('seguimiento')}
            className="hover:text-inherit transition-colors"
          >
            Ayuda
          </Link>
        </div>
      </div>

      <div
        data-visual-part="branding"
        className="max-w-[1160px] mx-auto px-5 pb-8"
      >
        <InstitutionalBadge showVersion={true} />
      </div>

      <CommercialPreferencesLink />
    </footer>
  );
}
