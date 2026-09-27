import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { useOrders } from '../context/OrderContext';
import { formatPrice, type Order } from '../data/mockData';
import {
  Button,
  Input,
  Badge,
  Alert,
  Icon,
} from '../components/ui';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';

const STATUS_STEPS = [
  {
    id: 'pending',
    label: 'Pedido recibido',
    icon: 'orders',
  },
  {
    id: 'paid',
    label: 'Pago confirmado',
    icon: 'card',
  },
  {
    id: 'preparing',
    label: 'En preparación',
    icon: 'box',
  },
  {
    id: 'shipped',
    label: 'En tránsito',
    icon: 'truck',
  },
  {
    id: 'delivered',
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
  pending: {
    label: 'Pendiente',
    variant: 'warning',
  },
  paid: {
    label: 'Pagado',
    variant: 'info',
  },
  preparing: {
    label: 'En preparación',
    variant: 'info',
  },
  shipped: {
    label: 'Despachado',
    variant: 'info',
  },
  delivered: {
    label: 'Entregado',
    variant: 'success',
  },
  cancelled: {
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
  const { orders } = useOrders();
  const { isMinimal, isVisual, isCatalog } = useStorefrontTemplate();

  const locationState =
    location.state as TrackingState | null;

  const [orderNumber, setOrderNumber] =
    useState(locationState?.orderNumber ?? '');

  const [email, setEmail] = useState(
    locationState?.email ?? '',
  );

  const [searched, setSearched] =
    useState(false);

  const [order, setOrder] =
    useState<Order | null>(null);

  const [notFound, setNotFound] =
    useState(false);

  /*
   * ==========================================================
   * BÚSQUEDA
   * ==========================================================
   */
  const findOrder = (
    number: string,
    customerEmail: string,
  ) => {
    const normalizedNumber = number
      .trim()
      .toLowerCase();

    const normalizedEmail = customerEmail
      .trim()
      .toLowerCase();

    return orders.find(
      (candidate) =>
        candidate.number
          .trim()
          .toLowerCase() === normalizedNumber &&
        candidate.customer.email
          .trim()
          .toLowerCase() === normalizedEmail,
    );
  };

  const handleSearch = () => {
    setSearched(true);

    const found = findOrder(
      orderNumber,
      email,
    );

    setOrder(found ?? null);
    setNotFound(!found);
  };

  /*
   * Si venimos directamente desde Pedido confirmado,
   * intentamos mostrar el pedido automáticamente.
   *
   * También esperamos a que "orders" cambie, por si la orden
   * acaba de ser agregada al contexto.
   */
  useEffect(() => {
    if (
      !locationState?.orderNumber ||
      !locationState?.email
    ) {
      return;
    }

    const found = orders.find(
      (candidate) =>
        candidate.number
          .trim()
          .toLowerCase() ===
          locationState.orderNumber!
            .trim()
            .toLowerCase() &&
        candidate.customer.email
          .trim()
          .toLowerCase() ===
          locationState.email!
            .trim()
            .toLowerCase(),
    );

    if (found) {
      setOrder(found);
      setSearched(true);
      setNotFound(false);
    }
  }, [
    orders,
    locationState?.orderNumber,
    locationState?.email,
  ]);

  const currentStepIdx = order
    ? STATUS_STEPS.findIndex(
        (status) =>
          status.id === order.status,
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
      <div
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
          placeholder="ORD-2025-0001"
          hint="Puedes encontrarlo en tu correo de confirmación"
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
            disabled={!orderNumber || !email}
            className="w-full h-12 rounded-[9px] bg-[#1683ff] text-white text-[12px] font-bold hover:bg-[#3194f5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Consultar pedido →
          </button>
        ) : isVisual ? (
          <button
            type="button"
            onClick={handleSearch}
            disabled={!orderNumber || !email}
            className="w-full h-12 rounded-[8px] bg-black text-white text-[12px] font-semibold hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            Consultar pedido →
          </button>
        ) : isMinimal ? (
          <button
            type="button"
            onClick={handleSearch}
            disabled={
              !orderNumber || !email
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
            Consultar pedido
          </button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleSearch}
            disabled={
              !orderNumber || !email
            }
          >
            Consultar pedido
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
          Demo: usa{' '}
          <strong>
            ORD-2025-0001
          </strong>{' '}
          y{' '}
          <strong>
            maria@email.com
          </strong>
        </p>
      </div>

      {/* =====================================================
          NO ENCONTRADO
      ====================================================== */}
      {searched && notFound && (
        <Alert
          variant="error"
          title="Pedido no encontrado"
        >
          No encontramos un pedido con ese
          número y correo. Verifica los datos e
          intenta de nuevo.
        </Alert>
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
                  {order.number}
                </p>
              </div>

              <Badge
                variant={
                  ORDER_STATUS_MAP[
                    order.status
                  ]?.variant ?? 'default'
                }
              >
                {ORDER_STATUS_MAP[
                  order.status
                ]?.label ?? order.status}
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
                  {order.customer.name}
                </p>
              </div>

              <div>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Método de entrega
                </p>

                <p className="font-medium mt-1">
                  {order.shippingMethod}
                </p>
              </div>

              <div>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Pago
                </p>

                <p className="font-medium mt-1">
                  {order.paymentMethod}
                </p>
              </div>

              <div>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Total
                </p>

                <p className="font-semibold mt-1">
                  {formatPrice(order.total)}
                </p>
              </div>

              {order.trackingCode && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Código de seguimiento{' '}
                    {order.carrier}
                  </p>

                  <p className="font-mono font-bold text-[var(--primary)] mt-1">
                    {order.trackingCode}
                  </p>
                </div>
              )}
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
                    key={`${item.productId}-${item.variantId}-${index}`}
                    className={
                      isVisual
                        ? 'flex items-center gap-4 border-b border-black/10 pb-4 last:border-b-0 last:pb-0'
                        : 'flex items-center gap-3'
                    }
                  >
                    <img
                      src={item.image}
                      alt={item.name}
                      className={
                        isVisual
                          ? 'w-16 h-16 rounded-[8px] object-cover bg-[#e7e7e4]'
                          : isMinimal
                            ? 'w-14 h-14 rounded-xl object-cover'
                            : 'w-12 h-12 rounded-lg object-cover'
                      }
                    />

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {item.name}
                      </p>

                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                        {Object.values(
                          item.attributes,
                        ).join(' / ')}
                      </p>

                      <p className="text-xs text-[var(--muted-foreground)]">
                        Cantidad:{' '}
                        {item.quantity}
                      </p>
                    </div>

                    <p className="text-sm font-semibold">
                      {formatPrice(
                        item.price *
                          item.quantity,
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