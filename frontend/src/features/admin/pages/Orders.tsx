import { useState, useEffect } from "react"
import { formatPrice } from "../data/mockAdminData"
import { Badge, Icon } from "../components/ui"
import { API_BASE_URL } from "../../../api"
import { authService } from "../../auth/services/authService"
import { approveManualTransfer, verifyTransfer } from "../services/pendingTransfersService"

type StoreOrder = {
  id_pedido: number; identificador: string | null; nombre_contacto: string; correo_contacto: string;
  monto_total: string; estado: string; fecha_creacion: string; metodo_pago: string;
  costo_envio: string; descuento: string;
  items: { nombre_producto: string; cantidad: number; precio_unitario: string }[];
}

function isStoreOrder(value: unknown): value is StoreOrder {
  if (!value || typeof value !== 'object') return false
  const order = value as Record<string, unknown>
  return typeof order.id_pedido === 'number'
    && (typeof order.identificador === 'string' || order.identificador === null)
    && ['nombre_contacto', 'correo_contacto', 'estado', 'metodo_pago'].every(key => typeof order[key] === 'string')
    && typeof order.fecha_creacion === 'string' && Number.isFinite(Date.parse(order.fecha_creacion))
    && ['monto_total', 'costo_envio', 'descuento'].every(key => typeof order[key] === 'string'
      && String(order[key]).trim() !== '' && Number.isFinite(Number(order[key])))
    && Array.isArray(order.items) && order.items.every(item => item && typeof item === 'object'
      && typeof item.nombre_producto === 'string' && Number.isInteger(item.cantidad) && item.cantidad > 0
      && typeof item.precio_unitario === 'string' && item.precio_unitario.trim() !== ''
      && Number.isFinite(Number(item.precio_unitario)))
}

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
  const [pedidos, setPedidos] = useState<StoreOrder[]>([])
  const [filter, setFilter] = useState("all")
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  // Estados para la validación activa de Linkify
  const [verifying, setVerifying] = useState(false)
  const [verifyMessage, setVerifyMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    const fetchPedidos = async () => {
      try {
        const token = authService.getToken();
        if (!token) throw new Error('Inicia sesión para consultar los pedidos.');
        
        const response = await fetch(`${API_BASE_URL}/api/tienda/pedidos/`, {
          method: 'GET',
          headers: {
            'Authorization': `Token ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (!Array.isArray(data) || !data.every(isStoreOrder)) throw new Error('El listado de pedidos recibido es inválido.');
          setPedidos(data);
        } else {
          throw new Error('No se pudieron consultar los pedidos.');
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : 'No se pudieron consultar los pedidos.');
      } finally {
        setCargando(false);
      }
    };

    fetchPedidos();
  }, [refreshKey]);

  // Manejador del botón verificar
  const handlePaymentConfirmation = async (order: StoreOrder) => {
    const isManualTransfer = order.metodo_pago.trim().toLowerCase() === 'transferencia';
    if (isManualTransfer && !window.confirm(`¿Confirmas que recibiste el pago del pedido ${order.identificador || `#${order.id_pedido}`}?`)) return;
    setVerifying(true);
    setVerifyMessage(null);
    try {
      const result = isManualTransfer
        ? await approveManualTransfer(order.id_pedido)
        : await verifyTransfer(order.id_pedido);
      setVerifyMessage({ type: 'success', text: result.mensaje });
      // Recargamos la lista para que cambie el estado visual a "Pagado"
      setRefreshKey(prev => prev + 1);
    } catch (cause) {
      setVerifyMessage({ type: 'error', text: cause instanceof Error ? cause.message : 'Error al verificar el pago.' });
    } finally {
      setVerifying(false);
    }
  };

  const filtered = filter === "all"
    ? pedidos
    : pedidos.filter((p) => p.estado === filter)

  const selectedOrder = selectedId
    ? pedidos.find((p) => p.id_pedido === selectedId)
    : null

  // Limpiamos el mensaje de verificación si se cambia de pedido
  useEffect(() => {
    setVerifyMessage(null);
  }, [selectedId]);

  if (cargando) {
    return <div className="p-10 text-center">Cargando pedidos...</div>
  }
  if (error) return <p role="alert" className="p-5 text-red-700">{error}</p>

  // Verifica si el método de pago aplica para verificación
  const isVerifiableMethod = selectedOrder?.metodo_pago?.toLowerCase() === 'transferencia' || selectedOrder?.metodo_pago?.toLowerCase() === 'linkify';

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
            <div className="divide-y divide-[var(--border)]">
              {filtered.map((order) => {
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
              })}
            </div>
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

            {verifyMessage && (
              <div className={`p-3 rounded-lg text-xs font-medium ${verifyMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {verifyMessage.text}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-[var(--muted)] rounded-lg p-3">
                <p className="text-[var(--muted-foreground)] mb-1">Pedido</p>
                <Badge variant={STATUS_BADGE[selectedOrder.estado?.toLowerCase() || "pendiente"]?.variant || "warning"}>
                  {STATUS_BADGE[selectedOrder.estado?.toLowerCase() || "pendiente"]?.label || "Pendiente"}
                </Badge>
              </div>
              
              <div className="bg-[var(--muted)] rounded-lg p-3 flex flex-col items-start justify-center">
                <p className="text-[var(--muted-foreground)] mb-1">Pago</p>
                <span className="font-medium text-xs text-[var(--muted-foreground)]">
                    {selectedOrder.metodo_pago || "No especificado"}
                </span>
                
                {/* BOTÓN DE VERIFICACIÓN: Aparece si es Transferencia o Linkify y está Pendiente */}
                {isVerifiableMethod && selectedOrder.estado?.toLowerCase() === 'pendiente' && (
                  <button 
                    onClick={() => handlePaymentConfirmation(selectedOrder)}
                    disabled={verifying}
                    className="mt-2 text-xs bg-[var(--primary)] hover:opacity-90 text-white py-1.5 px-3 rounded shadow-sm transition-opacity disabled:opacity-50"
                  >
                    {verifying
                      ? (selectedOrder.metodo_pago.toLowerCase() === 'transferencia' ? "Aprobando..." : "Consultando...")
                      : (selectedOrder.metodo_pago.toLowerCase() === 'transferencia' ? "Aprobar pago" : "Verificar pago")}
                  </button>
                )}
              </div>
            </div>

            <div className="text-sm space-y-1">
              <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-2">
                Productos
              </p>
              {selectedOrder.items.map((item, i) => (
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
