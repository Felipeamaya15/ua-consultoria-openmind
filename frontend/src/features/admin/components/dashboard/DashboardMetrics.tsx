import { Link } from 'react-router-dom';
import { ErrorState, LoadingState } from '../../../../shared/components/states';
import { humanizeAdminError } from '../../utils/humanizeError';
import { formatReportMoney } from '../../services/reportFormatting';
import { Icon } from '../ui';
import type { DashboardData } from '../../services/dashboardService';
import { ordersDestination } from '../../services/orderNavigation';
import { displayDashboardDate, variationLabel } from '../../services/dashboardAnalytics';
import DashboardAnalytics from './DashboardAnalytics';
export type DashboardState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: DashboardData };
export function DashboardMetrics({ state, onRetry, period = '30' }: { state: DashboardState; onRetry: () => void; period?: string }) {
  const data = state.status === 'ready' ? state.data : null;
  const cards = [
    { title: 'Ventas Totales', value: data ? formatReportMoney(data.total_ventas, data.moneda) : '—', detail: 'Solo pagos confirmados', filter: 'confirmed', icon: 'card', variation: data?.comparacion?.variacion_ventas },
    { title: 'Órdenes Totales', value: data?.total_pedidos ?? '—', detail: 'Pedidos registrados en el período', filter: 'all', icon: 'orders', variation: data?.comparacion?.variacion_pedidos },
    { title: 'Por Despachar', value: data?.por_despachar ?? '—', detail: 'Pendientes de pago, preparación o despacho', filter: 'dispatch', icon: 'truck' },
    { title: 'Ticket promedio', value: data ? data.ticket_promedio ? formatReportMoney(data.ticket_promedio, data.moneda) : '—' : '—', detail: data?.ticket_promedio === null ? 'Sin pedidos con pago confirmado' : 'Ingresos / pedidos con pago confirmado', filter: 'confirmed', icon: 'wallet' },
  ];
  return <section className="space-y-5" aria-label="Estadísticas de la tienda" aria-busy={state.status === 'loading'}>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map(card => {
        const content = <>
          <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">{card.title}</p>
            <span aria-hidden="true" className="rounded-xl bg-[var(--secondary)] p-2 text-[var(--primary)]"><Icon name={card.icon} className="w-4 h-4" /></span></div>
          <p className="text-2xl sm:text-3xl font-bold text-[var(--foreground)] mt-3 break-words">{card.value}</p>
          <span className="text-xs text-[var(--muted-foreground)] mt-2 block">{card.detail}</span>
          {data && (card.filter === 'all' || card.title === 'Ventas Totales') && <p className={`text-xs mt-3 font-medium ${card.variation !== null && card.variation !== undefined && Number(card.variation) > 0 ? 'text-[var(--success)]' : 'text-[var(--muted-foreground)]'}`}>{variationLabel(card.variation)}</p>}
          {data && <span className="block mt-3 text-xs font-semibold text-[var(--primary)]">Ver pedidos <span aria-hidden="true">→</span></span>}
        </>;
        const className = 'block bg-white border border-[var(--border)] p-5 rounded-2xl shadow-sm min-w-0';
        return data ? <Link key={card.title} to={ordersDestination(data.fecha_desde, data.fecha_hasta, card.filter, period)} aria-label={`${card.title}: ver pedidos del período seleccionado`}
          className={`${className} cursor-pointer hover:bg-[var(--muted)]/40 hover:shadow-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]`}>{content}</Link>
          : <div key={card.title} className={className}>{content}</div>;
      })}
    </div>
    {state.status === 'loading' && <LoadingState spacing="none" className="rounded-2xl border border-[var(--border)] bg-white p-8">Cargando estadísticas…</LoadingState>}
    {state.status === 'error' && <ErrorState onRetry={onRetry} retryLabel="Reintentar estadísticas">{humanizeAdminError(state.message)}</ErrorState>}
    {data && <>
      <p className="text-xs text-[var(--muted-foreground)]">{displayDashboardDate(data.fecha_desde)} al {displayDashboardDate(data.fecha_hasta)} · Hora de Chile
        {data.comparacion?.fecha_hasta && <> · Comparación: {displayDashboardDate(data.comparacion.fecha_desde)} al {displayDashboardDate(data.comparacion.fecha_hasta)}</>}</p>
      <DashboardAnalytics data={data} period={period} />
    </>}
  </section>;
}
