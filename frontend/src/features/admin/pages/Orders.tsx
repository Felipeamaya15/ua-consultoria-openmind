import { useState, useEffect, useRef } from "react"
import { formatPrice } from "../data/mockAdminData"
import { Badge, Icon, Input, Button } from "../components/ui"
import { API_BASE_URL } from "../../../api"
import { authService } from "../../auth/services/authService"
import { approveManualTransfer, verifyTransfer } from "../services/pendingTransfersService"
import { updateOrderStatus } from '../services/recentOrdersService';

import { Link, useSearchParams } from 'react-router-dom'
import { ORDER_STATUS_BADGE as STATUS_BADGE } from '../data/orderStatus'
import { readOrderFilters, filterStoreOrders, orderDateInChile } from '../services/orderNavigation'

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

export default function Orders() {
  const [pedidos, setPedidos] = useState<StoreOrder[]>([])
  const [params, setParams] = useSearchParams()
  const filters = readOrderFilters(params)
  const filter = filters.status
  const selectedId = filters.selectedId
  const detailRef = useRef<HTMLDivElement>(null)
  const updateParams = (changes: Record<string, string | null>) => {
    setParams(previous => {
      const next = new URLSearchParams(previous)
      Object.entries(changes).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key) })
      return next
    })
  }
  const setFilter = (value: string) => updateParams({ estado: value === 'all' ? null : value })
  const setSelectedId = (value: number | null) => updateParams({ pedido: value ? String(value) : null })
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  // Estados para la validación activa de Linkify y cambios de estado
  const [verifying, setVerifying] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [verifyMessage, setVerifyMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setError('')
    const fetchPedidos = async () => {
      try {
        const token = authService.getToken();
        if (!token) throw new Error('Inicia sesión para consultar los pedidos.');

        const response = await fetch(`${API_BASE_URL}/api/tienda/pedidos/`, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'Authorization': `Token ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (!Array.isArray(data) || !data.every(isStoreOrder)) throw new Error('El listado de pedidos recibido es inválido.');
          if (!controller.signal.aborted) setPedidos(data);
        } else {
          throw new Error('No se pudieron consultar los pedidos.');
        }
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'No se pudieron consultar los pedidos.');
      } finally {
        if (!controller.signal.aborted) setCargando(false);
      }
    };

    fetchPedidos();
    return () => controller.abort();
  }, [refreshKey]);

  // Manejador del botón verificar pagos
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
      setRefreshKey(prev => prev + 1);
    } catch (cause) {
      setVerifyMessage({ type: 'error', text: cause instanceof Error ? cause.message : 'Error al verificar el pago.' });
    } finally {
      setVerifying(false);
    }
  };

  // El backend valida la actualización; la tabla usa siempre su estado confirmado.
  const handleStatusChange = async (pedidoId: number, nuevoEstado: string) => {
    setUpdatingStatus(true);
    setVerifyMessage(null);
    try {
      const updated = await updateOrderStatus(pedidoId, nuevoEstado);
      setPedidos(previous => previous.map(order =>
        order.id_pedido === pedidoId ? { ...order, estado: updated.estado } : order
      ));
      setVerifyMessage({ type: 'success', text: `Estado logístico actualizado a: ${updated.estado_etiqueta}` });
    } catch (cause) {
      setVerifyMessage({ type: 'error', text: cause instanceof Error ? cause.message : 'Error al actualizar el estado.' });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const filtered = filterStoreOrders(pedidos, filters)

  const selectedOrder = selectedId
    ? pedidos.find((p) => p.id_pedido === selectedId)
    : null

  // Limpiamos el mensaje de alerta si se cambia de pedido
  useEffect(() => {
    setVerifyMessage(null);
  }, [selectedId]);

  useEffect(() => {
    if (!cargando && selectedId) detailRef.current?.focus()
  }, [selectedId, cargando])

  if (cargando) {
    return <div className="p-10 text-center">Cargando pedidos...</div>
  }
  if (error) return <p role="alert" className="p-5 text-red-700">{error}</p>

  const isVerifiableMethod = selectedOrder?.metodo_pago?.toLowerCase() === 'transferencia' || selectedOrder?.metodo_pago?.toLowerCase() === 'linkify';

  return (
    <div className="space-y-4">
      {['7', '30', 'year'].includes(params.get('periodo') || '') && <Link
        to={`/emprendedor?periodo=${params.get('periodo')}`} className="text-sm text-[var(--primary)] hover:underline focus-visible:outline focus-visible:outline-2 rounded">← Volver al dashboard</Link>}
      <div className="flex flex-wrap items-end gap-3">
        <Input id="orders-from" type="date" label="Desde" value={filters.from}
          onChange={event => updateParams({ fecha_desde: event.target.value, periodo: null })} />
        <Input id="orders-to" type="date" label="Hasta" value={filters.to}
          onChange={event => updateParams({ fecha_hasta: event.target.value, periodo: null })} />
        <Button variant="outline" onClick={() => updateParams({ estado: null, fecha_desde: null, fecha_hasta: null, periodo: null })}>Limpiar filtros</Button>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">Fechas de registro del pedido en hora de Chile. {filtered.length} pedidos coinciden con los filtros.</p>
      {filters.error && <p role="alert" className="text-sm text-[var(--error)]">{filters.error}</p>}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      <div className="lg:col-span-3">
        {/* Filters */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {[
            ["all", "Todos"],
            ["confirmed", "Pagos confirmados"],
            ["dispatch", "Por despachar"],
            ["pendiente", "Pendientes"],
            ["pagado", "Pagados"],
            ["preparando", "Preparando"],
            ["en_origen", "En origen"],
            ["enviado", "En tránsito"],
            ["en_reparto", "En reparto"],
            ["entregado", "Entregados"],
            ["cancelado", "Cancelados"]
          ].map(([val, label]) => (
            <button
              key={val}
              aria-pressed={filter === val}
              onClick={() => setFilter(val)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] ${
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
              No hay pedidos que coincidan con los filtros.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {filtered.map((order) => {
                const statusKey = order.estado ? order.estado.toLowerCase() : "pendiente"
                const st = STATUS_BADGE[statusKey] || STATUS_BADGE["pendiente"]
                const isSelected = selectedId === order.id_pedido

                return (
                  <div
                    key={order.id_pedido}
                    role="button" tabIndex={0} aria-label={`Ver pedido ${order.identificador || `#${order.id_pedido}`}`} aria-expanded={isSelected}
                    onKeyDown={event => {if(event.key === "Enter" || event.key === " "){event.preventDefault();setSelectedId(isSelected ? null : order.id_pedido);}}}
                    onClick={() => setSelectedId(isSelected ? null : order.id_pedido)}
                    className={`p-4 border-b border-[var(--border)] last:border-0 cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] ${
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
                        {orderDateInChile(order.fecha_creacion).split("-").reverse().join("/")}
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
          <div ref={detailRef} tabIndex={-1} role="region" aria-label={`Detalle del pedido ${selectedOrder.identificador || `#${selectedOrder.id_pedido}`}`} className="bg-white border border-[var(--border)] rounded-xl p-5 sticky top-20 flex flex-col gap-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs text-[var(--muted-foreground)]">
                  {selectedOrder.identificador}
                </p>
                <p className="font-bold">{selectedOrder.nombre_contacto || "Sin nombre"}</p>
              </div>
              <button
                aria-label="Cerrar detalle del pedido"
                onClick={() => setSelectedId(null)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1"
              >
                ✕
              </button>
            </div>

            {verifyMessage && (
              <div role={verifyMessage.type === 'error' ? 'alert' : 'status'} className={`p-3 rounded-lg text-xs font-medium ${verifyMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {verifyMessage.text}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-[var(--muted)] rounded-lg p-3">
                <p className="text-[var(--muted-foreground)] mb-1">Estado</p>

                {/* SCRUM-379: Selector de actualización de Estados */}
                <select
                  value={selectedOrder.estado?.toLowerCase() || "pendiente"}
                  aria-label="Estado del pedido"
                  disabled={updatingStatus || verifying}
                  onChange={(e) => handleStatusChange(selectedOrder.id_pedido, e.target.value)}
                  className="w-full mt-1 border border-[var(--border)] rounded-md p-1.5 text-xs bg-white focus:ring-2 focus:ring-[var(--primary)] outline-none disabled:opacity-50 transition-opacity"
                >
                  {Object.entries(STATUS_BADGE).map(([key, config]) => (
                    <option key={key} value={key}>{config.label}</option>
                  ))}
                </select>
              </div>

              <div className="bg-[var(--muted)] rounded-lg p-3 flex flex-col items-start justify-center">
                <p className="text-[var(--muted-foreground)] mb-1">Pago</p>
                <span className="font-medium text-xs text-[var(--muted-foreground)]">
                    {selectedOrder.metodo_pago || "No especificado"}
                </span>

                {isVerifiableMethod && selectedOrder.estado?.toLowerCase() === 'pendiente' && (
                  <button
                    onClick={() => handlePaymentConfirmation(selectedOrder)}
                    disabled={verifying || updatingStatus}
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
              {selectedId ? "El pedido solicitado no se encuentra disponible en esta tienda." : "Selecciona un pedido para ver sus detalles"}
            </p>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
