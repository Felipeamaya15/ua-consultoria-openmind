import { useState } from "react"
import { formatPrice, Order } from "../data/mockAdminData"
import { useAdmin } from "../context/AdminContext";
import { Badge, Icon } from "../components/ui"

const STATUS_BADGE: Record<string, {
  label: string
  variant: "default" | "info" | "warning" | "success" | "error"
}> = {
  pending: { label: "Pendiente", variant: "warning" },
  paid: { label: "Pagado", variant: "info" },
  preparing: { label: "Preparando", variant: "info" },
  shipped: { label: "Despachado", variant: "info" },
  delivered: { label: "Entregado", variant: "success" },
  refunded: { label: "Reembolsado", variant: "default" },
  cancelled: { label: "Cancelado", variant: "error" },
}

const PAYMENT_BADGE: Record<string, {
  label: string
  variant: "default" | "info" | "warning" | "success" | "error"
}> = {
  paid: { label: "Pagado", variant: "success" },
  pending: { label: "Pendiente", variant: "warning" },
  refunded: { label: "Reembolsado", variant: "default" },
  rejected: { label: "Rechazado", variant: "error" },
}

export default function Orders() {
  const { config, setConfig } = useAdmin(); const mockOrders = config.orders;
  const [filter, setFilter] = useState("all")
  const [selected, setSelected] = useState<string | null>(null)

  const filtered =
    filter === "all"
      ? mockOrders
      : mockOrders.filter((o) => o.status === filter)
  const selectedOrder = selected
    ? mockOrders.find((o) => o.id === selected)
    : null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      <div className="lg:col-span-3">
        {/* Filters */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {[
            ["all", "Todos"],
            ["pending", "Pendientes"],
            ["preparing", "Preparando"],
            ["shipped", "Despachados"],
            ["delivered", "Entregados"],
          ].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium whitespace-nowrap transition-colors ${
                filter === val
                  ? "bg-[var(--primary)] text-white"
                  : "bg-white border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-[var(--muted-foreground)] text-sm">
              No hay pedidos en esta categoría.
            </div>
          ) : (
            filtered.map((order) => {
              const st = STATUS_BADGE[order.status]
              const isSelected = selected === order.id
              return (
                <div
                  key={order.id}
                  role="button" tabIndex={0} aria-label={`Ver pedido ${order.number}`}
                  onKeyDown={event => {if(event.key === "Enter" || event.key === " "){event.preventDefault();setSelected(isSelected ? null : order.id);}}}
                  onClick={() => setSelected(isSelected ? null : order.id)}
                  className={`p-4 border-b border-[var(--border)] last:border-0 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-[var(--secondary)]"
                      : "hover:bg-[var(--muted)]/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-mono text-xs text-[var(--muted-foreground)]">
                        {order.number}
                      </p>
                      <p className="font-semibold text-sm mt-0.5">
                        {order.customer.name}
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {order.customer.email}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatPrice(order.total)}</p>
                      <Badge variant={st.variant} className="mt-1">
                        {st.label}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-[var(--muted-foreground)]">
                    <span>{order.paymentMethod}</span>
                    <span>·</span>
                    <span>{order.shippingMethod}</span>
                    <span>·</span>
                    <span>
                      {new Date(order.createdAt).toLocaleDateString("es-CL")}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Order detail panel */}
      <div className="lg:col-span-2">
        {selectedOrder ? (
          <div className="bg-white border border-[var(--border)] rounded-xl p-5 sticky top-20 flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs text-[var(--muted-foreground)]">
                  {selectedOrder.number}
                </p>
                <p className="font-bold">{selectedOrder.customer.name}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-[var(--muted)] rounded-lg p-3">
                <p className="text-[var(--muted-foreground)] mb-1">Pedido</p>
                <Badge variant={STATUS_BADGE[selectedOrder.status].variant}>
                  {STATUS_BADGE[selectedOrder.status].label}
                </Badge>
              </div>
              <div className="bg-[var(--muted)] rounded-lg p-3">
                <p className="text-[var(--muted-foreground)] mb-1">Pago</p>
                <Badge
                  variant={
                    PAYMENT_BADGE[selectedOrder.paymentStatus]?.variant ??
                    "default"
                  }
                >
                  {PAYMENT_BADGE[selectedOrder.paymentStatus]?.label ??
                    selectedOrder.paymentStatus}
                </Badge>
              </div>
            </div>

            <div className="text-sm space-y-1">
              <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2">
                Productos
              </p>
              {selectedOrder.items.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <img
                    src={item.image}
                    alt=""
                    className="w-8 h-8 rounded object-cover"
                  />
                  <div className="flex-1 text-xs">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-[var(--muted-foreground)]">
                      x{item.quantity}
                    </p>
                  </div>
                  <p className="text-xs font-semibold">
                    {formatPrice(item.price * item.quantity)}
                  </p>
                </div>
              ))}
            </div>

            <div className="border-t border-[var(--border)] pt-3 text-sm space-y-1">
              <div className="flex justify-between text-[var(--muted-foreground)]">
                <span>Subtotal</span>
                <span>{formatPrice(selectedOrder.subtotal)}</span>
              </div>
              {selectedOrder.discount > 0 && (
                <div className="flex justify-between text-[var(--success)]">
                  <span>Descuento</span>
                  <span>−{formatPrice(selectedOrder.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-[var(--muted-foreground)]">
                <span>Envío</span>
                <span>{formatPrice(selectedOrder.shipping)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span>{formatPrice(selectedOrder.total)}</span>
              </div>
            </div>

            {selectedOrder.trackingCode && (
              <div className="bg-[var(--muted)] rounded-xl p-3 text-xs">
                <p className="font-semibold mb-1">
                  Seguimiento {selectedOrder.carrier}
                </p>
                <p className="font-mono text-[var(--primary)]">
                  {selectedOrder.trackingCode}
                </p>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2">
                Cambiar estado
              </p>
              <select aria-label="Cambiar estado del pedido" value={selectedOrder.status} onChange={event => setConfig({...config,orders:config.orders.map(order => order.id === selectedOrder.id ? {...order,status:event.target.value as Order["status"],updatedAt:new Date().toISOString()} : order)})} className="w-full h-8 text-sm border border-[var(--border)] rounded-lg px-2 bg-white focus:outline-none">
                {Object.entries(STATUS_BADGE).map(([val, { label }]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-[var(--border)] rounded-xl p-10 text-center text-[var(--muted-foreground)]">
            <Icon name="file" className="w-9 h-9 mx-auto mb-3" />
            <p className="text-sm">
              Selecciona un pedido para ver sus detalles
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
