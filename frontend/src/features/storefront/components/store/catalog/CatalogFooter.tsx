import { useLandingContent } from '../../../../landing/hooks/useLandingContent';
import { Icon } from '../../ui';
import { useLandingSectionVisibility } from '../../../../landing/hooks/useLandingSectionVisibility';
import { Link } from 'react-router-dom';
import { useStorefrontTemplate } from '../../../hooks/useStorefrontTemplate';

export function CatalogFooter() {
  const { content } = useLandingContent();
  const isSectionVisible = useLandingSectionVisibility();
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

        {isSectionVisible('Beneficios') && content.beneficios.length > 0 && (<div className="md:text-center">
          {content.beneficios.map((b, i) => <div key={i} className="mb-4"><Icon name={b.icono} className="w-5 h-5 inline-block" /><p className="text-[10px] uppercase tracking-[0.18em] text-[var(--primary)] mt-2">{b.titulo}</p>{b.descripcion && <p className="mt-2 text-[12px] text-white/45">{b.descripcion}</p>}</div>)}
        </div>)}

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
