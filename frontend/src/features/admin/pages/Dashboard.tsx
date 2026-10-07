import { useMemo, useState } from "react"
import { formatPrice } from "../data/mockAdminData"
import { Badge, Select } from "../components/ui"
import { useAdmin } from "../context/AdminContext";
import { Link } from "react-router-dom"

export default function Dashboard() {
  const { config } = useAdmin(); const mockOrders = config.orders;
  const [period, setPeriod] = useState("30")
  const periodOptions = [
    { value: "7", label: "Últimos 7 días" },
    { value: "30", label: "Últimos 30 días" },
    { value: "year", label: "Este año" },
  ]
  const periodLabel = periodOptions.find((option) => option.value === period)?.label ?? "Últimos 30 días"
  const periodOrders = useMemo(() => {
    const latestOrderDate = Math.max(...mockOrders.map((order) => new Date(order.createdAt).getTime()))
    const days = period === "year" ? 365 : Number(period)
    const startDate = latestOrderDate - days * 24 * 60 * 60 * 1000
    return mockOrders.filter((order) => new Date(order.createdAt).getTime() >= startDate)
  }, [period, mockOrders])
  const totalSales = periodOrders.reduce((acc, o) => acc + o.total, 0)
  const totalOrders = periodOrders.length
  const pendingOrders = periodOrders.filter(
    (o) => o.status === "pending" || o.status === "paid",
  ).length

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">
            Resumen de la Tienda
          </h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Bienvenido a tu panel de control comercial.
          </p>
        </div>
        <div className="w-full sm:w-52">
          <Select
            label="Período"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            options={periodOptions}
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white border border-[var(--border)] p-5 rounded-2xl shadow-sm">
          <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase">
            Ventas Totales
          </p>
          <p className="text-3xl font-bold text-[var(--foreground)] mt-2">
            {formatPrice(totalSales)}
          </p>
          <span className="text-xs text-[var(--success)] font-medium mt-1 inline-block">
            Total del período seleccionado
          </span>
        </div>

        <div className="bg-white border border-[var(--border)] p-5 rounded-2xl shadow-sm">
          <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase">
            Órdenes Totales
          </p>
          <p className="text-3xl font-bold text-[var(--foreground)] mt-2">
            {totalOrders}
          </p>
          <span className="text-xs text-[var(--muted-foreground)] mt-1 inline-block">
            Pedidos procesados
          </span>
        </div>

        <div className="bg-white border border-[var(--border)] p-5 rounded-2xl shadow-sm">
          <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase">
            Por Despachar
          </p>
          <p className="text-3xl font-bold text-[var(--warning)] mt-2">
            {pendingOrders}
          </p>
          <span className="text-xs text-[var(--warning)] font-medium mt-1 inline-block">
            Requieren atención
          </span>
        </div>
      </div>

      {/* Recent Orders Table */}
      <div className="bg-white border border-[var(--border)] rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-base">Últimos Pedidos</h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">{periodLabel}</p>
          </div>
          <Link
            to="/emprendedor/pedidos"
            className="text-xs text-[var(--primary)] font-semibold hover:underline"
          >
            Ver todos →
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs text-[var(--muted-foreground)] uppercase">
                <th className="py-3 px-2">Orden</th>
                <th className="py-3 px-2">Cliente</th>
                <th className="py-3 px-2">Estado</th>
                <th className="py-3 px-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-sm">
              {periodOrders.slice(0, 5).map((order) => (
                <tr
                  key={order.id}
                  className="hover:bg-[var(--muted)]/50 transition-colors"
                >
                  <td className="py-3 px-2 font-mono font-semibold">
                    {order.number}
                  </td>
                  <td className="py-3 px-2">{order.customer.name}</td>
                  <td className="py-3 px-2">
                    <Badge
                      variant={
                        order.status === "delivered" ? "success" : "warning"
                      }
                    >
                      {{pending:"Pendiente",paid:"Pagado",preparing:"Preparando",shipped:"Despachado",delivered:"Entregado",cancelled:"Cancelado",refunded:"Reembolsado"}[order.status]}
                    </Badge>
                  </td>
                  <td className="py-3 px-2 text-right font-bold">
                    {formatPrice(order.total)}
                  </td>
                </tr>
              ))}
              {periodOrders.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-sm text-[var(--muted-foreground)]">
                    No hay pedidos en el período seleccionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
