import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { formatPrice } from '../data/mockData';
import { orderService, type TrackedOrder } from '../services/orderService';
import {
  Button,
  Input,
  Badge,
  Alert,
  Icon,
} from '../components/ui';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';
import { shippingService, type DetalleSeguimiento } from '../services/shippingService';

const STATUS_STEPS = [
  {
    id: 'pendiente',
    label: 'Pedido recibido',
    icon: 'orders',
  },
  {
    id: 'pagado',
    label: 'Pago confirmado',
    icon: 'card',
  },
  {
    id: 'preparando',
    label: 'En preparación',
    icon: 'box',
  },
  {
    id: 'enviado',
    label: 'En tránsito',
    icon: 'truck',
  },
  {
    id: 'entregado',
    label: 'Entregado',
    icon: 'checkCircle',
  },
];

const ORDER_STATUS_MAP: Record<
  string,
  {
    label: string;
    variant:
      | 'default'
      | 'info'
      | 'warning'
      | 'success'
      | 'error';
  }
> = {
  pendiente: {
    label: 'Pendiente',
    variant: 'warning',
  },
  pagado: {
    label: 'Pagado',
    variant: 'info',
  },
  preparando: {
    label: 'En preparación',
    variant: 'info',
  },
  enviado: {
    label: 'Despachado',
    variant: 'info',
  },
  entregado: {
    label: 'Entregado',
    variant: 'success',
  },
  cancelado: {
    label: 'Cancelado',
    variant: 'error',
  },
};

interface TrackingState {
  orderNumber?: string;
  email?: string;
}

