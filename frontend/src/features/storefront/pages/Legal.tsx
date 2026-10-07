import { useParams, Link } from 'react-router-dom';

import { Breadcrumb } from '../components/ui';

import {
  defaultLegalPages,
  type LegalType,
  LEGAL_META,
  LEGAL_ORDER,
} from '../data/legalContent';

import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';

function isLegalType(
  value: string | undefined,
): value is LegalType {
  return (
    value === 'terms' ||
    value === 'privacy' ||
    value === 'refund'
  );
}

export default function Legal() {
  const { type } = useParams();

  const { route, isMinimal, isCatalog } =
    useStorefrontTemplate();

  const legal = defaultLegalPages;

  const activeType: LegalType =
    isLegalType(type) ? type : 'terms';

  const page = legal[activeType];
  const meta = LEGAL_META[activeType];

  if (isCatalog) {
    return (
      <div className="bg-[#050505] text-white">
        <div className="max-w-[900px] mx-auto px-5 py-10 md:py-14">
          <div className="mb-8">
            <Link
              to={route()}
              className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/40 hover:text-white transition-colors"
            >
              ← Volver a la tienda
            </Link>

            <p className="mt-8 text-[#ff5a1f] text-[10px] font-black uppercase tracking-[0.16em]">
              Información legal
            </p>

            <h1 className="mt-3 text-[42px] md:text-[54px] leading-[0.96] tracking-[-0.045em] font-black">
              {meta.label}
            </h1>

            <p className="mt-4 max-w-2xl text-[13px] leading-6 text-white/45">
              Consulta la información y condiciones asociadas a tu compra.
            </p>
          </div>

          <div className="rounded-[16px] bg-[#f5f5f3] p-6 md:p-10 text-[#151515]">
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
                        className="mt-8 first:mt-0 mb-3 text-[15px] font-black tracking-[-0.01em] text-[#151515]"
                      >
                        {block.replace(/\*\*/g, '')}
                      </h2>
                    );
                  }

                  return (
                    <p
                      key={index}
                      className="mb-4 text-[13px] leading-7 text-black/60"
                    >
                      {block}
                    </p>
                  );
                })}
            </div>

            <div className="mt-10 pt-6 border-t border-black/10">
              <p className="mb-3 text-[9px] font-black uppercase tracking-[0.16em] text-[#e04b1a]">
                Otras páginas legales
              </p>

              <div className="flex flex-wrap gap-2">
                {LEGAL_ORDER.map((key) => (
                  <Link
                    key={key}
                    to={route(`legal/${key}`)}
                    className={`rounded-full px-4 py-2 text-[11px] font-semibold transition-colors ${
                      activeType === key
                        ? 'bg-[#1683ff] text-white'
                        : 'bg-white text-black/60 hover:bg-black hover:text-white'
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
          <p className="text-xs text-gray-400 mb-2">
            Información legal
          </p>

          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-[#171717]">
            {meta.label}
          </h1>

          <p className="text-sm text-gray-500 mt-3 max-w-2xl">
            Consulta la información y condiciones
            asociadas a tu compra.
          </p>
        </div>
      )}

      <div
        className={
          isMinimal
            ? 'bg-white border border-black/5 rounded-[28px] p-6 md:p-10'
            : 'mt-6 bg-white border border-[var(--border)] rounded-2xl p-8'
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
                        ? 'font-semibold text-[#171717] mt-8 first:mt-0 mb-3 text-base'
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
                      ? 'text-sm leading-7 mb-4 text-gray-600'
                      : 'text-sm leading-relaxed mb-3'
                  }
                >
                  {block}
                </p>
              );
            })}
        </div>

        <div
          className={
            isMinimal
              ? 'flex flex-wrap gap-2 mt-10 pt-6 border-t border-black/5'
              : 'flex flex-wrap gap-4 mt-8 pt-6 border-t border-[var(--border)]'
          }
        >
          {LEGAL_ORDER.map((key) => (
            <Link
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
                        ? 'bg-[#17213b] text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
          <Link
            to={route()}
            className="text-sm text-gray-500 hover:text-[#17213b] transition-colors"
          >
            ← Volver a la tienda
          </Link>
        </div>
      )}
    </div>
  );
}
