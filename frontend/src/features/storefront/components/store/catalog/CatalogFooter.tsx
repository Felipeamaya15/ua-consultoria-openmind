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
      className="bg-[var(--visual-footer-background,#050505)] border-t border-[color-mix(in_srgb,currentColor_15%,transparent)] text-[var(--visual-footer-color,#ffffff)] mt-16"
    >
      <div
        data-visual-part="footerLayout"
        className="max-w-[1160px] mx-auto px-5 py-10 grid grid-cols-1 md:grid-cols-4 gap-8 text-left items-start"
      >
        {/* Información de tienda */}
        <div className="md:col-span-2 text-left">
          {config.logo && <img data-landing-image className="store-footer-logo" src={config.logo} alt={`Logo de ${config.name}`} />}
          <p
            data-visual-part="footerTitle"
            className="text-2xl font-extrabold tracking-tight mb-2 text-left"
          >
            {config.name}
          </p>
          <StoreBusinessDescription className="text-sm leading-relaxed text-[color-mix(in_srgb,currentColor_85%,transparent)] text-left" />
        </div>

        {/* Tienda */}
        <div className="text-left">
          <p data-visual-part="footerTitle" className="text-xs font-semibold uppercase tracking-wider text-[color-mix(in_srgb,currentColor_70%,transparent)] mb-3 text-left">
            Tienda
          </p>
          <div className="flex flex-col gap-2 text-sm text-[color-mix(in_srgb,currentColor_80%,transparent)]">
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
          </div>
        </div>

        {/* Legal */}
        <div className="text-left">
          <p data-visual-part="footerTitle" className="text-xs font-semibold uppercase tracking-wider text-[color-mix(in_srgb,currentColor_70%,transparent)] mb-3 text-left">
            Legal
          </p>
          <div className="flex flex-col gap-2 text-sm text-[color-mix(in_srgb,currentColor_80%,transparent)]">
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
          </div>
        </div>
      </div>

      {/* Copyright siguiendo el ejemplo de la Plantilla 1 */}
      <div
        data-visual-part="branding"
        className="max-w-[1160px] mx-auto border-t border-[color-mix(in_srgb,currentColor_15%,transparent)] py-4 px-5 text-xs text-[color-mix(in_srgb,currentColor_75%,transparent)] flex flex-col sm:flex-row items-center justify-between gap-3"
      >
        <InstitutionalBadge compact showVersion={true} />
        <p className="text-center sm:text-right">© {new Date().getFullYear()} {config.name} · OpenMind</p>
      </div>

      <CommercialPreferencesLink />
    </footer>
  );
}