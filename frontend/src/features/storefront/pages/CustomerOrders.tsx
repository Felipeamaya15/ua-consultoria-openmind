import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { authService, type CustomerOrder } from '../../auth/services/authService';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';
import { CustomerAccountNavigation } from '../components/store/CustomerAccountNavigation';

export default function CustomerOrders() {
  const { id } = useParams();
  const { route } = useStorefrontTemplate();
  const [data, setData] = useState<CustomerOrder[] | null>(null);
  const [error, setError] = useState('');
  
  useEffect(() => {
    let active = true;
    setData(null); setError('');
    const request = id ? authService.getCustomerOrder(id).then(order => [order]) : authService.getCustomerOrders();
    request.then(orders => {if (active) setData(orders);})
      .catch(err => {if (active) setError(err instanceof Error ? err.message : 'No se pudieron cargar los pedidos.');});
    return () => {active = false;};
  }, [id]);

  const mainOrderNumber = id && data?.[0] ? (data[0].identificador || `Pedido #${id}`) : (id ? `Pedido #${id}` : 'Mis pedidos');

  return (
    <main className="max-w-3xl mx-auto w-full p-6 space-y-5">
      <CustomerAccountNavigation />
      
      <h1 className="text-2xl font-semibold">{mainOrderNumber}</h1>
      
      {id && <Link to={route('mis-pedidos')} className="underline">Volver a mis pedidos</Link>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {!error && data === null && <p role="status">Cargando pedidos…</p>}
      {!id && data?.length === 0 && <p>Aún no tienes pedidos.</p>}
      
      {data?.map(order => (
        <article key={order.id_pedido} className="border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-lg">
            {order.identificador || `Pedido #${order.id_pedido}`}
          </h2>
          <p><time dateTime={order.fecha_creacion}>{new Date(order.fecha_creacion).toLocaleString('es-CL')}</time></p>
          <p>Estado: <span className="inline-block rounded bg-gray-100 px-2 py-1">{order.estado_etiqueta}</span></p>
          <p>Productos: {order.cantidad_productos}</p>
          <p>Total: {order.monto_total}</p>
          
          {!id && <Link to={route(`mis-pedidos/${order.id_pedido}`)} className="font-medium text-[var(--primary)] hover:underline">Ver detalle y seguimiento</Link>}
          
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
                          <span className="block text-sm text-gray-500 mt-1">
                            SKU: {item.sku} · {item.atributos_variante?.map(attribute => `${attribute.etiqueta}: ${attribute.valor}`).join(' · ')}
                          </span>
                        )}
                      </td>
                      <td className="py-3">{item.cantidad}</td>
                      <td className="py-3">{item.precio_unitario}</td>
                      <td className="py-3">{item.subtotal}</td>
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