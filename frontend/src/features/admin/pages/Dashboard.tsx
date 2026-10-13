import { useMemo, useState } from "react"
import { formatPrice } from "../data/mockAdminData"
import { Select } from "../components/ui"
import { useAdmin } from "../context/AdminContext";
import RecentOrders from "../components/dashboard/RecentOrders"

export default function Dashboard() {
  const { config } = useAdmin(); const mockOrders = config.orders;
  const [period, setPeriod] = useState("30")
  const periodOptions = [
    { value: "7", label: "Últimos 7 días" },
    { value: "30", label: "Últimos 30 días" },
    { value: "year", label: "Este año" },
  ]
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

      <RecentOrders />
    </div>
  )
}
