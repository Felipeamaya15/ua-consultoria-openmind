import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '../components/ui';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';
import { mercadoPagoPaymentService } from '../../checkout/services/mercadoPagoPaymentService';
import { paypalPaymentService } from '../../checkout/services/paypalPaymentService';

interface Props {
  gateway: 'paypal' | 'mercadopago';
  orderNumber: string;
  tiendaId: number;
  // PayPal: id de la orden (?token=). Mercado Pago: id del pago (?payment_id=).
  reference: string;
}

type Result =
  | { status: 'loading' }
  | { status: 'approved'; usd?: string; tipoCambio?: string }
  | { status: 'rejected'; message: string }
  | { status: 'pending'; message: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

const NAMES = { paypal: 'PayPal', mercadopago: 'Mercado Pago' } as const;

// La captura/consulta solo se hace una vez por pago; el resultado se guarda para que recargar no la repita.
const cacheKey = (gateway: string, reference: string) => `${gateway}-result:${reference}`;
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

export default function ExternalPaymentReturnResult({ gateway, orderNumber, tiendaId, reference }: Props) {
  const { route } = useStorefrontTemplate();
  const started = useRef(false);
  const [result, setResult] = useState<Result>({ status: 'loading' });
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');
  const name = NAMES[gateway];

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // Sin referencia el comprador volvió sin pagar (cancelado o fallo en la pasarela).
    if (!reference) {
      triggerCartRestore();
      setResult({ status: 'cancelled' });
      return;
    }
    try {
      const cached = sessionStorage.getItem(cacheKey(gateway, reference));
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

    const request = gateway === 'paypal'
      ? paypalPaymentService.capturarPago(tiendaId, orderNumber, reference)
      : mercadoPagoPaymentService.confirmarPago(tiendaId, orderNumber, reference);

    request
      .then((res) => {
        const code = res?.error?.codigo;
        let next: Result;
        if (res?.exito) {
          next = { status: 'approved', usd: res.data?.monto_usd ?? undefined, tipoCambio: res.data?.tipo_cambio ?? undefined };
          try {
            sessionStorage.setItem(PENDING_CART_SNAPSHOT_KEY, '');
            sessionStorage.setItem(RESTORE_CART_FLAG_KEY, '');
          } catch {}
        } else if (code === 'PAGO_RECHAZADO') {
          next = { status: 'rejected', message: res.mensaje || `${name} rechazó el pago.` };
          triggerCartRestore();
        } else if (code === 'PAGO_PENDIENTE') {
          next = { status: 'pending', message: res.mensaje || `El pago sigue pendiente en ${name}.` };
        } else {
          next = { status: 'error', message: res?.mensaje || 'No pudimos confirmar tu pago.' };
        }
        if (next.status === 'approved' || next.status === 'rejected') {
          try { sessionStorage.setItem(cacheKey(gateway, reference), JSON.stringify(next)); } catch { /* Sin caché. */ }
        }
        setResult(next);
      })
      .catch(() => setResult({ status: 'error', message: 'No se pudo conectar con el servidor para confirmar el pago.' }));
  }, [gateway, orderNumber, reference, tiendaId, name]);

  let identificador = '';
  let email = '';
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(`order-tracking:${orderNumber}`) ?? 'null');
    if (stored && typeof stored === 'object') {
      if ('identificador' in stored && typeof stored.identificador === 'string') identificador = stored.identificador.trim();
      if ('email' in stored && typeof stored.email === 'string') email = stored.email;
    }
  } catch {
    // El retorno puede abrirse sin la sesión original: queda la búsqueda manual.
  }
  const trackingRoute = identificador
    ? `${route('seguimiento')}?orden=${encodeURIComponent(identificador)}`
    : route('seguimiento');

  const view = {
    loading: { glyph: '…', tone: 'bg-gray-100 text-gray-600', title: 'Confirmando tu pago…' },
    approved: { glyph: '✓', tone: 'bg-[var(--success-bg)] text-[var(--success)]', title: '¡Pago aprobado!' },
    rejected: { glyph: '✕', tone: 'bg-red-50 text-red-600', title: 'Pago rechazado' },
    pending: { glyph: '…', tone: 'bg-amber-50 text-amber-600', title: 'Pago pendiente' },
    cancelled: { glyph: '↩', tone: 'bg-amber-50 text-amber-600', title: 'Pago cancelado · Tu carrito sigue disponible' },
    error: { glyph: '!', tone: 'bg-red-50 text-red-600', title: 'No pudimos confirmar tu pago' },
  }[result.status];

  // Un pago rechazado o cancelado deja el pedido pendiente: se vuelve a pagar ese mismo pedido (sin duplicarlo).
  const canRetry = (result.status === 'rejected' || result.status === 'cancelled') && Boolean(orderNumber);
  const retryPayment = async () => {
    if (retrying || !canRetry) return;
    setRetrying(true);
    setRetryError('');
    try {
      const returnUrl = `${window.location.origin}${route('pedido-confirmado')}?orderNumber=${encodeURIComponent(orderNumber)}&tienda=${tiendaId}&gateway=${gateway}`;
      const res = gateway === 'paypal'
        ? await paypalPaymentService.iniciarPago(tiendaId, orderNumber, 0, returnUrl, `${returnUrl}&cancelado=1`)
        : await mercadoPagoPaymentService.iniciarPago(tiendaId, orderNumber, returnUrl);
      const destino = gateway === 'paypal' ? res?.data?.approve_url : res?.data?.url;
      if (!res?.exito || !destino) throw new Error(res?.mensaje || `No pudimos conectar con ${name}. Intenta nuevamente.`);
      window.location.href = destino;
    } catch (cause) {
      setRetryError(cause instanceof Error ? cause.message : `No pudimos conectar con ${name}. Intenta nuevamente.`);
      setRetrying(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-12 text-center flex flex-col items-center gap-6">
      <div className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold ${view.tone}`} aria-hidden="true">
        {view.glyph}
      </div>
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">{view.title}</h1>
        <p className="text-[var(--muted-foreground)]">
          {result.status === 'loading' && `Estamos verificando el resultado con ${name}. No cierres esta página.`}
          {result.status === 'approved' && `Tu pedido${orderNumber ? ` ${orderNumber}` : ''} quedó pagado.${result.usd ? ` Se cobró US$ ${result.usd} (tipo de cambio $${Number(result.tipoCambio).toLocaleString('es-CL', {maximumFractionDigits: 2})} por US$ 1).` : ''}`}
          {result.status === 'rejected' && `${result.message} Tus productos fueron conservados en el carrito para que puedas volver a intentarlo.`}
          {result.status === 'pending' && `${result.message} Te avisaremos cuando se confirme.`}
          {result.status === 'cancelled' && `Cancelaste el pago en ${name} y no se realizó ningún cobro. Tus productos siguen en tu carrito para que puedas retomar tu compra.`}
          {result.status === 'error' && result.message}
        </p>
      </div>
      {retryError && <p role="alert" className="text-sm text-red-600">{retryError}</p>}

      {result.status !== 'loading' && (
        <div className="flex flex-col sm:flex-row flex-wrap gap-3.5 w-full mt-2">
          {result.status === 'approved' || result.status === 'pending' ? (
            <>
              <Link
                data-page-action="primary"
                to={trackingRoute}
                state={{ email }}
                className="flex-1 min-h-[48px] px-6 py-3 rounded-xl bg-[var(--primary)] text-[var(--on-primary)] text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm transition-all hover:brightness-95"
              >
                Ver mi pedido
              </Link>
              <Link
                data-page-action="outline"
                to={route('catalogo')}
                className="flex-1 min-h-[48px] px-6 py-3 rounded-xl border border-[var(--border)] bg-[var(--visual-page-field-background,white)] text-[var(--foreground)] text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm transition-all hover:bg-[var(--muted)]"
              >
                Seguir comprando
              </Link>
            </>
          ) : (
            <>
              <Link
                data-page-action="primary"
                to={route('carrito')}
                className="flex-1 min-h-[48px] px-6 py-3 rounded-xl bg-[var(--primary)] text-[var(--on-primary)] text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm transition-all hover:brightness-95"
              >
                Volver al carrito
              </Link>
              <Link
                data-page-action="outline"
                to={route('compra')}
                className="flex-1 min-h-[48px] px-6 py-3 rounded-xl border border-[var(--border)] bg-[var(--visual-page-field-background,white)] text-[var(--foreground)] text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm transition-all hover:bg-[var(--muted)]"
              >
                Volver al checkout
              </Link>
              {canRetry && (
                <Button variant="outline" fullWidth className="flex-1 min-h-[48px] rounded-xl" onClick={retryPayment} disabled={retrying}>
                  {retrying ? `Redirigiendo a ${name}…` : 'Reintentar pago'}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}