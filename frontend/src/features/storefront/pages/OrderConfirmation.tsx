import {
  Link,
  Navigate,
  useLocation,
} from 'react-router-dom';

import { Button, Icon } from '../components/ui';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';

interface ConfirmationState {
  orderNumber?: string;
  email?: string;
}

export default function OrderConfirmation() {
  const location = useLocation();

  const { route, isMinimal, isVisual, isCatalog } =
    useStorefrontTemplate();

  const state =
    location.state as ConfirmationState | null;

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

  /*
   * ==========================================================
   * PLANTILLA 3 — VELTA
   * ==========================================================
   */
  if (isCatalog) {
    return (
      <div className="max-w-[760px] mx-auto px-5 py-16 md:py-20 text-center text-white">
        <div className="mx-auto w-16 h-16 rounded-full bg-[#1683ff] flex items-center justify-center">
          <span className="text-2xl font-black" aria-hidden="true">✓</span>
        </div>

        <p className="mt-7 text-[#ff5a1f] text-[10px] font-black uppercase tracking-[0.16em]">
          Compra registrada
        </p>

        <h1 className="mt-3 text-[42px] md:text-[54px] leading-[0.96] tracking-[-0.045em] font-black">
          ¡Pedido confirmado!
        </h1>

        <p className="mt-5 text-[13px] leading-6 text-white/50">
          Tu número de orden es{' '}
          <strong className="text-white">{orderNumber}</strong>
        </p>

        <p className="mt-1 text-[12px] text-white/40">
          Pedido de ejemplo para{' '}
          <strong className="text-white/75">{email}</strong>
        </p>

        <div className="mt-9 rounded-[16px] bg-[#f5f5f3] p-6 md:p-8 text-left text-[#151515]">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#e04b1a]">
            Próximos pasos
          </p>

          <h2 className="mt-2 text-[28px] font-black tracking-[-0.03em]">
            ¿Qué sigue?
          </h2>

          <div className="mt-7 grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              ['1', 'Pedido registrado', 'Tu pedido de ejemplo quedó registrado durante esta sesión.'],
              ['2', 'Demostración', 'Esta demostración no realiza cobros ni envía correos.'],
              ['3', 'Sigue tu pedido', 'Puedes consultar el estado de tu pedido desde Seguimiento.'],
            ].map(([number, title, description]) => (
              <div key={number}>
                <span className="w-8 h-8 rounded-full bg-[#1683ff] text-white flex items-center justify-center text-[11px] font-black">
                  {number}
                </span>
                <p className="mt-4 text-[12px] font-black">{title}</p>
                <p className="mt-2 text-[10px] leading-5 text-black/50">{description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            to={route('seguimiento')}
            state={{ orderNumber, email }}
            className="h-12 rounded-[9px] bg-[#1683ff] text-white text-[12px] font-bold flex items-center justify-center hover:bg-[#3194f5] transition-colors"
          >
            Rastrear pedido
          </Link>

          <Link
            to={route('catalogo')}
            className="h-12 rounded-[9px] bg-white text-black text-[12px] font-bold flex items-center justify-center hover:bg-[#f0f0ee] transition-colors"
          >
            Seguir comprando
          </Link>
        </div>
      </div>
    );
  }

  if (isVisual) {
    return (
      <div className="bg-white text-[#111111]">
        <div className="max-w-[900px] mx-auto px-5 md:px-8 py-14 md:py-20">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-black text-white flex items-center justify-center mb-7">
              <Icon
                name="check"
                className="w-7 h-7"
              />
            </div>

            <p className="mb-3 text-[9px] font-medium uppercase tracking-[0.18em] text-[#77716e]">
              Compra completada
            </p>

            <h1 className="font-serif text-[42px] md:text-[52px] leading-none tracking-[-0.025em]">
              ¡Pedido confirmado!
            </h1>

            <p className="mt-5 max-w-lg text-[14px] leading-6 text-[#77716e]">
              Tu pedido fue registrado correctamente.
              Guarda tu número de orden para consultar
              su estado cuando quieras.
            </p>

            <div className="mt-9 w-full max-w-lg rounded-[10px] bg-[#f1f1f0] px-6 py-6">
              <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-[#77716e]">
                Número de orden
              </p>

              <p className="mt-3 font-serif text-[24px] md:text-[28px] leading-tight break-all">
                {orderNumber}
              </p>

              <div className="border-t border-black/10 my-5" />

              <p className="text-[11px] text-[#77716e]">
                Pedido de ejemplo para
              </p>

              <p className="mt-1 text-[13px] font-medium">
                {email}
              </p>
            </div>

            <div className="mt-5 w-full rounded-[10px] bg-[#f1f1f0] p-6 md:p-8 text-left">
              <p className="mb-2 text-[9px] font-medium uppercase tracking-[0.18em] text-[#77716e]">
                Próximos pasos
              </p>

              <h2 className="font-serif text-[28px] leading-none mb-7">
                ¿Qué sigue?
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <span className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-[11px] font-semibold mb-4">
                    1
                  </span>

                  <p className="text-[13px] font-semibold">
                    Pedido registrado
                  </p>

                  <p className="mt-2 text-[11px] leading-5 text-[#77716e]">
                    Tu pedido de ejemplo quedó
                    registrado durante esta sesión.
                  </p>
                </div>

                <div>
                  <span className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-[11px] font-semibold mb-4">
                    2
                  </span>

                  <p className="text-[13px] font-semibold">
                    Demostración
                  </p>

                  <p className="mt-2 text-[11px] leading-5 text-[#77716e]">
                    Esta demostración no realiza
                    cobros ni envía correos.
                  </p>
                </div>

                <div>
                  <span className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-[11px] font-semibold mb-4">
                    3
                  </span>

                  <p className="text-[13px] font-semibold">
                    Sigue tu pedido
                  </p>

                  <p className="mt-2 text-[11px] leading-5 text-[#77716e]">
                    Puedes consultar el estado de tu
                    pedido desde Seguimiento.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg mt-6">
              <Link
                to={route('seguimiento')}
                state={{
                  orderNumber,
                  email,
                }}
                className="h-12 rounded-[8px] bg-black text-white text-[12px] font-semibold flex items-center justify-center hover:opacity-80 transition-opacity"
              >
                Rastrear pedido →
              </Link>

              <Link
                to={route('catalogo')}
                className="h-12 rounded-[8px] bg-white border border-black text-black text-[12px] font-semibold flex items-center justify-center hover:bg-black hover:text-white transition-colors"
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

          <div className="w-20 h-20 rounded-full bg-[#17213b] text-white flex items-center justify-center mb-7">
            <Icon
              name="check"
              className="w-8 h-8"
            />
          </div>

          <p className="text-xs text-gray-400 mb-2">
            Compra completada
          </p>

          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-[#171717]">
            ¡Pedido confirmado!
          </h1>

          <p className="text-sm md:text-base text-gray-500 mt-3 max-w-md">
            Tu pedido fue registrado correctamente.
            Guarda tu número de orden para poder
            consultar su estado.
          </p>

          <div className="mt-8 bg-white border border-black/5 rounded-[22px] px-7 py-5 w-full max-w-md">
            <p className="text-xs text-gray-400 mb-2">
              Número de orden
            </p>

            <p className="text-lg md:text-xl font-semibold tracking-tight text-[#17213b] break-all">
              {orderNumber}
            </p>

            <div className="border-t border-black/5 my-4" />

            <p className="text-xs text-gray-400">
              Pedido de ejemplo para
            </p>

            <p className="text-sm font-medium mt-1">
              {email}
            </p>
          </div>

          <div className="bg-white border border-black/5 rounded-[24px] p-6 md:p-7 w-full mt-5 text-left">
            <p className="text-lg font-semibold tracking-tight mb-5">
              ¿Qué sigue?
            </p>

            <div className="flex flex-col gap-5">
              <div className="flex gap-4">
                <span className="w-8 h-8 rounded-full bg-[#f1f2f5] text-[#17213b] flex items-center justify-center flex-shrink-0 text-xs font-semibold">
                  1
                </span>

                <div>
                  <p className="text-sm font-medium text-[#171717]">
                    Pedido registrado
                  </p>

                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    Tu pedido de ejemplo quedó
                    registrado durante esta sesión.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <span className="w-8 h-8 rounded-full bg-[#f1f2f5] text-[#17213b] flex items-center justify-center flex-shrink-0 text-xs font-semibold">
                  2
                </span>

                <div>
                  <p className="text-sm font-medium text-[#171717]">
                    Demostración
                  </p>

                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    Esta demostración no realiza
                    cobros ni envía correos.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <span className="w-8 h-8 rounded-full bg-[#f1f2f5] text-[#17213b] flex items-center justify-center flex-shrink-0 text-xs font-semibold">
                  3
                </span>

                <div>
                  <p className="text-sm font-medium text-[#171717]">
                    Sigue tu pedido
                  </p>

                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    Puedes consultar el estado de tu pedido
                    desde la sección Seguimiento.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mt-6">
            <Link
              to={route('seguimiento')}
              state={{
                orderNumber,
                email,
              }}
              className="h-12 rounded-full bg-[#17213b] text-white text-sm font-semibold flex items-center justify-center hover:bg-[#0f2a56] transition-colors"
            >
              Rastrear pedido
            </Link>

            <Link
              to={route('catalogo')}
              className="h-12 rounded-full bg-white border border-black/10 text-[#17213b] text-sm font-semibold flex items-center justify-center hover:bg-gray-50 transition-colors"
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
          Pedido de ejemplo para{' '}
          <strong>{email}</strong>
        </p>
      </div>

      <div className="bg-white border border-[var(--border)] rounded-2xl p-6 w-full text-sm">
        <p className="font-semibold mb-3">
          ¿Qué sigue?
        </p>

        <div className="flex flex-col gap-3 text-left text-[var(--muted-foreground)]">
          <div className="flex gap-3">
            <span className="text-[var(--primary)]">
              1.
            </span>

            <span>
              Tu pedido de ejemplo quedó registrado
              durante esta sesión.
            </span>
          </div>

          <div className="flex gap-3">
            <span className="text-[var(--primary)]">
              2.
            </span>

            <span>
              Esta demostración no realiza cobros ni
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
        <Link
          to={route('seguimiento')}
          state={{
            orderNumber,
            email,
          }}
          className="flex-1"
        >
          <Button
            variant="primary"
            fullWidth
          >
            Rastrear pedido
          </Button>
        </Link>

        <Link
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
