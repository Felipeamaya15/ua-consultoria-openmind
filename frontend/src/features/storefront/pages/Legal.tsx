import React from 'react';
import { useParams, Link } from 'react-router-dom';

import { Breadcrumb } from '../components/ui';

import {
  type LegalType,
  LEGAL_META,
  LEGAL_ORDER,
  defaultLegalPages,
} from '../data/legalContent';
import { formatLegalDate, isLegalType } from '../data/legalPublication';
import { useStore } from '../context/StoreContext';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';

function renderInlineBold(text: string): React.ReactNode {
  if (!text.includes('**')) return text;
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-[var(--foreground)]">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

export default function Legal() {
  const { type } = useParams();

  const { route, isMinimal, isVisual, isCatalog } =
    useStorefrontTemplate();

  const { legalPages, legalVerified, legalError, legalLoading } = useStore();
  if (!legalVerified) return <p role={legalError ? 'alert' : 'status'}>{legalError || (legalLoading ? 'Consultando contenido legal vigente...' : 'Contenido legal no disponible.')}</p>;

  if (!isLegalType(type)) {
    return (
      <section className="w-full max-w-7xl mx-auto px-4 py-16">
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
  const page = (legalPages && legalPages[activeType]) || defaultLegalPages[activeType];
  const meta = LEGAL_META[activeType];
  const updatedOn = formatLegalDate(page.lastPublished);

  const renderBlocks = (headingClass: string, paragraphClass: string) =>
    page.published
      .split('\n\n')
      .filter(Boolean)
      .map((block, index) => {
        const isHeading =
          block.startsWith('**') &&
          block.endsWith('**') &&
          block.indexOf('**', 2) === block.length - 2;

        if (isHeading) {
          return (
            <h2 key={index} className={headingClass}>
              {block.replace(/\*\*/g, '')}
            </h2>
          );
        }

        const lines = block
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
        const isBulletList =
          lines.length > 1 && lines.every((line) => line.startsWith('- '));

        if (isBulletList) {
          return (
            <ul key={index} className="list-disc pl-5 mb-4 space-y-2">
              {lines.map((line, lineIdx) => (
                <li key={lineIdx} className={paragraphClass}>
                  {renderInlineBold(line.slice(2))}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={index} className={paragraphClass}>
            {renderInlineBold(block)}
          </p>
        );
      });

  if (isCatalog) {
    return (
      <div className="bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)]">
        <div className="w-full max-w-[1160px] mx-auto px-5 py-10 md:py-14">
          <div className="mb-8">
            <Breadcrumb
              items={[
                {
                  label: 'Inicio',
                },
                {
                  label: meta.label,
                },
              ]}
            />

            <p className="mt-8 text-[var(--primary)] text-xs font-black uppercase tracking-[0.16em]">
              Información legal
            </p>

            <h1 className="mt-3 text-[42px] md:text-[54px] leading-[0.96] tracking-[-0.045em] font-black">
              {meta.label}
            </h1>

            <p className="mt-4 text-sm leading-6 text-[var(--visual-page-color)]/80">
              Consulta la información y condiciones asociadas a tu compra.
            </p>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-[var(--visual-page-color)] border border-neutral-300 bg-transparent">
                Versión vigente {page.version ? `v${page.version}` : 'v1'}
              </span>
              {page.lastPublished && (
                <span className="text-xs text-[var(--visual-page-color)]/80">
                  Actualizada el {new Date(page.lastPublished).toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
              )}
            </div>
          </div>

          <div data-page-panel className="rounded-[16px] bg-[var(--visual-page-panel-background)] p-6 md:p-10 text-[var(--visual-page-color)]">
            <div className="max-w-none">
              {renderBlocks(
                'mt-8 first:mt-0 mb-3 text-base font-black tracking-[-0.01em] text-[var(--visual-page-color)]',
                'mb-4 text-sm leading-7 text-[var(--visual-page-color)]/85',
              )}
            </div>

            {activeType === 'cookies' && (
              <div className="mt-8 p-4 rounded-xl border border-[var(--visual-global-border)]/25 bg-[var(--visual-page-panel-background)] flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-[var(--visual-page-color)]">Tus preferencias de cookies</p>
                  <p className="text-xs text-[var(--visual-page-color)]/80">Puedes revisar o cambiar la configuración de cookies en cualquier momento.</p>
                </div>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event('openmind_open_cookie_banner'))}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--primary)] text-[var(--on-primary)] hover:opacity-90 transition-opacity"
                >
                  Configurar cookies
                </button>
              </div>
            )}

            {updatedOn && (
              <p className="mt-6 text-xs text-[var(--visual-page-color)]/75">
                Última actualización: {updatedOn}
              </p>
            )}

            <div className="mt-10 pt-6 border-t border-[var(--visual-global-border)]/20">
              <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[var(--primary)]">
                Otras páginas legales
              </p>

              <div data-legal-switcher className="flex flex-wrap gap-3">
                {LEGAL_ORDER.map((key) => {
                  const isActive = activeType === key;
                  return (
                    <Link
                      data-page-action="primary"
                      key={key}
                      to={route(`legal/${key}`)}
                      aria-current={isActive ? 'page' : undefined}
                      data-legal-link={isActive ? 'active' : 'inactive'}
                      className={`inline-flex items-center justify-center rounded-full px-5 py-2.5 text-xs font-semibold transition-colors ${
                        isActive
                          ? 'underline underline-offset-4 font-bold'
                          : 'hover:underline underline-offset-4'
                      }`}
                    >
                      {LEGAL_META[key].label}
                    </Link>
                  );
                })}
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
          ? 'w-full max-w-6xl mx-auto px-4 md:px-8 py-10 md:py-14'
          : isVisual
            ? 'w-full max-w-[1180px] mx-auto px-5 md:px-8 py-10 md:py-14'
            : 'w-full max-w-7xl mx-auto px-4 py-10'
      }
    >
      <Breadcrumb
        items={[
          {
            label: 'Inicio',
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

          <p className="text-sm text-[var(--visual-page-color)] mt-3">
            Consulta la información y condiciones
            asociadas a tu compra.
          </p>
        </div>
      )}

      <div data-page-panel
        className={
          isMinimal
            ? 'bg-[var(--visual-page-panel-background)] border border-[var(--visual-global-border)]/10 rounded-[28px] p-6 md:p-10'
            : 'mt-6 bg-[var(--visual-page-panel-background)] border border-[var(--border)] rounded-2xl p-6 md:p-8'
        }
      >
        {!isMinimal && (
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-3">
            {meta.label}
          </h1>
        )}

        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-[var(--foreground)] border border-neutral-300 bg-transparent">
            Versión vigente {page.version ? `v${page.version}` : 'v1'}
          </span>
          {page.lastPublished && (
            <span className="text-xs text-[var(--muted-foreground)]">
              • Actualizada el {new Date(page.lastPublished).toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          )}
        </div>

        <div className="max-w-none text-[var(--muted-foreground)]">
          {renderBlocks(
            isMinimal
              ? 'font-semibold text-[var(--visual-page-color)] mt-8 first:mt-0 mb-3 text-base'
              : 'font-semibold text-[var(--foreground)] mt-6 first:mt-0 mb-2 text-sm uppercase tracking-wider',
            isMinimal
              ? 'text-sm leading-7 mb-4 text-[var(--visual-page-color)]'
              : 'text-sm leading-relaxed mb-3 text-[var(--muted-foreground)]',
          )}
        </div>

        {activeType === 'cookies' && (
          <div className="mt-6 p-4 rounded-xl border border-[var(--border)] bg-[var(--muted)]/50 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-[var(--foreground)]">Tus preferencias de cookies</p>
              <p className="text-xs text-[var(--muted-foreground)]">Puedes revisar o cambiar la configuración de cookies en cualquier momento.</p>
            </div>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('openmind_open_cookie_banner'))}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--primary)] text-[var(--on-primary)] hover:opacity-90 transition-opacity"
            >
              Configurar cookies
            </button>
          </div>
        )}

        {updatedOn && (
          <p
            className={
              isMinimal
                ? 'mt-6 text-xs text-[var(--visual-page-color)]/75'
                : 'mt-6 text-xs text-[var(--muted-foreground)]'
            }
          >
            Última actualización: {updatedOn}
          </p>
        )}

        <div
          data-legal-switcher
          className={
            isMinimal
              ? 'flex flex-wrap gap-3 mt-10 pt-6 border-t border-[var(--visual-global-border)]/15'
              : 'flex flex-wrap gap-4 mt-8 pt-6 border-t border-[var(--border)]'
          }
        >
          {LEGAL_ORDER.map((key) => {
            const isActive = activeType === key;
            return (
              <Link
                data-page-action="primary"
                key={key}
                to={route(`legal/${key}`)}
                aria-current={isActive ? 'page' : undefined}
                data-legal-link={isActive ? 'active' : 'inactive'}
                className={
                  isMinimal
                    ? `inline-flex items-center justify-center px-5 py-2.5 rounded-full text-sm font-medium transition-colors ${
                        isActive
                          ? 'underline underline-offset-4 font-bold'
                          : 'hover:underline underline-offset-4'
                      }`
                    : `inline-flex items-center justify-center text-sm font-medium transition-colors ${
                        isActive
                          ? 'underline underline-offset-4 font-bold'
                          : 'hover:underline underline-offset-4'
                      }`
                }
              >
                {LEGAL_META[key].label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}