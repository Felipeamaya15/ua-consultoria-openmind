import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatPrice } from '../../data/mockAdminData';
import type { DashboardData } from '../../services/dashboardService';
import { dashboardBuckets, dashboardPeak, displayDashboardDate, type ChartBucket } from '../../services/dashboardAnalytics';
import { ordersDestination } from '../../services/orderNavigation';

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] rounded';
const panel = 'bg-white border border-[var(--border)] rounded-2xl p-5 sm:p-6 shadow-sm min-w-0';

function EvolutionChart({ buckets, type, period }: { buckets: ChartBucket[]; type: 'sales' | 'orders'; period: string }) {
  const [active, setActive] = useState<number | null>(null);
  const sales = type === 'sales';
  const values = buckets.map(b => sales ? b.sales : b.orders);
  const observedMaximum = Math.max(1, ...values);
  const maximum = sales ? observedMaximum : Math.ceil(observedMaximum / 2) * 2;
  const chosen = buckets[Math.min(active ?? buckets.length - 1, buckets.length - 1)];
  const amount = (value: number) => sales ? formatPrice(value) : `${value} pedidos`;
  const x = (index: number) => buckets.length === 1 ? 320 : 32 + index * 576 / (buckets.length - 1);
  const y = (value: number) => 200 - value / maximum * 180;
  const line = buckets.map((b, i) => `${i ? 'L' : 'M'}${x(i)},${y(sales ? b.sales : b.orders)}`).join(' ');
  const ticks = [maximum, maximum / 2, 0];
  const labels = [...new Set([0, Math.floor((buckets.length - 1) / 2), buckets.length - 1])].filter(i => i >= 0);
  const compact = (value: number) => sales
    ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', notation: 'compact', maximumFractionDigits: 1 }).format(value)
    : String(value);
  return <figure className="mt-5">
    <div className="flex gap-2">
      <div aria-hidden="true" className="w-12 shrink-0 flex flex-col justify-between pb-5 text-[10px] sm:text-xs text-[var(--muted-foreground)]">
        {ticks.map(tick => <span key={tick}>{compact(tick)}</span>)}
      </div>
      <div className="min-w-0 flex-1">
        <svg viewBox="0 0 640 220" width="100%" height="220" preserveAspectRatio="none" role="group"
          aria-label={sales ? 'Gráfico de ingresos confirmados. Selecciona un punto para consultar sus pedidos.' : 'Gráfico de cantidad de pedidos. Selecciona una barra para consultar sus pedidos.'}>
          {[20, 110, 200].map(v => <line key={v} x1="0" x2="640" y1={v} y2={v} stroke="var(--border)" strokeDasharray="4 5" />)}
          {sales && buckets.length > 0 && <>
            <path d={`${line} L${x(buckets.length - 1)},200 L${x(0)},200 Z`} fill="var(--primary)" opacity="0.08" />
            <path d={line} fill="none" stroke="var(--primary)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          </>}
          {buckets.map((bucket, index) => {
            const value = sales ? bucket.sales : bucket.orders;
            const label = bucket.from === bucket.to ? displayDashboardDate(bucket.from) : `${displayDashboardDate(bucket.from)} al ${displayDashboardDate(bucket.to)}`;
            const width = Math.min(46, 590 / Math.max(1, buckets.length));
            return <Link key={bucket.from} to={ordersDestination(bucket.from, bucket.to, sales ? 'confirmed' : 'all', period)}
              aria-label={`${sales ? 'Ventas' : 'Pedidos'} del ${label}: ${amount(value)}. Ver pedidos asociados`}
              onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} className={focus}>
              <title>{`${label}: ${amount(value)}`}</title>
              <rect x={Math.max(0, x(index) - width / 2)} y="0" width={width} height="210" fill="var(--primary)" opacity={active === index ? '0.05' : '0'} />
              {sales ? <circle cx={x(index)} cy={y(value)} r={active === index ? 6 : 4} fill="var(--primary)" stroke="white" strokeWidth="2" />
                : <rect x={x(index) - width / 2} y={y(value)} width={width} height={200 - y(value)} rx="4" fill="var(--primary)" opacity={active === index ? '1' : '0.65'} />}
            </Link>;
          })}
        </svg>
        <div aria-hidden="true" className="flex justify-between gap-2 text-[10px] sm:text-xs text-[var(--muted-foreground)]">
          {labels.map(index => <span key={index}>{buckets[index]?.label}</span>)}
        </div>
      </div>
    </div>
    <figcaption role="status" aria-live="polite" className="mt-4 min-h-12 text-xs sm:text-sm rounded-lg bg-[var(--muted)] px-3 py-2">
      {chosen ? <><span className="text-[var(--muted-foreground)]">{displayDashboardDate(chosen.from)}{chosen.to !== chosen.from ? ` al ${displayDashboardDate(chosen.to)}` : ''}</span>
        <strong className="block text-[var(--foreground)]">{amount(sales ? chosen.sales : chosen.orders)}</strong></> : 'Sin registros en el período.'}
    </figcaption>
  </figure>;
}

