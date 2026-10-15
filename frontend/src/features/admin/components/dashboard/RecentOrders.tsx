import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button } from '../ui';
import { formatPrice } from '../../data/mockAdminData';
import { orderStatusBadge } from '../../data/orderStatus';
import { orderDetailDestination } from '../../services/orderNavigation';
import {
  RECENT_ORDERS_LIMIT,
  formatRecentOrderDate,
  getRecentOrders,
  type RecentOrder,
} from '../../services/recentOrdersService';

export type RecentOrdersState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; orders: RecentOrder[] };

/** Tabla de las últimas órdenes: solo dibuja el estado que recibe (cargando, error, vacío o lista). */
export function RecentOrdersView({ state, onRetry }: { state: RecentOrdersState; onRetry: () => void }) {
  return (
    <div className="bg-white border border-[var(--border)] rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-bold text-base">Últimos Pedidos</h2>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            Las {RECENT_ORDERS_LIMIT} órdenes más recientes de tu tienda
          </p>
        </div>
        <Link
          to="/emprendedor/pedidos"
          className="text-xs text-[var(--primary)] font-semibold hover:underline"
        >
          Ver todos →
        </Link>
      </div>

      {state.status === 'loading' && (
        <p role="status" aria-live="polite" className="py-8 text-center text-sm text-[var(--muted-foreground)]">
          Cargando las últimas órdenes…
        </p>
      )}

      {state.status === 'error' && (
        <div className="py-4 space-y-3">
          <Alert variant="error">{state.message}</Alert>
          <Button variant="outline" size="sm" onClick={onRetry}>Reintentar</Button>
        </div>
      )}

      {state.status === 'ready' && state.orders.length === 0 && (
        <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
          Aún no hay órdenes registradas en tu tienda.
        </p>
      )}

      {state.status === 'ready' && state.orders.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs text-[var(--muted-foreground)] uppercase">
                <th className="py-3 px-2">Orden</th>
                <th className="py-3 px-2">Cliente</th>
                <th className="py-3 px-2">Fecha</th>
                <th className="py-3 px-2">Estado</th>
                <th className="py-3 px-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-sm">
              {state.orders.map((order) => {
                const badge = orderStatusBadge(order.estado, order.estado_etiqueta);
                return (
                  <tr key={order.id_pedido} className="hover:bg-[var(--muted)]/50 transition-colors">
                    <td className="py-3 px-2 font-mono font-semibold">
                      <Link to={orderDetailDestination(order.id_pedido)} aria-label={`Ver detalle del pedido ${order.identificador || `#${order.id_pedido}`}`}
                        className="text-[var(--primary)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 rounded">
                        {order.identificador || `#${order.id_pedido}`} <span aria-hidden="true">→</span>
                      </Link>
                    </td>
                    <td className="py-3 px-2">{order.nombre_contacto || 'Sin nombre'}</td>
                    <td className="py-3 px-2 whitespace-nowrap text-[var(--muted-foreground)]">
                      {formatRecentOrderDate(order.fecha_creacion)}
                    </td>
                    <td className="py-3 px-2">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </td>
                    <td className="py-3 px-2 text-right font-bold">
                      {formatPrice(Number(order.monto_total))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const GENERIC_ERROR = 'No se pudieron consultar las últimas órdenes.';

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error
    && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }
  return GENERIC_ERROR;
}

/** Últimas órdenes registradas de la tienda, consultadas al servidor (SCRUM-371). */
export default function RecentOrders() {
  const [state, setState] = useState<RecentOrdersState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    getRecentOrders(RECENT_ORDERS_LIMIT, controller.signal)
      .then((orders) => {
        if (controller.signal.aborted) return;
        setState({ status: 'ready', orders });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: errorMessage(error) });
      });
    return () => controller.abort();
  }, [attempt]);

  return <RecentOrdersView state={state} onRetry={() => setAttempt((value) => value + 1)} />;
}
