import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '../components/ui';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';
import { formatPrice } from '../data/mockData';
import { transbankPaymentService } from '../../checkout/services/transbankPaymentService';

interface Props {
  orderNumber: string;
  tokenWs: string;
  tbkToken: string;
  tiendaId: number;
}

type Result =
  | { status: 'loading' }
  | { status: 'approved'; data: Record<string, any> }
  | { status: 'rejected'; message: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

// Webpay solo permite confirmar un token una vez. Guardamos el resultado
// para que recargar la página no repita la confirmación (y falle).
const cacheKey = (token: string) => `tbk-result:${token}`;
const PENDING_CART_SNAPSHOT_KEY = 'openmind-pending-payment-cart';
const RESTORE_CART_FLAG_KEY = 'openmind-restore-cart';

function triggerCartRestore() {
  try {
    sessionStorage.setItem(RESTORE_CART_FLAG_KEY, '1');
    if (typeof window !== 'undefined' && typeof Event !== 'undefined') {
      window.dispatchEvent(new Event('openmind_restore_cart'));
    }
  } catch {}
}

export default function TransbankReturnResult({
  orderNumber,
  tokenWs,
  tbkToken,
  tiendaId,
}: Props) {
  const { route } = useStorefrontTemplate();
  const started = useRef(false);
  const [result, setResult] = useState<Result>({ status: 'loading' });
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // Sin token_ws pero con TBK_TOKEN: el cliente abandonó o expiró el pago.
    if (!tokenWs) {
      if (tbkToken) {
        const abortKey = `tbk-abort:${tbkToken}`;
        try {
          if (!sessionStorage.getItem(abortKey)) {
            sessionStorage.setItem(abortKey, '1');
            transbankPaymentService.pagoAbortado(tiendaId, tbkToken).catch(() => undefined);
          }
        } catch {
          transbankPaymentService.pagoAbortado(tiendaId, tbkToken).catch(() => undefined);
        }
        triggerCartRestore();
        setResult({ status: 'cancelled' });
      } else {
        setResult({ status: 'error', message: 'No recibimos la información del pago.' });
      }
      return;
    }

    try {
      const cached = sessionStorage.getItem(cacheKey(tokenWs));
      if (cached) {
        const parsed = JSON.parse(cached) as Result;
        if (parsed.status === 'rejected' || parsed.status === 'cancelled') {
          triggerCartRestore();
        }
        setResult(parsed);
        return;
      }
    } catch {
      // Sin caché disponible: se confirma normalmente.
    }

    transbankPaymentService
      .confirmarPago(tiendaId, tokenWs)
      .then((res) => {
        let next: Result;
        if (res?.exito) {
          next = { status: 'approved', data: res.data ?? {} };
          try {
            sessionStorage.setItem(PENDING_CART_SNAPSHOT_KEY, '');
            sessionStorage.setItem(RESTORE_CART_FLAG_KEY, '');
          } catch {}
        } else if (res?.error?.codigo === 'PAGO_RECHAZADO') {
          next = { status: 'rejected', message: res.mensaje || 'El pago fue rechazado.' };
          triggerCartRestore();
        } else {
          next = { status: 'error', message: res?.mensaje || 'No pudimos confirmar tu pago.' };
        }

        if (next.status === 'approved' || next.status === 'rejected') {
          try {
            sessionStorage.setItem(cacheKey(tokenWs), JSON.stringify(next));
          } catch {
            // Sin caché disponible.
          }
        }
        setResult(next);
      })
      .catch(() =>
        setResult({
          status: 'error',
          message: 'No se pudo conectar con el servidor para confirmar el pago.',
        }),
      );
  }, [tokenWs, tbkToken, tiendaId]);

  const approvedData = result.status === 'approved' ? result.data : {};
  const orderLabel =
    orderNumber || (approvedData.orden_compra ? String(approvedData.orden_compra) : '');
  let identificador = '';
  let email = '';
  let monto = 0;
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(`order-tracking:${orderLabel}`) ?? 'null');
    if (stored && typeof stored === 'object') {
      if ('identificador' in stored && typeof stored.identificador === 'string') identificador = stored.identificador.trim();
      if ('email' in stored && typeof stored.email === 'string') email = stored.email;
      if ('monto' in stored && typeof stored.monto === 'number') monto = stored.monto;
    }
  } catch {
    // El retorno puede abrirse sin la sesión original: queda la búsqueda manual.
  }
  const trackingRoute = identificador
    ? `${route('seguimiento')}?orden=${encodeURIComponent(identificador)}`
    : route('seguimiento');

  const canRetry = (result.status === 'rejected' || result.status === 'cancelled') && Boolean(orderLabel && email && monto > 0);
  const retryPayment = async () => {
    if (retrying || !canRetry) return;
    setRetrying(true);
    setRetryError('');
    try {
      const returnUrl = `${window.location.origin}${route('pedido-confirmado')}?orderNumber=${encodeURIComponent(orderLabel)}&tienda=${tiendaId}`;
      const res = await transbankPaymentService.iniciarPago(tiendaId, orderLabel, monto, returnUrl, email);
      if (!res?.exito || !res.data?.url || !res.data?.token) {
        throw new Error(res?.mensaje || 'No pudimos iniciar el pago. Intenta nuevamente.');
      }
      transbankPaymentService.redirigirAWebpay(res.data.url, res.data.token);
    } catch (cause) {
      setRetryError(cause instanceof Error ? cause.message : 'No pudimos iniciar el pago. Intenta nuevamente.');
      setRetrying(false);
    }
  };

  const view = {
    loading: { glyph: '…', tone: 'bg-gray-100 text-gray-600', title: 'Confirmando tu pago…' },
    approved: { glyph: '✓', tone: 'bg-[var(--success-bg)] text-[var(--success)]', title: '¡Pago aprobado!' },
    rejected: { glyph: '✕', tone: 'bg-red-50 text-red-600', title: 'Pago rechazado' },
    cancelled: { glyph: '↩', tone: 'bg-amber-50 text-amber-600', title: 'Pago cancelado · Tu carrito sigue disponible' },
    error: { glyph: '!', tone: 'bg-red-50 text-red-600', title: 'No pudimos confirmar tu pago' },
  }[result.status];

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-12 text-center flex flex-col items-center gap-6">
      <div
        className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold ${view.tone}`}
        aria-hidden="true"
      >
        {view.glyph}
      </div>

      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">{view.title}</h1>

        {result.status === 'loading' && (
          <p className="text-[var(--muted-foreground)]">
            Estamos verificando el resultado con Webpay. No cierres esta página.
          </p>
        )}

        {result.status === 'approved' && (
          <p className="text-[var(--muted-foreground)]">
            Tu pedido{orderLabel ? ` ${orderLabel}` : ''} quedó pagado.
          </p>
        )}

        {result.status === 'rejected' && (
          <p className="text-[var(--muted-foreground)]">
            {result.message} Tus productos fueron conservados en el carrito para que puedas volver a intentarlo o elegir otro medio de pago.
          </p>
        )}

        {result.status === 'cancelled' && (
          <p className="text-[var(--muted-foreground)]">
            Cancelaste el proceso en Webpay y no se realizó ningún cobro. Tus productos siguen en tu carrito para que puedas revisar tu compra o elegir otro método de pago{orderLabel ? ` (pedido ${orderLabel} pendiente)` : ''}.
          </p>
        )}

        {result.status === 'error' && (
          <p className="text-[var(--muted-foreground)]">{result.message}</p>
        )}
      </div>

      {result.status === 'approved' && (
        <div data-page-panel className="bg-[var(--visual-page-panel-background)] border border-[var(--border)] rounded-2xl p-6 w-full text-sm text-left">
          <dl className="flex flex-col gap-3">
            {orderLabel && (
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">Pedido</dt>
                <dd className="font-semibold break-all">{orderLabel}</dd>
              </div>
            )}
            {approvedData.monto != null && (
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">Monto pagado</dt>
                <dd className="font-semibold">{formatPrice(Number(approvedData.monto))}</dd>
              </div>
            )}
            {approvedData.codigo_autorizacion && (
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">Código de autorización</dt>
                <dd className="font-semibold">{String(approvedData.codigo_autorizacion)}</dd>
              </div>
            )}
            {approvedData.ultimos_4_digitos && (
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--muted-foreground)]">Tarjeta</dt>
                <dd className="font-semibold">•••• {String(approvedData.ultimos_4_digitos)}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {retryError && <p role="alert" className="text-sm text-red-600">{retryError}</p>}

      {result.status !== 'loading' && (
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 w-full">
          {result.status === 'approved' ? (
            <>
              <Link data-page-action="ghost"
                to={trackingRoute}
                state={{ email }}
                className="flex-1"
              >
                <Button variant="primary" fullWidth>
                  Ver mi pedido
                </Button>
              </Link>

              <Link data-page-action="ghost" to={route('catalogo')} className="flex-1">
                <Button variant="outline" fullWidth>
                  Seguir comprando
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link
                data-page-action="ghost"
                to={route('carrito')}
                className="flex-1"
              >
                <Button variant="primary" fullWidth>
                  Volver al carrito
                </Button>
              </Link>

              <Link
                data-page-action="ghost"
                to={orderLabel ? `${route('compra')}?orderNumber=${encodeURIComponent(orderLabel)}` : route('compra')}
                state={orderLabel ? { orderNumber: orderLabel } : undefined}
                className="flex-1"
              >
                <Button variant="outline" fullWidth>
                  Volver al checkout
                </Button>
              </Link>

              {canRetry && (
                <Button variant="outline" fullWidth className="flex-1" onClick={retryPayment} disabled={retrying}>
                  {retrying ? 'Redirigiendo a Webpay…' : 'Reintentar pago'}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}