import { useParams, Link } from 'react-router-dom';

import { Breadcrumb } from '../components/ui';

import {
  type LegalType,
  LEGAL_META,
  LEGAL_ORDER,
} from '../data/legalContent';
import { formatLegalDate, isLegalType } from '../data/legalPublication';
import { useStore } from '../context/StoreContext';

import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';

export default function Legal() {
  const { type } = useParams();

  const { route, isMinimal, isCatalog } =
    useStorefrontTemplate();

  const { legalPages } = useStore();

  if (!isLegalType(type)) {
    return (
      <section className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="font-display text-3xl mb-4">Página no encontrada</h1>
        <p className="text-sm mb-6">La página legal que buscas no existe.</p>
        <div className="flex flex-wrap gap-4">
          {LEGAL_ORDER.map((key) => (
            <Link
              key={key}
              to={route(`legal/${key}`)}
              className="text-sm font-medium text-[var(--primary)] underline"
            >
              {LEGAL_META[key].label}
            </Link>
          ))}
        </div>
      </section>
    );
  }

  const activeType: LegalType = type;
  const page = legalPages[activeType];
  const meta = LEGAL_META[activeType];
  const updatedOn = formatLegalDate(page.lastPublished);

  if (isCatalog) {
    return (
      <div className="bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)]">
        <div className="max-w-[900px] mx-auto px-5 py-10 md:py-14">
          <div className="mb-8">
            <Link data-page-action="ghost"
              to={route()}
              className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--visual-page-color)]/40 hover:text-[var(--visual-page-color)] transition-colors"
            >
              ← Volver a la tienda
            </Link>

            <p className="mt-8 text-[var(--primary)] text-[10px] font-black uppercase tracking-[0.16em]">
              Información legal
            </p>

            <h1 className="mt-3 text-[42px] md:text-[54px] leading-[0.96] tracking-[-0.045em] font-black">
              {meta.label}
            </h1>

            <p className="mt-4 max-w-2xl text-[13px] leading-6 text-[var(--visual-page-color)]/45">
              Consulta la información y condiciones asociadas a tu compra.
            </p>
          </div>

          <div data-page-panel className="rounded-[16px] bg-[var(--visual-page-panel-background)] p-6 md:p-10 text-[var(--visual-page-color)]">
            <div className="max-w-none">
              {page.published
                .split('\n\n')
                .filter(Boolean)
                .map((block, index) => {
                  const isHeading =
                    block.startsWith('**') &&
                    block.endsWith('**') &&
                    block.indexOf('**', 2) ===
                      block.length - 2;

                  if (isHeading) {
                    return (
                      <h2
                        key={index}
                        className="mt-8 first:mt-0 mb-3 text-[15px] font-black tracking-[-0.01em] text-[var(--visual-page-color)]"
                      >
                        {block.replace(/\*\*/g, '')}
                      </h2>
                    );
                  }

                  return (
                    <p
                      key={index}
                      className="mb-4 text-[13px] leading-7 text-[var(--visual-page-color)]/60"
                    >
                      {block}
                    </p>
                  );
                })}
            </div>

            {updatedOn && (
              <p className="mt-6 text-[11px] text-[var(--visual-page-color)]/40">
                Última actualización: {updatedOn}
              </p>
            )}

            <div className="mt-10 pt-6 border-t border-[var(--visual-global-border)]/10">
              <p className="mb-3 text-[9px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
                Otras páginas legales
              </p>

              <div className="flex flex-wrap gap-2">
                {LEGAL_ORDER.map((key) => (
                  <Link data-page-action="primary"
                    key={key}
                    to={route(`legal/${key}`)}
                    className={`rounded-full px-4 py-2 text-[11px] font-semibold transition-colors ${
                      activeType === key
                        ? 'bg-[var(--primary)] text-[var(--visual-page-color)]'
                        : 'bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)]/60 hover:bg-[var(--visual-page-panel-background)] hover:text-[var(--visual-page-color)]'
                    }`}
                  >
                    {LEGAL_META[key].label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        isMinimal
          ? 'max-w-4xl mx-auto px-4 md:px-8 py-10 md:py-14'
          : 'max-w-3xl mx-auto px-4 py-10'
      }
    >
      <Breadcrumb
        items={[
          {
            label: 'Inicio',
            href: route(),
          },
          {
            label: meta.label,
          },
        ]}
      />

      {isMinimal && (
        <div className="mt-8 mb-7">
          <p className="text-xs text-[var(--visual-page-color)] mb-2">
            Información legal
          </p>

          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-[var(--visual-page-color)]">
            {meta.label}
          </h1>

          <p className="text-sm text-[var(--visual-page-color)] mt-3 max-w-2xl">
            Consulta la información y condiciones
            asociadas a tu compra.
          </p>
        </div>
      )}

      <div data-page-panel
        className={
          isMinimal
            ? 'bg-[var(--visual-page-panel-background)] border border-[var(--visual-global-border)]/5 rounded-[28px] p-6 md:p-10'
            : 'mt-6 bg-[var(--visual-page-panel-background)] border border-[var(--border)] rounded-2xl p-8'
        }
      >
        {!isMinimal && (
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-6">
            {meta.label}
          </h1>
        )}

        <div className="max-w-none text-[var(--muted-foreground)]">
          {page.published
            .split('\n\n')
            .filter(Boolean)
            .map((block, index) => {
              const isHeading =
                block.startsWith('**') &&
                block.endsWith('**') &&
                block.indexOf('**', 2) ===
                  block.length - 2;

              if (isHeading) {
                return (
                  <h2
                    key={index}
                    className={
                      isMinimal
                        ? 'font-semibold text-[var(--visual-page-color)] mt-8 first:mt-0 mb-3 text-base'
                        : 'font-semibold text-[var(--foreground)] mt-6 mb-2 text-sm uppercase tracking-wider'
                    }
                  >
                    {block.replace(/\*\*/g, '')}
                  </h2>
                );
              }

              return (
                <p
                  key={index}
                  className={
                    isMinimal
                      ? 'text-sm leading-7 mb-4 text-[var(--visual-page-color)]'
                      : 'text-sm leading-relaxed mb-3'
                  }
                >
                  {block}
                </p>
              );
            })}
        </div>

        {updatedOn && (
          <p
            className={
              isMinimal
                ? 'mt-6 text-xs text-[var(--visual-page-color)]/50'
                : 'mt-6 text-xs text-[var(--muted-foreground)]'
            }
          >
            Última actualización: {updatedOn}
          </p>
        )}
        <div
          className={
            isMinimal
              ? 'flex flex-wrap gap-2 mt-10 pt-6 border-t border-[var(--visual-global-border)]/5'
              : 'flex flex-wrap gap-4 mt-8 pt-6 border-t border-[var(--border)]'
          }
        >
          {LEGAL_ORDER.map((key) => (
            <Link data-page-action="primary"
              key={key}
              to={route(`legal/${key}`)}
              className={
                isMinimal
                  ? `
                    px-4 py-2
                    rounded-full
                    text-sm
                    font-medium
                    transition-colors
                    ${
                      activeType === key
                        ? 'bg-[var(--primary)] text-[var(--visual-page-color)]'
                        : 'bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)] hover:bg-[var(--visual-page-panel-background)]'
                    }
                  `
                  : `
                    text-sm
                    font-medium
                    transition-colors
                    ${
                      activeType === key
                        ? 'text-[var(--primary)] underline'
                        : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                    }
                  `
              }
            >
              {LEGAL_META[key].label}
            </Link>
          ))}
        </div>
      </div>

      {isMinimal && (
        <div className="text-center mt-7">
          <Link data-page-action="ghost"
            to={route()}
            className="text-sm text-[var(--visual-page-color)] hover:text-[var(--primary)] transition-colors"
          >
            ← Volver a la tienda
          </Link>
        </div>
      )}
    </div>
  );
}