export default function DashboardAnalytics({ data, period }: { data: DashboardData; period: string }) {
  const { buckets, granularity } = dashboardBuckets(data.historico);
  const salesPeak = dashboardPeak(data.historico, 'ventas'), ordersPeak = dashboardPeak(data.historico, 'pedidos');
  return <div className="space-y-5">
    <section className={panel} aria-label="Evolución de ventas">
      <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-bold text-base">Evolución de ventas</h2><p className="text-xs text-[var(--muted-foreground)] mt-1">Ingresos confirmados · {granularity.toLowerCase()} · CLP</p></div>
        <p className="text-xl font-bold">{formatPrice(Number(data.total_ventas))}</p></div>
      {Number(data.total_ventas) === 0 && <p className="mt-4 text-sm text-[var(--muted-foreground)]">No hay ventas confirmadas para este período.</p>}
      <EvolutionChart buckets={buckets} type="sales" period={period} />
    </section>
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <section className={panel} aria-label="Evolución de pedidos"><h2 className="font-bold text-base">Evolución de pedidos</h2><p className="text-xs text-[var(--muted-foreground)] mt-1">{granularity} · Incluye todos los estados</p>
        {data.total_pedidos === 0 && <p className="mt-4 text-sm text-[var(--muted-foreground)]">No hay pedidos en el período seleccionado.</p>}
        <EvolutionChart buckets={buckets} type="orders" period={period} />
      </section>
      <section className={panel} aria-label="Distribución de pedidos por estado"><h2 className="font-bold text-base">Pedidos por estado</h2>
        <p className="text-xs text-[var(--muted-foreground)] mt-1">Estado actual de los pedidos registrados en el período</p>
        {!data.distribucion_estados ? <p className="mt-6 text-sm text-[var(--muted-foreground)]">Distribución no disponible en esta respuesta.</p> : data.total_pedidos === 0 ? <p className="mt-6 text-sm text-[var(--muted-foreground)]">Aún no hay pedidos para distribuir.</p> :
          <div className="mt-5 space-y-3">{data.distribucion_estados.map(row => <Link key={row.estado}
            to={ordersDestination(data.fecha_desde, data.fecha_hasta, row.estado, period)} aria-label={`${row.etiqueta}: ${row.pedidos} pedidos. Ver pedidos de este estado`}
            className={`block group ${focus}`}>
            <span className="flex justify-between gap-3 text-xs mb-1"><span className="group-hover:underline">{row.etiqueta}</span><strong>{row.pedidos} <span aria-hidden="true">→</span></strong></span>
            <div className="h-2 rounded-full bg-[var(--muted)] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${row.pedidos / data.total_pedidos * 100}%`, background: row.estado === 'cancelado' ? 'var(--muted-foreground)' : row.estado === 'entregado' ? 'var(--success, #23836a)' : 'var(--primary)' }} /></div>
          </Link>)}</div>}
      </section>
    </div>
    <section className={panel} aria-label="Actividad destacada"><h2 className="font-bold text-base">Actividad destacada</h2><p className="text-xs text-[var(--muted-foreground)] mt-1">Máximos diarios del período, sin estimaciones</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">{[
        { title: 'Día con más ventas', peak: salesPeak, filter: 'confirmed', amount: salesPeak ? formatPrice(salesPeak.value) : '' },
        { title: 'Día con más pedidos', peak: ordersPeak, filter: 'all', amount: ordersPeak ? `${ordersPeak.value} pedidos` : '' },
      ].map(item => <div key={item.title} className="rounded-xl bg-[var(--muted)] p-4"><p className="text-xs text-[var(--muted-foreground)]">{item.title}</p>
        {item.peak ? <Link className={`block mt-2 ${focus}`} to={ordersDestination(item.peak.date, item.peak.date, item.filter, period)}><strong>{displayDashboardDate(item.peak.date)} <span aria-hidden="true">→</span></strong><span className="block text-sm mt-1">{item.amount}</span>{item.peak.ties > 1 && <span className="text-xs text-[var(--muted-foreground)]">Primer día de {item.peak.ties} con el mismo máximo</span>}</Link>
          : <p className="text-sm mt-2">Sin actividad para este indicador.</p>}
      </div>)}</div>
    </section>
    <details className={panel}><summary className={`cursor-pointer font-semibold text-sm ${focus}`}>Ver tabla diaria de ventas y pedidos</summary>
      <p className="text-xs text-[var(--muted-foreground)] mt-3">{displayDashboardDate(data.fecha_desde)} al {displayDashboardDate(data.fecha_hasta)} · Hora de Chile · Fecha de registro del pedido</p>
      {data.total_pedidos === 0 ? <p className="py-5 text-sm">No hay pedidos en el período seleccionado.</p> : <div className="overflow-x-auto max-h-96 mt-4" tabIndex={0} role="region" aria-label="Histórico diario">
        <table className="w-full text-left border-collapse text-sm"><caption className="sr-only">Ventas confirmadas y pedidos registrados por día</caption>
          <thead><tr className="border-b border-[var(--border)]"><th scope="col" className="p-3">Fecha</th><th scope="col" className="p-3 text-right">Ventas (CLP)</th><th scope="col" className="p-3 text-right">Pedidos</th></tr></thead>
          <tbody className="divide-y divide-[var(--border)]">{data.historico.map(row => <tr key={row.fecha}><td className="p-3 whitespace-nowrap"><Link to={ordersDestination(row.fecha, row.fecha, 'all', period)} aria-label={`Ver pedidos del ${displayDashboardDate(row.fecha)}`} className={`text-[var(--primary)] hover:underline ${focus}`}>{displayDashboardDate(row.fecha)} <span aria-hidden="true">→</span></Link></td><td className="p-3 text-right whitespace-nowrap">{formatPrice(Number(row.ventas))}</td><td className="p-3 text-right">{row.pedidos}</td></tr>)}</tbody>
        </table></div>}
    </details>
  </div>;
}
