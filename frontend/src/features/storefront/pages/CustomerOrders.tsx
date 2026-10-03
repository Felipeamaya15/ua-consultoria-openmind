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
  return <main className="max-w-3xl mx-auto w-full p-6 space-y-5">
    <CustomerAccountNavigation />
    <h1 className="text-2xl font-semibold">{id ? `Pedido #${id}` : 'Mis pedidos'}</h1>
    {id && <Link to={route('mis-pedidos')} className="underline">Volver a mis pedidos</Link>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!error && data === null && <p role="status">Cargando pedidos…</p>}
    {!id && data?.length === 0 && <p>Aún no tienes pedidos.</p>}
    {data?.map(order => <article key={order.id_pedido} className="border rounded-xl p-5 space-y-3">
      <h2 className="font-semibold">Pedido #{order.id_pedido}</h2>
      <p><time dateTime={order.fecha_creacion}>{new Date(order.fecha_creacion).toLocaleString('es-CL')}</time></p>
      <p>Estado: <span className="inline-block rounded bg-gray-100 px-2 py-1">{order.estado_etiqueta}</span></p>
      <p>Productos: {order.cantidad_productos}</p>
      <p>Total: {order.monto_total}</p>
      {!id && <Link to={route(`mis-pedidos/${order.id_pedido}`)} className="underline">Ver detalle y seguimiento</Link>}
      {id && <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio unitario</th><th>Subtotal</th></tr></thead>
        <tbody>{order.items?.map(item => <tr key={item.id_item_pedido}><td>{item.nombre}{item.sku && <span className="block text-sm">SKU: {item.sku} · {item.atributos_variante?.map(attribute => `${attribute.etiqueta}: ${attribute.valor}`).join(' · ')}</span>}</td><td>{item.cantidad}</td><td>{item.precio_unitario}</td><td>{item.subtotal}</td></tr>)}</tbody>
      </table>{order.items?.length === 0 && <p>Este pedido no tiene productos registrados.</p>}</div>}
    </article>)}
  </main>;
}
