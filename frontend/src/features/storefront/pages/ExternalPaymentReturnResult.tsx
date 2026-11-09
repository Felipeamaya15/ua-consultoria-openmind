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
      setResult({ status: 'cancelled' });
      return;
    }
    try {
      const cached = sessionStorage.getItem(cacheKey(gateway, reference));
      if (cached) {
        setResult(JSON.parse(cached) as Result);
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
        if (res?.exito) next = { status: 'approved', usd: res.data?.monto_usd ?? undefined, tipoCambio: res.data?.tipo_cambio ?? undefined };
        else if (code === 'PAGO_RECHAZADO') next = { status: 'rejected', message: res.mensaje || `${name} rechazó el pago.` };
        else if (code === 'PAGO_PENDIENTE') next = { status: 'pending', message: res.mensaje || `El pago sigue pendiente en ${name}.` };
        else next = { status: 'error', message: res?.mensaje || 'No pudimos confirmar tu pago.' };
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
    cancelled: { glyph: '!', tone: 'bg-amber-50 text-amber-600', title: 'Pago cancelado' },
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
    <div className="w-full max-w-7xl mx-auto px-4 py-12 text-center flex flex-col items-center gap-6">
      <div className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold ${view.tone}`} aria-hidden="true">
        {view.glyph}
      </div>
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">{view.title}</h1>
        <p className="text-[var(--muted-foreground)]">
          {result.status === 'loading' && `Estamos verificando el resultado con ${name}. No cierres esta página.`}
          {result.status === 'approved' && `Tu pedido${orderNumber ? ` ${orderNumber}` : ''} quedó pagado.${result.usd ? ` Se cobró US$ ${result.usd} (tipo de cambio $${Number(result.tipoCambio).toLocaleString('es-CL', {maximumFractionDigits: 2})} por US$ 1).` : ''}`}
          {result.status === 'rejected' && `${result.message} Tu pedido sigue pendiente de pago.`}
          {result.status === 'pending' && `${result.message} Te avisaremos cuando se confirme.`}
          {result.status === 'cancelled' && `No se realizó ningún cobro${orderNumber ? ` y el pedido ${orderNumber} sigue pendiente de pago` : ''}.`}
          {result.status === 'error' && result.message}
        </p>
      </div>
      {retryError && <p role="alert" className="text-sm text-red-600">{retryError}</p>}

      {result.status !== 'loading' && (
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          {result.status === 'approved' || result.status === 'pending' ? (
            <Link data-page-action="ghost" to={trackingRoute} state={{ email }} className="flex-1">
              <Button variant="primary" fullWidth>Ver mi pedido</Button>
            </Link>
          ) : canRetry ? (
            <Button variant="primary" fullWidth className="flex-1" onClick={retryPayment} disabled={retrying}>
              {retrying ? `Redirigiendo a ${name}…` : 'Reintentar pago'}
            </Button>
          ) : (
            <Link data-page-action="ghost" to={route('compra')} className="flex-1">
              <Button variant="primary" fullWidth>Volver al checkout</Button>
            </Link>
          )}
          <Link data-page-action="ghost" to={route('catalogo')} className="flex-1">
            <Button variant="outline" fullWidth>Seguir comprando</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
