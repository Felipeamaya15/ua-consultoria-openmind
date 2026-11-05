import { CommercialPreferencesLink } from '../CommercialPreferencesLink';
import { StoreBusinessDescription } from '../StoreBusinessDescription';
import { InstitutionalBadge } from '../../ui';
import { VISUAL_SECTION } from '../../../visual/sectionIds';

import { Link } from 'react-router-dom';
import { useStore } from '../../../context/StoreContext';
import { useStorefrontTemplate } from '../../../hooks/useStorefrontTemplate';

export function MinimalFooter() {
  const { config } = useStore();
  const { route } = useStorefrontTemplate();

  return (
    <footer data-visual-section={VISUAL_SECTION.footer} className="px-4 md:px-8 pb-6 mt-20">
      <div className="max-w-6xl mx-auto bg-[var(--primary)] text-[var(--on-primary)] rounded-[28px] px-6 md:px-10 py-10">
        <div data-visual-part="footerLayout" className="grid grid-cols-1 md:grid-cols-4 gap-8 text-left items-start">
          {/* Información de tienda */}
          <div className="md:col-span-2 text-left">
            {config.logo && <img data-landing-image className="store-footer-logo" src={config.logo} alt={`Logo de ${config.name}`} />}
            <p data-visual-part="footerTitle" className="text-2xl font-semibold mb-2 text-left">
              {config.name}
            </p>
            <StoreBusinessDescription className="text-sm leading-relaxed text-left" />
          </div>

          {/* Tienda */}
          <div className="text-left">
            <p data-visual-part="footerTitle" className="text-xs font-semibold uppercase tracking-wider text-[color-mix(in_srgb,currentColor_70%,transparent)] mb-3 text-left">
              Tienda
            </p>
            <div className="flex flex-col gap-2 text-sm text-[color-mix(in_srgb,currentColor_80%,transparent)]">
              <Link to={route('catalogo')} className="hover:text-inherit transition-colors">
                Catálogo
              </Link>
              <Link to={route('seguimiento')} className="hover:text-inherit transition-colors">
                Seguimiento
              </Link>
            </div>
          </div>

          {/* Legal */}
          <div className="text-left">
            <p data-visual-part="footerTitle" className="text-xs font-semibold uppercase tracking-wider text-[color-mix(in_srgb,currentColor_70%,transparent)] mb-3 text-left">
              Legal
            </p>
            <div className="flex flex-col gap-2 text-sm text-[color-mix(in_srgb,currentColor_80%,transparent)]">
              <Link to={route('legal/terms')} className="hover:text-inherit transition-colors">
                Términos
              </Link>
              <Link to={route('legal/privacy')} className="hover:text-inherit transition-colors">
                Privacidad
              </Link>
              <Link to={route('legal/refund')} className="hover:text-inherit transition-colors">
                Reembolsos
              </Link>
              <Link to={route('legal/cookies')} className="hover:text-inherit transition-colors">
                Cookies
              </Link>
            </div>
          </div>
        </div>

        <div data-visual-part="branding" className="border-t border-[color-mix(in_srgb,currentColor_15%,transparent)] mt-8 pt-5 text-xs text-[color-mix(in_srgb,currentColor_75%,transparent)] flex flex-col sm:flex-row items-center justify-between gap-3">
          <InstitutionalBadge compact showVersion={true} />
          <p className="text-center sm:text-right">© {new Date().getFullYear()} {config.name} · OpenMind</p>
        </div>
      </div>
      <CommercialPreferencesLink />
    </footer>
  );
}