import { useEffect, useState } from 'react';
import { EmptyListState, ErrorState, LoadingState } from '../../../shared/components/states';
import { Link, useParams } from 'react-router-dom';
import { authService, type CustomerOrder } from '../../auth/services/authService';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';
import { CustomerAccountNavigation } from '../components/store/CustomerAccountNavigation';
import { formatBusinessDate } from '../../admin/services/businessTime';
import { formatReportMoney } from '../../admin/services/reportFormatting';
import { PickupSelectionSummary } from '../components/checkout/PickupSchedule';

export default function CustomerOrders() {
  const { id } = useParams();
  const { route } = useStorefrontTemplate();
  const [data, setData] = useState<CustomerOrder[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  
  useEffect(() => {
    let active = true;
    setData(null); setError('');
    const request = id ? authService.getCustomerOrder(id).then(order => [order]) : authService.getCustomerOrders();
    request.then(orders => {if (active) setData(orders);})
      .catch(err => {if (active) setError(err instanceof Error ? err.message : 'No se pudieron cargar los pedidos.');});
    return () => {active = false;};
  }, [id, attempt]);

  const mainOrderNumber = id && data?.[0] ? (data[0].identificador || `Pedido #${id}`) : (id ? `Pedido #${id}` : 'Mis pedidos');

  return (
    <main className="max-w-3xl mx-auto w-full p-6 space-y-5">
      <CustomerAccountNavigation />
      
      <h1 className="text-2xl font-semibold">{mainOrderNumber}</h1>
      
      {id && <Link data-page-action="ghost" to={route('mis-pedidos')} className="underline">Volver a mis pedidos</Link>}
      {error && <ErrorState onRetry={() => setAttempt(n => n + 1)}>{error}</ErrorState>}
      {!error && data === null && <LoadingState align="start" spacing="compact">Cargando pedidos…</LoadingState>}
      {!id && data?.length === 0 && <EmptyListState action={<Link data-page-action="ghost" to={route('catalogo')} className="font-medium text-[var(--primary)] hover:underline">Ver el catálogo</Link>}>Aún no tienes pedidos.</EmptyListState>}
      
      {data?.map(order => (
        <article data-visual-section="pagePanel" data-page-panel key={order.id_pedido} className="border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-lg">
            {order.identificador || `Pedido #${order.id_pedido}`}
          </h2>
          <p><time dateTime={order.fecha_creacion}>{formatBusinessDate(order.fecha_creacion, true)}</time></p>
          <p>Estado: <span className="inline-block rounded bg-[var(--visual-page-panel-background)] px-2 py-1">{order.estado_etiqueta}</span></p>
          <p>Productos: {order.cantidad_productos}</p>
          {Number(order.descuento) > 0 && <p>Descuento aplicado: −{formatReportMoney(order.descuento!)}</p>}
          <p>Total: {formatReportMoney(order.monto_total)}</p>
          <PickupSelectionSummary selection={order.entrega?.retiro?.seleccion} />
          
          {!id && <Link data-page-action="ghost" to={route(`mis-pedidos/${order.id_pedido}`)} className="font-medium text-[var(--primary)] hover:underline">Ver detalle y seguimiento</Link>}
          
          {id && (
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b">
                    <th className="py-2">Producto</th>
                    <th className="py-2">Cantidad</th>
                    <th className="py-2">Precio unitario</th>
                    <th className="py-2">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items?.map(item => (
                    <tr key={item.id_item_pedido} className="border-b last:border-0">
                      <td className="py-3">
                        {item.nombre}
                        {item.sku && (
                          <span className="block text-sm text-[var(--visual-page-color)] mt-1">
                            SKU: {item.sku} · {item.atributos_variante?.map(attribute => `${attribute.etiqueta}: ${attribute.valor}`).join(' · ')}
                          </span>
                        )}
                      </td>
                      <td className="py-3">{item.cantidad}</td>
                      <td className="py-3">{formatReportMoney(item.precio_unitario)}</td>
                      <td className="py-3">{formatReportMoney(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {order.items?.length === 0 && <p className="text-sm mt-3">Este pedido no tiene productos registrados.</p>}
            </div>
          )}
        </article>
      ))}
    </main>
  );
}
