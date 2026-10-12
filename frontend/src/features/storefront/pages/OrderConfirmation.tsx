import {
  Link,
  Navigate,
  useLocation,
} from 'react-router-dom';

import { Button, Icon } from '../components/ui';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';
import TransbankReturnResult from './TransbankReturnResult';
import type { CreatedOrder } from '../services/orderService';
import { isStorefrontEditorPreview } from '../visual/pages';

interface ConfirmationState extends Pick<CreatedOrder, 'identificador'> {
  orderNumber?: string;
  email?: string;
}

export default function OrderConfirmation() {
  const location = useLocation();

  const { route, isMinimal, isVisual, isCatalog } =
    useStorefrontTemplate();

  // Retorno desde Webpay: el resultado llega por la URL (?token_ws=... o
  // ?TBK_TOKEN=... si el cliente cancela), no por navegación interna.
  const query = new URLSearchParams(location.search);
  const tokenWs = query.get('token_ws') ?? '';
  const tbkToken = query.get('TBK_TOKEN') ?? '';

  if (tokenWs || tbkToken) {
    return (
      <TransbankReturnResult
        orderNumber={query.get('orderNumber') ?? query.get('TBK_ORDEN_COMPRA') ?? ''}
        tokenWs={tokenWs}
        tbkToken={tbkToken}
        tiendaId={Number(query.get('tienda')) || 1}
      />
    );
  }

  let editorPreview = false;
  try { editorPreview = isStorefrontEditorPreview(window.parent !== window, window.parent.location.pathname); } catch { /* Cross-origin parents cannot enable examples. */ }
  // Presentation-only sample. No order service, storage or payment operation.
  const state = (location.state as ConfirmationState | null) ?? (editorPreview
    ? { orderNumber: 'VISTA-PREVIA', email: 'ejemplo@example.test', identificador: 'VISTA-PREVIA' }
    : null);

  if (!state?.orderNumber) {
    return (
      <Navigate
        to={route('catalogo')}
        replace
      />
    );
  }

  const orderNumber = state.orderNumber;
  const email = state.email ?? 'tu correo';
  const identificador = state.identificador?.trim();
  const trackingRoute = identificador
    ? `${route('seguimiento')}?orden=${encodeURIComponent(identificador)}`
    : route('seguimiento');

  /*
   * ==========================================================
   * PLANTILLA 3 — VELTA
   * ==========================================================
   */
  if (isCatalog) {
    return (
      <div className="max-w-[760px] mx-auto px-5 py-16 md:py-20 text-center text-[var(--visual-page-color)]">
        <div className="mx-auto w-16 h-16 rounded-full bg-[var(--primary)] flex items-center justify-center">
          <span className="text-2xl font-black" aria-hidden="true">✓</span>
        </div>

        <p className="mt-7 text-[var(--primary)] text-[10px] font-black uppercase tracking-[0.16em]">
          Compra registrada
        </p>

        <h1 className="mt-3 text-[42px] md:text-[54px] leading-[0.96] tracking-[-0.045em] font-black">
          ¡Pedido confirmado!
        </h1>

        <p className="mt-5 text-[13px] leading-6 text-[var(--visual-page-color)]/50">
          Tu número de orden es{' '}
          <strong className="text-white">{orderNumber}</strong>
        </p>

        <p className="mt-1 text-[12px] text-[var(--visual-page-color)]/40">
          Pedido registrado para{' '}
          <strong className="text-white/75">{email}</strong>
        </p>

        <div data-page-panel className="mt-9 rounded-[16px] bg-[var(--visual-page-panel-background)] p-6 md:p-8 text-left text-[var(--visual-page-color)]">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">
            Próximos pasos
          </p>

          <h2 className="mt-2 text-[28px] font-black tracking-[-0.03em]">
            ¿Qué sigue?
          </h2>

          <div className="mt-7 grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              ['1', 'Pedido registrado', 'Tu pedido quedó registrado con estado pendiente.'],
              ['2', 'Pago pendiente', 'El registro del pedido no confirma su pago.'],
              ['3', 'Sigue tu pedido', 'Puedes consultar el estado desde Seguimiento.'],
            ].map(([number, title, description]) => (
              <div key={number}>
                <span className="w-8 h-8 rounded-full bg-[var(--primary)] text-[var(--visual-page-color)] flex items-center justify-center text-[11px] font-black">
                  {number}
                </span>
                <p className="mt-4 text-[12px] font-black">{title}</p>
                <p className="mt-2 text-[10px] leading-5 text-[var(--visual-page-color)]/50">{description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link data-page-action="primary"
            to={trackingRoute}
            state={{ email: state.email ?? '' }}
            className="h-12 rounded-[9px] bg-[var(--primary)] text-[var(--visual-page-color)] text-[12px] font-bold flex items-center justify-center hover:bg-[var(--primary)] transition-colors"
          >
            Ver mi pedido
          </Link>

          <Link data-page-action="outline"
            to={route('catalogo')}
            className="h-12 rounded-[9px] bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)] text-[12px] font-bold flex items-center justify-center hover:bg-[var(--visual-page-panel-background)] transition-colors"
          >
            Seguir comprando
          </Link>
        </div>
      </div>
    );
  }

  if (isVisual) {
    return (
      <div className="bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)]">
        <div className="max-w-[900px] mx-auto px-5 md:px-8 py-14 md:py-20">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)] flex items-center justify-center mb-7">
              <Icon
                name="check"
                className="w-7 h-7"
              />
            </div>

            <p className="mb-3 text-[9px] font-medium uppercase tracking-[0.18em] text-[var(--visual-page-color)]">
              Compra completada
            </p>

            <h1 className="font-serif text-[42px] md:text-[52px] leading-none tracking-[-0.025em]">
              ¡Pedido confirmado!
            </h1>

            <p className="mt-5 max-w-lg text-[14px] leading-6 text-[var(--visual-page-color)]">
              Tu pedido fue registrado correctamente.
              Guarda tu número de orden para consultar
              su estado cuando quieras.
            </p>

            <div data-page-panel className="mt-9 w-full max-w-lg rounded-[10px] bg-[var(--visual-page-panel-background)] px-6 py-6">
              <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-[var(--visual-page-color)]">
                Número de orden
              </p>

              <p className="mt-3 font-serif text-[24px] md:text-[28px] leading-tight break-all">
                {orderNumber}
              </p>

              <div className="border-t border-[var(--visual-global-border)]/10 my-5" />

              <p className="text-[11px] text-[var(--visual-page-color)]">
                Pedido registrado para
              </p>

              <p className="mt-1 text-[13px] font-medium">
                {email}
              </p>
            </div>

            <div data-page-panel className="mt-5 w-full rounded-[10px] bg-[var(--visual-page-panel-background)] p-6 md:p-8 text-left">
              <p className="mb-2 text-[9px] font-medium uppercase tracking-[0.18em] text-[var(--visual-page-color)]">
                Próximos pasos
              </p>

              <h2 className="font-serif text-[28px] leading-none mb-7">
                ¿Qué sigue?
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <span className="w-8 h-8 rounded-full bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)] flex items-center justify-center text-[11px] font-semibold mb-4">
                    1
                  </span>

                  <p className="text-[13px] font-semibold">
                    Pedido registrado
                  </p>

                  <p className="mt-2 text-[11px] leading-5 text-[var(--visual-page-color)]">
                    Tu pedido quedó
                    registrado con estado pendiente.
                  </p>
                </div>

                <div>
                  <span className="w-8 h-8 rounded-full bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)] flex items-center justify-center text-[11px] font-semibold mb-4">
                    2
                  </span>

                  <p className="text-[13px] font-semibold">
                    Pago pendiente
                  </p>

                  <p className="mt-2 text-[11px] leading-5 text-[var(--visual-page-color)]">
                    El registro del pedido no realiza
                    cobros ni envía correos.
                  </p>
                </div>

                <div>
                  <span className="w-8 h-8 rounded-full bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)] flex items-center justify-center text-[11px] font-semibold mb-4">
                    3
                  </span>

                  <p className="text-[13px] font-semibold">
                    Sigue tu pedido
                  </p>

                  <p className="mt-2 text-[11px] leading-5 text-[var(--visual-page-color)]">
                    Puedes consultar el estado de tu
                    pedido desde Seguimiento.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg mt-6">
              <Link data-page-action="primary"
                to={trackingRoute}
                state={{ email: state.email ?? '' }}
                className="h-12 rounded-[8px] bg-[var(--visual-page-panel-background)] text-[var(--visual-page-color)] text-[12px] font-semibold flex items-center justify-center hover:opacity-80 transition-opacity"
              >
                Ver mi pedido
              </Link>

              <Link data-page-action="primary"
                to={route('catalogo')}
                className="h-12 rounded-[8px] bg-[var(--visual-page-panel-background)] border border-[var(--visual-global-border)] text-[var(--visual-page-color)] text-[12px] font-semibold flex items-center justify-center hover:bg-[var(--visual-page-panel-background)] hover:text-[var(--visual-page-color)] transition-colors"
              >
                Seguir comprando
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /*
   * ==========================================================
   * PLANTILLA 2 — MINIMAL
   * ==========================================================
   */
  if (isMinimal) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-16 md:py-20">
        <div className="flex flex-col items-center text-center">

          <div className="w-20 h-20 rounded-full bg-[var(--primary)] text-[var(--visual-page-color)] flex items-center justify-center mb-7">
            <Icon
              name="check"
              className="w-8 h-8"
            />
          </div>

          <p className="text-xs text-[var(--visual-page-color)] mb-2">
            Compra completada
          </p>

          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-[var(--visual-page-color)]">
            ¡Pedido confirmado!
          </h1>

          <p className="text-sm md:text-base text-[var(--visual-page-color)] mt-3 max-w-md">
            Tu pedido fue registrado correctamente.
            Guarda tu número de orden para poder
            consultar su estado.
          </p>

          <div data-page-panel className="mt-8 bg-[var(--visual-page-panel-background)] border border-[var(--visual-global-border)]/5 rounded-[22px] px-7 py-5 w-full max-w-md">
            <p className="text-xs text-[var(--visual-page-color)] mb-2">
              Número de orden
            </p>

            <p className="text-lg md:text-xl font-semibold tracking-tight text-[var(--primary)] break-all">
              {orderNumber}
            </p>

            <div className="border-t border-[var(--visual-global-border)]/5 my-4" />

            <p className="text-xs text-[var(--visual-page-color)]">
              Pedido registrado para
            </p>

            <p className="text-sm font-medium mt-1">
              {email}
            </p>
          </div>

          <div data-page-panel className="bg-[var(--visual-page-panel-background)] border border-[var(--visual-global-border)]/5 rounded-[24px] p-6 md:p-7 w-full mt-5 text-left">
            <p className="text-lg font-semibold tracking-tight mb-5">
              ¿Qué sigue?
            </p>

            <div className="flex flex-col gap-5">
              <div className="flex gap-4">
                <span className="w-8 h-8 rounded-full bg-[var(--visual-page-panel-background)] text-[var(--primary)] flex items-center justify-center flex-shrink-0 text-xs font-semibold">
                  1
                </span>

                <div>
                  <p className="text-sm font-medium text-[var(--visual-page-color)]">
                    Pedido registrado
                  </p>

                  <p className="text-xs text-[var(--visual-page-color)] mt-1 leading-relaxed">
                    Tu pedido quedó
                    registrado con estado pendiente.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <span className="w-8 h-8 rounded-full bg-[var(--visual-page-panel-background)] text-[var(--primary)] flex items-center justify-center flex-shrink-0 text-xs font-semibold">
                  2
                </span>

                <div>
                  <p className="text-sm font-medium text-[var(--visual-page-color)]">
                    Pago pendiente
                  </p>

                  <p className="text-xs text-[var(--visual-page-color)] mt-1 leading-relaxed">
                    El registro del pedido no realiza
                    cobros ni envía correos.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <span className="w-8 h-8 rounded-full bg-[var(--visual-page-panel-background)] text-[var(--primary)] flex items-center justify-center flex-shrink-0 text-xs font-semibold">
                  3
                </span>

                <div>
                  <p className="text-sm font-medium text-[var(--visual-page-color)]">
                    Sigue tu pedido
                  </p>

                  <p className="text-xs text-[var(--visual-page-color)] mt-1 leading-relaxed">
                    Puedes consultar el estado de tu pedido
                    desde la sección Seguimiento.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mt-6">
            <Link data-page-action="primary"
              to={trackingRoute}
              state={{ email: state.email ?? '' }}
              className="h-12 rounded-full bg-[var(--primary)] text-[var(--visual-page-color)] text-sm font-semibold flex items-center justify-center hover:bg-[var(--primary)] transition-colors"
            >
              Ver mi pedido
            </Link>

            <Link data-page-action="outline"
              to={route('catalogo')}
              className="h-12 rounded-full bg-[var(--visual-page-panel-background)] border border-[var(--visual-global-border)]/10 text-[var(--primary)] text-sm font-semibold flex items-center justify-center hover:bg-[var(--visual-page-panel-background)] transition-colors"
            >
              Seguir comprando
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /*
   * ==========================================================
   * PLANTILLA 1 — EDITORIAL
   * ==========================================================
   */
  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center flex flex-col items-center gap-6">

      <div className="w-20 h-20 rounded-full bg-[var(--success-bg)] flex items-center justify-center text-[var(--success)]">
        <Icon
          name="check"
          className="w-9 h-9"
        />
      </div>

      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
          ¡Pedido confirmado!
        </h1>

        <p className="text-[var(--muted-foreground)]">
          Tu número de orden es{' '}
          <strong className="text-[var(--foreground)]">
            {orderNumber}
          </strong>
        </p>

        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Pedido registrado para{' '}
          <strong>{email}</strong>
        </p>
      </div>

      <div data-page-panel className="bg-[var(--visual-page-panel-background)] border border-[var(--border)] rounded-2xl p-6 w-full text-sm">
        <p className="font-semibold mb-3">
          ¿Qué sigue?
        </p>

        <div className="flex flex-col gap-3 text-left text-[var(--muted-foreground)]">
          <div className="flex gap-3">
            <span className="text-[var(--primary)]">
              1.
            </span>

            <span>
              Tu pedido quedó registrado
              con estado pendiente.
            </span>
          </div>

          <div className="flex gap-3">
            <span className="text-[var(--primary)]">
              2.
            </span>

            <span>
              El registro del pedido no realiza cobros ni
              envía correos.
            </span>
          </div>

          <div className="flex gap-3">
            <span className="text-[var(--primary)]">
              3.
            </span>

            <span>
              Puedes consultar el estado de tu pedido
              desde la sección Seguimiento.
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 w-full">
        <Link data-page-action="ghost"
          to={trackingRoute}
          state={{ email: state.email ?? '' }}
          className="flex-1"
        >
          <Button
            variant="primary"
            fullWidth
          >
            Ver mi pedido
          </Button>
        </Link>

        <Link data-page-action="ghost"
          to={route('catalogo')}
          className="flex-1"
        >
          <Button
            variant="outline"
            fullWidth
          >
            Seguir comprando
          </Button>
        </Link>
      </div>
    </div>
  );
}
