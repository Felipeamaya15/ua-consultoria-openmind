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

export default function TransbankReturnResult({
  orderNumber,
  tokenWs,
  tbkToken,
  tiendaId,
}: Props) {
  const { route } = useStorefrontTemplate();
  const started = useRef(false);
  const [result, setResult] = useState<Result>({ status: 'loading' });

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // Sin token_ws pero con TBK_TOKEN: el cliente abandonó o expiró el pago.
    if (!tokenWs) {
      setResult(
        tbkToken
          ? { status: 'cancelled' }
          : { status: 'error', message: 'No recibimos la información del pago.' },
      );
      return;
    }

    try {
      const cached = sessionStorage.getItem(cacheKey(tokenWs));
      if (cached) {
        setResult(JSON.parse(cached) as Result);
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
        } else if (res?.error?.codigo === 'PAGO_RECHAZADO') {
          next = { status: 'rejected', message: res.mensaje || 'El pago fue rechazado.' };
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
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(`order-tracking:${orderLabel}`) ?? 'null');
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
    cancelled: { glyph: '!', tone: 'bg-amber-50 text-amber-600', title: 'Pago cancelado' },
    error: { glyph: '!', tone: 'bg-red-50 text-red-600', title: 'No pudimos confirmar tu pago' },
  }[result.status];

  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center flex flex-col items-center gap-6">
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
            {result.message} Tu pedido sigue pendiente de pago.
          </p>
        )}

        {result.status === 'cancelled' && (
          <p className="text-[var(--muted-foreground)]">
            El pago fue cancelado o el tiempo para pagar expiró. No se realizó ningún cobro
            {orderLabel ? ` y el pedido ${orderLabel} sigue pendiente de pago` : ''}.
          </p>
        )}

        {result.status === 'error' && (
          <p className="text-[var(--muted-foreground)]">{result.message}</p>
        )}
      </div>

      {result.status === 'approved' && (
        <div className="bg-white border border-[var(--border)] rounded-2xl p-6 w-full text-sm text-left">
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

      {result.status !== 'loading' && (
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          {result.status === 'approved' ? (
            <Link
              to={trackingRoute}
              state={{ email }}
              className="flex-1"
            >
              <Button variant="primary" fullWidth>
                Ver mi pedido
              </Button>
            </Link>
          ) : (
            <Link to={route('checkout')} className="flex-1">
              <Button variant="primary" fullWidth>
                Volver al checkout
              </Button>
            </Link>
          )}

          <Link to={route('catalogo')} className="flex-1">
            <Button variant="outline" fullWidth>
              Seguir comprando
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
