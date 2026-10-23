import { useState, useEffect, useRef } from "react"
import { EmptyListState, ErrorState, LoadingState } from "../../../shared/components/states"
import { humanizeAdminError } from "../utils/humanizeError"
import { formatReportMoney as formatPrice } from "../services/reportFormatting"
import { formatBusinessDate, chileanDateInput } from '../services/businessTime'
import { PickupSelectionSummary } from '../../storefront/components/checkout/PickupSchedule'
import { Badge, Icon, Input, Button, Select } from "../components/ui"
import { HistoryPagination } from '../components/HistoryControls'
import { useCommercialExport } from '../hooks/useCommercialHistory'
import { getOrderHistory, getOrderDetail, historyParams, emptyPagination, type HistoryOrder as StoreOrder } from '../services/commercialService'
import { approveManualTransfer, verifyTransfer } from "../services/pendingTransfersService"
import { describeShipmentEmail, updateOrderStatus } from '../services/recentOrdersService';
import { hasOrderFilters } from '../services/emptyStates';

import { Link, useSearchParams } from 'react-router-dom'
import { ORDER_STATUS_BADGE as STATUS_BADGE } from '../data/orderStatus'
import { readOrderFilters, orderDateInChile } from '../services/orderNavigation'

export default function Orders() {
  const [pedidos, setPedidos] = useState<StoreOrder[]>([])
  const [params, setParams] = useSearchParams()
  const filters = readOrderFilters(params)
  const filter = filters.status
  const selectedId = filters.selectedId
  const queryKey = historyParams(params).toString()
  const [pagination, setPagination] = useState(emptyPagination)
  const [detail, setDetail] = useState<StoreOrder | null>(null)
  const [detailError, setDetailError] = useState('')
  const file = useCommercialExport(queryKey)
  const detailRef = useRef<HTMLDivElement>(null)
  const updateParams = (changes: Record<string, string | null>) => {
    setParams(previous => {
      const next = new URLSearchParams(previous)
      Object.entries(changes).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key) })
      if (!('pagina' in changes) && !('pedido' in changes)) next.delete('pagina')
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
    if (filters.error) { setCargando(false); setPedidos([]); setPagination(emptyPagination); return () => controller.abort() }
    setCargando(true)
    const fetchPedidos = async () => {
      try {
        const result = await getOrderHistory(new URLSearchParams(queryKey), controller.signal)
        if (!controller.signal.aborted) { setPedidos(result.data); setPagination(result.paginacion) }
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'No se pudieron consultar los pedidos.');
      } finally {
        if (!controller.signal.aborted) setCargando(false);
      }
    };

    fetchPedidos();
    return () => controller.abort();
  }, [refreshKey, queryKey, filters.error]);

  useEffect(() => {
    const controller = new AbortController(); setDetail(null); setDetailError('');
    if (selectedId) getOrderDetail(selectedId, controller.signal).then(value => { if (!controller.signal.aborted) setDetail(value) })
      .catch(cause => { if (!controller.signal.aborted) setDetailError(cause instanceof Error ? cause.message : 'No se pudo cargar el detalle.') })
    return () => controller.abort()
  }, [selectedId, refreshKey])

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
      setRefreshKey(n => n + 1)
      const email = describeShipmentEmail(updated.correo);
      setVerifyMessage({
        type: email.failed ? 'error' : 'success',
        text: `Estado logístico actualizado a: ${updated.estado_etiqueta}${email.text ? `. ${email.text}` : ''}`,
      });
    } catch (cause) {
      setVerifyMessage({ type: 'error', text: cause instanceof Error ? cause.message : 'Error al actualizar el estado.' });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const filtered = filters.error ? [] : pedidos

  const selectedOrder = selectedId
    ? (detail?.id_pedido === selectedId ? detail : pedidos.find((p) => p.id_pedido === selectedId))
    : null

  // Limpiamos el mensaje de alerta si se cambia de pedido
  useEffect(() => {
    setVerifyMessage(null);
  }, [selectedId]);

  useEffect(() => {
    if (!cargando && selectedId) detailRef.current?.focus()
  }, [selectedId, cargando])

  const isVerifiableMethod = selectedOrder?.metodo_pago?.toLowerCase() === 'transferencia' || selectedOrder?.metodo_pago?.toLowerCase() === 'linkify';

  return (
    <div className="commercial-section space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">Histórico de pedidos de tu tienda, incluidos pendientes y cancelados. Solo los pagos confirmados suman ingresos en los informes.</p>
        <Button variant="outline" disabled={cargando || !!error || !!filters.error || file.busy} onClick={() => void file.download('pedidos/exportar/', historyParams(params), 'historico-pedidos.xlsx')}>{file.busy ? 'Preparando Excel...' : 'Exportar pedidos Excel'}</Button></div>
      {file.message && <p role="status">{file.message}</p>}{file.error && <p role="alert" className="text-red-700">{file.error}</p>}
      {['7', '30', 'year'].includes(params.get('periodo') || '') && <Link
        to={`/emprendedor?periodo=${params.get('periodo')}`} className="text-sm text-[var(--primary)] hover:underline focus-visible:outline focus-visible:outline-2 rounded">← Volver al dashboard</Link>}
      <div className="flex flex-wrap items-end gap-3">
        <Input id="orders-from" type="text" inputMode="numeric" placeholder="DD/MM/AAAA" label="Desde (DD/MM/AAAA)" value={/^\d{4}-\d{2}-\d{2}$/.test(filters.from) ? formatBusinessDate(filters.from) || filters.from : filters.from}
          onChange={event => updateParams({ fecha_desde: chileanDateInput(event.target.value), periodo: null })} />
        <Input id="orders-to" type="text" inputMode="numeric" placeholder="DD/MM/AAAA" label="Hasta (DD/MM/AAAA)" value={/^\d{4}-\d{2}-\d{2}$/.test(filters.to) ? formatBusinessDate(filters.to) || filters.to : filters.to}
          onChange={event => updateParams({ fecha_hasta: chileanDateInput(event.target.value), periodo: null })} />
        <Input id="orders-search" label="Buscar pedido, producto o SKU" maxLength={100} value={params.get('q') || ''} onChange={event => updateParams({ q: event.target.value || null })} />
        <Input id="orders-method" label="Método de pago" placeholder="Ej.: Transferencia" maxLength={50} value={params.get('metodo_pago') || ''} onChange={event => updateParams({ metodo_pago: event.target.value || null })} />
        <Select label="Estado de pago" value={params.get('pago') || ''} onChange={event => updateParams({ pago: event.target.value || null })} options={[{ value: '', label: 'Todos' }, { value: 'confirmado', label: 'Confirmado' }, { value: 'pendiente', label: 'Pendiente' }, { value: 'cancelado', label: 'Cancelado' }]} />
        <Select label="Método de entrega" value={params.get('entrega') || ''} onChange={event => updateParams({ entrega: event.target.value || null })} options={[{ value: '', label: 'Todos' }, { value: 'retiro', label: 'Retiro en tienda' }, { value: 'envio', label: 'Envío' }]} />
        <Button variant="outline" onClick={() => updateParams({ estado: null, fecha_desde: null, fecha_hasta: null, periodo: null, q: null, metodo_pago: null, pago: null, entrega: null })}>Limpiar filtros</Button>
      </div>
      {(filters.from || filters.to) && <p className="text-sm">Período: {formatBusinessDate(filters.from) || 'Sin inicio'} al {formatBusinessDate(filters.to) || 'Sin término'}</p>}
      <p className="text-xs text-[var(--muted-foreground)]">Fechas de registro del pedido en hora de Chile. {pagination.total} pedidos coinciden con los filtros. La exportación incluye todas las páginas filtradas.</p>
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
          {cargando ? <LoadingState spacing="none" className="p-5">Cargando pedidos...</LoadingState> : error ? <ErrorState className="m-5" onRetry={() => setRefreshKey(n => n + 1)} retryLabel="Reintentar pedidos">{humanizeAdminError(error)}</ErrorState> : filtered.length === 0 ? (
            <EmptyListState spacing="none" className="p-10">{hasOrderFilters(params) ? 'No hay pedidos que coincidan con los filtros.' : 'Aún no hay pedidos en tu tienda.'}</EmptyListState>
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
                        <p className="font-bold">{formatPrice(order.monto_total)}</p>
                        <Badge variant={st.variant} className="mt-1">
                          {st.label}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-[var(--muted-foreground)]">
                      <span>{order.metodo_pago || "No especificado"}</span>
                      <span>· Pago {order.pago_estado}</span>
                      <span>· {order.entrega?.metodo || 'Entrega sin registro'} · {order.items.reduce((sum, item) => sum + item.cantidad, 0)} unidades</span>
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
        <HistoryPagination page={pagination} disabled={cargando || !!error || !!filters.error} onPage={n => updateParams({ pagina: String(n) })} />
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
                    {item.sku && <p className="text-[var(--muted-foreground)]">SKU: {item.sku}</p>}
                  </div>
                  <p className="text-xs font-semibold">
                    {formatPrice(item.total_linea)}
                  </p>
                </div>
              ))}
            </div>

            <div className="border-t border-[var(--border)] pt-3 text-sm space-y-1">
              <PickupSelectionSummary selection={selectedOrder.entrega?.retiro?.seleccion} />
              <p className="text-xs">Entrega: {selectedOrder.entrega?.metodo || 'Sin registro'} · Pago {selectedOrder.pago_estado}</p>
              {selectedOrder.entrega?.retiro?.address && <p className="text-xs">Retiro: {selectedOrder.entrega.retiro.address}</p>}
              {selectedOrder.entrega?.direccion && <p className="text-xs">{Object.entries(selectedOrder.entrega.direccion).filter(([key, value]) => ['region', 'comuna', 'calle', 'numero', 'departamento', 'direccion'].includes(key) && typeof value === 'string').map(([, value]) => String(value)).join(', ')}</p>}
              {Number(selectedOrder.descuento) > 0 && (
                <div className="flex justify-between text-[var(--success)]">
                  <span>Descuento</span>
                  <span>−{formatPrice(selectedOrder.descuento)}</span>
                </div>
              )}
              <div className="flex justify-between text-[var(--muted-foreground)]">
                <span>Envío</span>
                <span>{formatPrice(selectedOrder.costo_envio)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span>{formatPrice(selectedOrder.monto_total)}</span>
              </div>
            </div>

          </div>
        ) : (
          <div className="bg-white border border-[var(--border)] rounded-xl p-10 text-center text-[var(--muted-foreground)]">
            <Icon name="file" className="w-9 h-9 mx-auto mb-3" />
            <p className="text-sm">
              {selectedId ? (detailError || "Consultando detalle del pedido...") : "Selecciona un pedido para ver sus detalles"}
            </p>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
