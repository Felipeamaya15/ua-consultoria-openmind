import { useState, useEffect } from "react"
import { formatPrice } from "../data/mockAdminData" // Mantenemos formatPrice
import { Badge, Icon } from "../components/ui"

const STATUS_BADGE: Record<string, {
  label: string
  variant: "default" | "info" | "warning" | "success" | "error"
}> = {
  pendiente: { label: "Pendiente", variant: "warning" },
  pagado: { label: "Pagado", variant: "info" },
  enviado: { label: "Enviado", variant: "info" },
  entregado: { label: "Entregado", variant: "success" },
  cancelado: { label: "Cancelado", variant: "error" },
}

export default function Orders() {
  const [pedidos, setPedidos] = useState<any[]>([])
  const [filter, setFilter] = useState("all")
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const fetchPedidos = async () => {
      try {
        const token = localStorage.getItem('token');
        
        // Asumiendo que el emprendedor tiene un token válido
        const response = await fetch('http://127.0.0.1:8000/api/tienda/pedidos/', {
          method: 'GET',
          headers: {
            'Authorization': `Token ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          setPedidos(data);
        } else {
          console.error("Error fetching pedidos");
        }
      } catch (error) {
        console.error("Error de red:", error);
      } finally {
        setCargando(false);
      }
    };

    fetchPedidos();
  }, []);

  const filtered = filter === "all"
    ? pedidos
    : pedidos.filter((p) => p.estado === filter)

  const selectedOrder = selectedId
    ? pedidos.find((p) => p.id_pedido === selectedId)
    : null

  if (cargando) {
    return <div className="p-10 text-center">Cargando pedidos...</div>
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      <div className="lg:col-span-3">
        {/* Filters */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {[
            ["all", "Todos"],
            ["pendiente", "Pendientes"],
            ["pagado", "Pagados"],
            ["enviado", "Enviados"],
            ["entregado", "Entregados"],
            ["cancelado", "Cancelados"]
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
              // Mapeo seguro del estado
              const statusKey = order.estado ? order.estado.toLowerCase() : "pendiente"
              const st = STATUS_BADGE[statusKey] || STATUS_BADGE["pendiente"]
              const isSelected = selectedId === order.id_pedido

              return (
                <div
                  key={order.id_pedido}
                  role="button" tabIndex={0} aria-label={`Ver pedido ${order.identificador}`}
                  onKeyDown={event => {if(event.key === "Enter" || event.key === " "){event.preventDefault();setSelectedId(isSelected ? null : order.id_pedido);}}}
                  onClick={() => setSelectedId(isSelected ? null : order.id_pedido)}
                  className={`p-4 border-b border-[var(--border)] last:border-0 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-[var(--secondary)]"
                      : "hover:bg-[var(--muted)]/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-mono text-xs text-[var(--muted-foreground)]">
                        {order.identificador}
                      </p>
                      <p className="font-semibold text-sm mt-0.5">
                        {order.nombre_contacto || "Sin nombre"}
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {order.correo_contacto || "Sin correo"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatPrice(Number(order.monto_total))}</p>
                      <Badge variant={st.variant} className="mt-1">
                        {st.label}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-[var(--muted-foreground)]">
                    <span>{order.metodo_pago || "No especificado"}</span>
                    <span>·</span>
                    <span>
                      {new Date(order.fecha_creacion).toLocaleDateString("es-CL")}
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
                  {selectedOrder.identificador}
                </p>
                <p className="font-bold">{selectedOrder.nombre_contacto || "Sin nombre"}</p>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-[var(--muted)] rounded-lg p-3">
                <p className="text-[var(--muted-foreground)] mb-1">Pedido</p>
                <Badge variant={STATUS_BADGE[selectedOrder.estado?.toLowerCase() || "pendiente"]?.variant || "warning"}>
                  {STATUS_BADGE[selectedOrder.estado?.toLowerCase() || "pendiente"]?.label || "Pendiente"}
                </Badge>
              </div>
              <div className="bg-[var(--muted)] rounded-lg p-3">
                <p className="text-[var(--muted-foreground)] mb-1">Pago</p>
                {/* En tu modelo no tienes un estado de pago separado, puedes ajustarlo después si es necesario */}
                <span className="font-medium text-xs text-[var(--muted-foreground)]">
                    {selectedOrder.metodo_pago || "No especificado"}
                </span>
              </div>
            </div>

            <div className="text-sm space-y-1">
              <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2">
                Productos
              </p>
              {selectedOrder.items && selectedOrder.items.map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2 mb-2 last:border-0">
                  <div className="flex-1 text-xs">
                    <p className="font-medium">{item.nombre_producto}</p>
                    <p className="text-[var(--muted-foreground)]">
                      Cantidad: {item.cantidad}
                    </p>
                  </div>
                  <p className="text-xs font-semibold">
                    {formatPrice(Number(item.precio_unitario) * item.cantidad)}
                  </p>
                </div>
              ))}
            </div>

            <div className="border-t border-[var(--border)] pt-3 text-sm space-y-1">
              {Number(selectedOrder.descuento) > 0 && (
                <div className="flex justify-between text-[var(--success)]">
                  <span>Descuento</span>
                  <span>−{formatPrice(Number(selectedOrder.descuento))}</span>
                </div>
              )}
              <div className="flex justify-between text-[var(--muted-foreground)]">
                <span>Envío</span>
                <span>{formatPrice(Number(selectedOrder.costo_envio))}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span>{formatPrice(Number(selectedOrder.monto_total))}</span>
              </div>
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