export default function Tracking() {
  const location = useLocation();
  const { isMinimal, isVisual, isCatalog } = useStorefrontTemplate();
  const locationState = location.state as TrackingState | null;
  const incomingNumber = new URLSearchParams(location.search).get('orden')
    ?? locationState?.orderNumber ?? '';
  const incomingEmail = locationState?.email ?? '';
  const isAutomaticLookup = Boolean(incomingNumber.trim() && incomingEmail.trim());
  const [orderNumber, setOrderNumber] = useState(incomingNumber);
  const [email, setEmail] = useState(incomingEmail);
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef<AbortController | null>(null);

  const [liveTracking, setLiveTracking] = useState<DetalleSeguimiento | null>(null);

  const search = useCallback(async (number: string, customerEmail: string) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setOrder(null);
    setLiveTracking(null);
    setError('');

    const term = number.trim();
    const isDirect =
      term.toUpperCase().startsWith('CHILEX') ||
      term.toUpperCase().startsWith('STK') ||
      term.toUpperCase().startsWith('STARKEN') ||
      term.toUpperCase().startsWith('TRK');

    try {
      if (isDirect) {
        const live = await shippingService.getTracking(term);
        if (!controller.signal.aborted) setLiveTracking(live);
      } else {
        const found = await orderService.track(number, customerEmail, controller.signal);
        if (!controller.signal.aborted) setOrder(found);
      }
    } catch (err: any) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'No se pudo consultar el pedido.');
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  const isDirectTracking =
    orderNumber.trim().toUpperCase().startsWith('CHILEX') ||
    orderNumber.trim().toUpperCase().startsWith('STK') ||
    orderNumber.trim().toUpperCase().startsWith('STARKEN') ||
    orderNumber.trim().toUpperCase().startsWith('TRK');

  const handleSearch = () => {
    if (orderNumber.trim() && (email.trim() || isDirectTracking)) {
      void search(orderNumber, email);
    }
  };

  useEffect(() => {
    setOrderNumber(incomingNumber);
    setEmail(incomingEmail);
    setOrder(null);
    setError('');
    setLoading(false);
    if (incomingNumber.trim() && incomingEmail.trim()) {
      void search(incomingNumber, incomingEmail);
    }
    return () => {requestRef.current?.abort();};
  }, [incomingNumber, incomingEmail, search]);

  const currentStepIdx = order
    ? STATUS_STEPS.findIndex(
        (status) =>
          status.id === order.estado,
      )
    : -1;

  const panelClass = isCatalog
    ? 'bg-[#f5f5f3] text-[#151515] rounded-[16px]'
    : isVisual
      ? 'bg-[#f1f1f0] rounded-[10px]'
      : isMinimal
        ? 'bg-white border border-black/5 rounded-[24px]'
        : 'bg-white border border-[var(--border)] rounded-2xl';

  return (
    <div
      className={
        isCatalog
          ? 'max-w-[760px] mx-auto px-5 py-12 md:py-16 text-white'
          : isVisual
            ? 'max-w-[900px] mx-auto px-5 md:px-8 py-12 md:py-16 text-[#111111]'
            : isMinimal
              ? 'max-w-3xl mx-auto px-4 md:px-8 py-12'
              : 'max-w-2xl mx-auto px-4 py-12'
      }
    >
      {/* =====================================================
          ENCABEZADO
      ====================================================== */}
      <div
        className={
          isCatalog
            ? 'text-center mb-9'
            : isVisual
              ? 'text-center mb-9'
              : isMinimal
                ? 'text-center mb-9'
                : 'text-center mb-10'
        }
      >
        {(isMinimal || isVisual || isCatalog) && (
          <p
            className={
              isCatalog
                ? 'mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#ff5a1f]'
                : isVisual
                  ? 'mb-3 text-[9px] font-medium uppercase tracking-[0.18em] text-[#77716e]'
                  : 'text-xs text-gray-400 mb-2'
            }
          >
            ¿Dónde está mi compra?
          </p>
        )}

        <h1
          className={
            isCatalog
              ? 'text-[42px] md:text-[52px] leading-none tracking-[-0.045em] font-black text-white mb-4'
              : isVisual
                ? 'font-serif text-[42px] md:text-[52px] leading-none tracking-[-0.025em] mb-4'
                : isMinimal
                  ? 'text-3xl md:text-4xl font-semibold tracking-tight text-[#171717] mb-3'
                  : 'text-3xl font-bold text-[var(--foreground)] mb-2'
          }
        >
          Seguimiento de pedido
        </h1>

        <p
          className={
            isCatalog
              ? 'text-[13px] leading-6 text-white/45'
              : isVisual
                ? 'text-[14px] leading-6 text-[#77716e]'
                : 'text-[var(--muted-foreground)]'
          }
        >
          Ingresa tu número de orden y correo
          para consultar el estado.
        </p>
      </div>

      {/* =====================================================
          BUSCADOR
      ====================================================== */}
      {!isAutomaticLookup && <div
        className={`
          ${panelClass}
          ${
            isCatalog
              ? 'p-6 md:p-7 flex flex-col gap-4 mb-8 [&_input]:text-[#151515] [&_label]:text-[#151515]'
              : isVisual
                ? 'p-6 md:p-7 flex flex-col gap-4 mb-8'
                : isMinimal
                  ? 'p-6 md:p-7 flex flex-col gap-4 mb-8'
                  : 'p-6 flex flex-col gap-4 mb-8'
          }
        `}
      >
        <Input
          label="Número de orden"
          value={orderNumber}
          onChange={(event) =>
            setOrderNumber(
              event.target.value,
            )
          }
          placeholder="ORD-20261008-AB12"
          hint="El número que aparece al confirmar tu compra, o código CHILEX / STK"
        />

        <Input
          label="Correo electrónico"
          type="email"
          value={email}
          onChange={(event) =>
            setEmail(event.target.value)
          }
          placeholder="correo@ejemplo.com"
          hint="El correo que usaste al comprar"
        />

        {isCatalog ? (
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading || !orderNumber.trim() || (!isDirectTracking && !email.trim())}
            className="w-full h-12 rounded-[9px] bg-[#1683ff] text-white text-[12px] font-bold hover:bg-[#3194f5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Consultando...' : 'Consultar pedido →'}
          </button>
        ) : isVisual ? (
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading || !orderNumber.trim() || (!isDirectTracking && !email.trim())}
            className="w-full h-12 rounded-[8px] bg-black text-white text-[12px] font-semibold hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {loading ? 'Consultando...' : 'Consultar pedido →'}
          </button>
        ) : isMinimal ? (
          <button
            type="button"
            onClick={handleSearch}
            disabled={
              loading || !orderNumber.trim() || (!isDirectTracking && !email.trim())
            }
            className="
              w-full h-12 rounded-full
              bg-[#17213b] text-white
              text-sm font-semibold
              hover:bg-[#0f2a56]
              disabled:opacity-50
              disabled:cursor-not-allowed
              transition-colors
            "
          >
            {loading ? 'Consultando...' : 'Consultar pedido'}
          </button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleSearch}
            disabled={
              loading || !orderNumber.trim() || (!isDirectTracking && !email.trim())
            }
          >
            {loading ? 'Consultando...' : 'Consultar pedido'}
          </Button>
        )}

        <p
          className={
            isCatalog
              ? 'text-center text-[10px] text-black/40'
              : isVisual
                ? 'text-center text-[10px] text-[#8c8683]'
                : 'text-center text-xs text-[var(--muted-foreground)]'
          }
        >
          Demo: usa <strong>ORD-2025-0001</strong> con <strong>maria@email.com</strong>, o tracking <strong>CHILEX-DEMO12345</strong> / <strong>STK-DEMO12345</strong>
        </p>
      </div>}

      {/* =====================================================
          NO ENCONTRADO
      ====================================================== */}
      {loading && <p role="status">Consultando pedido…</p>}
      {error && (
        <Alert variant="error" title="No se pudo consultar el pedido">
          {error}
          {isAutomaticLookup && (
            <button type="button" className="block mt-3 underline" onClick={handleSearch}>
              Volver a consultar
            </button>
          )}
        </Alert>
      )}

      {/* =====================================================
          SEGUIMIENTO EN VIVO (CHILEXPRESS / STARKEN / CENTRAL)
      ====================================================== */}
      {liveTracking && (
        <div className={isCatalog
          ? 'flex flex-col gap-5 animate-fade-in text-[#151515] [&_.text-\[var\(--muted-foreground\)\]]:text-black/45 [&_.text-\[var\(--foreground\)\]]:text-[#151515]'
          : 'flex flex-col gap-5 animate-fade-in'
        }>
          <div
            className={`
              ${panelClass}
              ${isCatalog ? 'p-6 md:p-7' : isVisual ? 'p-6 md:p-7' : isMinimal ? 'p-6' : 'p-5'}
            `}
          >
            <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded uppercase tracking-wide ${
                    liveTracking.proveedor === 'CHILEXPRESS'
                      ? 'bg-blue-100 text-blue-800'
                      : liveTracking.proveedor === 'STARKEN'
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-indigo-100 text-indigo-800'
                  }`}>
                    {liveTracking.proveedor === 'CHILEXPRESS'
                      ? '🇨🇱 Chilexpress'
                      : liveTracking.proveedor === 'STARKEN'
                        ? '📦 Starken'
                        : liveTracking.proveedor}
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)]">Orden de Flete / Transporte</span>
                </div>

                <p
                  className={
                    isVisual
                      ? 'font-serif text-[24px] leading-none'
                      : isMinimal
                        ? 'font-semibold text-xl tracking-tight'
                        : 'font-bold text-lg'
                  }
                >
                  {liveTracking.numero_seguimiento}
                </p>
              </div>

              <Badge variant="info">
                {liveTracking.estado_actual.replace(/_/g, ' ')}
              </Badge>
            </div>

            <div className="rounded-xl bg-blue-50/70 border border-blue-100 p-4 mb-6">
              <p className="text-sm font-medium text-blue-950">
                {liveTracking.descripcion_estado}
              </p>
              {liveTracking.fecha_estimada_entrega && (
                <p className="text-xs text-blue-700 mt-1">
                  Entrega estimada: {new Date(liveTracking.fecha_estimada_entrega).toLocaleDateString('es-CL', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              )}
            </div>

            {/* Historial de eventos */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-4">
                Historial de Movimientos
              </h4>

              <div className="relative pl-6 border-l-2 border-blue-200 ml-2 space-y-6">
                {liveTracking.historial.map((evento, idx) => (
                  <div key={idx} className="relative">
                    <div className="absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full border-2 border-white bg-blue-600 shadow-sm" />
                    
                    <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                      <p className="text-sm font-semibold text-[var(--foreground)]">
                        {evento.descripcion}
                      </p>
                      <span className="text-xs text-[var(--muted-foreground)] shrink-0">
                        {new Date(evento.fecha_hora).toLocaleDateString('es-CL', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </div>
                    
                    <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                      📍 {evento.ubicacion} · <span className="font-mono text-[11px] font-medium">{evento.estado}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          PEDIDO ENCONTRADO
      ====================================================== */}
      {order && (
        <div className={isCatalog
          ? 'flex flex-col gap-5 animate-fade-in text-[#151515] [&_.text-\[var\(--muted-foreground\)\]]:text-black/45 [&_.text-\[var\(--foreground\)\]]:text-[#151515]'
          : 'flex flex-col gap-5 animate-fade-in'
        }>

          {/* ===============================================
              INFORMACIÓN DEL PEDIDO
          ================================================ */}
          <div
            className={`
              ${panelClass}
              ${isCatalog ? 'p-6 md:p-7' : isVisual ? 'p-6 md:p-7' : isMinimal ? 'p-6' : 'p-5'}
            `}
          >
            <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
              <div>
                <p className="text-xs text-[var(--muted-foreground)] mb-1">
                  Número de orden
                </p>

                <p
                  className={
                    isVisual
                      ? 'font-serif text-[25px] leading-none'
                      : isMinimal
                        ? 'font-semibold text-xl tracking-tight'
                        : 'font-bold text-lg'
                  }
                >
                  {order.identificador}
                </p>
              </div>

              <Badge
                variant={
                  ORDER_STATUS_MAP[
                    order.estado
                  ]?.variant ?? 'default'
                }
              >
                {ORDER_STATUS_MAP[
                  order.estado
                ]?.label ?? order.estado}
              </Badge>
            </div>

            <div
              className={
                isVisual
                  ? 'grid grid-cols-1 sm:grid-cols-2 gap-5 text-[13px] border-t border-black/10 pt-5'
                  : isMinimal
                    ? 'grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm'
                    : 'grid grid-cols-2 gap-4 text-sm'
              }
            >
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Cliente
                </p>

                <p className="font-medium mt-1">
                  {order.nombre_contacto}
                </p>
              </div>

              <div>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Método de entrega
                </p>

                <p className="font-medium mt-1">
                  {order.entrega.metodo || 'Sin especificar'}
                </p>
              </div>

              <div>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Pago
                </p>

                <p className="font-medium mt-1">
                  {order.medio_pago}
                </p>
              </div>

              <div>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Total
                </p>

                <p className="font-semibold mt-1">
                  {formatPrice(Number(order.monto_total))}
                </p>
              </div>

            </div>
          </div>

          {/* ===============================================
              ESTADO
          ================================================ */}
          <div
            className={`
              ${panelClass}
              ${isCatalog ? 'p-6 md:p-7' : isVisual ? 'p-6 md:p-7' : isMinimal ? 'p-6' : 'p-5'}
            `}
          >
            <div className="mb-6">
              {(isMinimal || isVisual) && (
                <p
                  className={
                    isVisual
                      ? 'mb-2 text-[9px] font-medium uppercase tracking-[0.18em] text-[#77716e]'
                      : 'text-xs text-gray-400 mb-1'
                  }
                >
                  Progreso
                </p>
              )}

              <h2
                className={
                  isVisual
                    ? 'font-serif text-[28px] leading-none'
                    : isMinimal
                      ? 'font-semibold text-lg tracking-tight'
                      : 'font-semibold'
                }
              >
                Estado del envío
              </h2>
            </div>

            <div className="flex flex-col gap-0">
              {STATUS_STEPS.map(
                (status, index) => {
                  const done =
                    index <
                    currentStepIdx;

                  const active =
                    index ===
                    currentStepIdx;

                  const pending =
                    index >
                    currentStepIdx;

                  return (
                    <div
                      key={status.id}
                      className="flex gap-4 relative"
                    >
                      {index <
                        STATUS_STEPS.length -
                          1 && (
                        <div
                          className={`
                            absolute
                            left-[19px]
                            top-10
                            w-0.5
                            h-8
                            ${
                              done
                                ? isCatalog
                                  ? 'bg-[#1683ff]'
                                  : isVisual
                                    ? 'bg-black'
                                    : 'bg-[var(--success)]'
                                : isCatalog
                                  ? 'bg-black/10'
                                  : isVisual
                                    ? 'bg-black/10'
                                    : 'bg-[var(--border)]'
                            }
                          `}
                        />
                      )}

                      <div
                        className={`
                          w-10 h-10
                          rounded-full
                          flex items-center
                          justify-center
                          flex-shrink-0
                          z-10
                          transition-all

                          ${
                            done
                              ? isCatalog
                                ? 'bg-[#1683ff] text-white'
                                : isVisual
                                  ? 'bg-black text-white'
                                  : 'bg-[var(--success-bg)] text-[var(--success)]'
                              : active
                                ? isCatalog
                                  ? 'bg-[#ff5a1f] text-white'
                                  : isVisual
                                    ? 'bg-black text-white'
                                    : 'bg-[#17213b] text-white shadow-sm'
                                : isCatalog
                                  ? 'bg-black/[0.06] text-black/35 border border-black/10'
                                  : isVisual
                                    ? 'bg-white text-[#77716e] border border-black/10 opacity-60'
                                    : 'bg-[var(--muted)] text-[var(--muted-foreground)] opacity-50'
                          }
                        `}
                      >
                        <Icon
                          name={
                            done
                              ? 'check'
                              : status.icon
                          }
                          className="w-5 h-5"
                        />
                      </div>

                      <div
                        className={`
                          pb-8 flex-1
                          ${
                            pending
                              ? 'opacity-40'
                              : ''
                          }
                        `}
                      >
                        <p
                          className={`
                            font-semibold text-sm
                            ${
                              active
                                ? isCatalog
                                  ? 'text-[#e04b1a]'
                                  : isVisual
                                    ? 'text-black'
                                    : 'text-[#17213b]'
                                : done
                                  ? 'text-[var(--foreground)]'
                                  : 'text-[var(--muted-foreground)]'
                            }
                          `}
                        >
                          {status.label}
                        </p>

                        {active && (
                          <p className="text-xs text-[var(--muted-foreground)] mt-1">
                            Estado actual
                          </p>
                        )}

                        {done && (
                          <p className="text-xs text-[var(--muted-foreground)] mt-1">
                            Completado
                          </p>
                        )}
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          </div>

          {/* ===============================================
              PRODUCTOS
          ================================================ */}
          <div
            className={`
              ${panelClass}
              ${isCatalog ? 'p-6 md:p-7' : isVisual ? 'p-6 md:p-7' : isMinimal ? 'p-6' : 'p-5'}
            `}
          >
            <h2
              className={
                isVisual
                  ? 'font-serif text-[28px] leading-none mb-6'
                  : isMinimal
                    ? 'font-semibold text-lg tracking-tight mb-5'
                    : 'font-semibold mb-4 text-sm'
              }
            >
              Productos en este pedido
            </h2>

            <div className="flex flex-col gap-4">
              {order.items.map(
                (item, index) => (
                  <div
                    key={`${item.producto_id}-${item.sku}-${index}`}
                    className={
                      isVisual
                        ? 'flex items-center gap-4 border-b border-black/10 pb-4 last:border-b-0 last:pb-0'
                        : 'flex items-center gap-3'
                    }
                  >
                    <div
                      className={`${isVisual ? 'w-16 h-16 rounded-[8px]' : isMinimal ? 'w-14 h-14 rounded-xl' : 'w-12 h-12 rounded-lg'} bg-black/5 flex items-center justify-center flex-shrink-0`}
                      aria-hidden="true"
                    >
                      <Icon name="box" className="w-6 h-6" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {item.nombre}
                      </p>

                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                        {item.atributos_variante?.map(attribute => attribute.valor).join(' / ')}
                      </p>

                      <p className="text-xs text-[var(--muted-foreground)]">
                        Cantidad:{' '}
                        {item.cantidad}
                      </p>
                    </div>

                    <p className="text-sm font-semibold">
                      {formatPrice(
                        Number(item.precio_unitario) *
                          item.cantidad,
                      )}
                    </p>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
