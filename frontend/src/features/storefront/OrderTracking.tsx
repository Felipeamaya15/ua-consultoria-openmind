import React, { useState } from 'react';
import { orderService, type TrackedOrder, type LineaTiempoPaso } from './services/orderService';

export const OrderTracking = () => {
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [orderData, setOrderData] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setOrderData(null);
    setLoading(true);

    try {
      const data = await orderService.track(orderNumber, email);
      setOrderData(data);
    } catch (err: any) {
      setError(err.message || 'No se pudo obtener la orden. Verifica el número y correo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Portal de Seguimiento</h2>

      <form onSubmit={handleSearch} className="mb-8 space-y-4 bg-white p-6 rounded-lg shadow-sm border">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Número de Orden</label>
          <input
            type="text"
            placeholder="Ej: ORD-20240101-ABCD"
            className="w-full border border-gray-300 p-2 rounded"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label>
          <input
            type="email"
            placeholder="correo@ejemplo.com"
            className="w-full border border-gray-300 p-2 rounded"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white p-2 rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Consultando...' : 'Consultar Estado'}
        </button>
      </form>

      {error && <p className="text-red-600 bg-red-50 p-4 rounded-lg border border-red-200">{error}</p>}

      {orderData && (
        <div className="border border-gray-200 p-6 rounded-lg bg-white shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h3 className="font-bold text-xl">Orden {orderData.identificador}</h3>
              <p className="text-gray-500 text-sm">Comprador: {orderData.nombre_contacto}</p>
            </div>
            <span className="bg-blue-100 text-blue-800 text-sm font-semibold px-3 py-1 rounded-full">
              {orderData.estado_label}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-4">
            {/* Se declaran explícitamente los tipos (LineaTiempoPaso y number) para resolver los errores ts(7006) */}
            {orderData.linea_tiempo.map((paso: LineaTiempoPaso, idx: number) => (
              <div
                key={idx}
                className={`p-3 text-center text-xs md:text-sm rounded-lg border ${
                  paso.actual ? 'bg-blue-600 border-blue-600 text-white font-bold shadow' :
                  paso.completado ? 'bg-green-50 border-green-200 text-green-700' :
                  'bg-gray-50 border-gray-200 text-gray-400'
                }`}
              >
                {paso.etiqueta}
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-gray-100">
            <h4 className="font-semibold text-sm mb-3">Detalle de productos</h4>
            <ul className="space-y-2 text-sm">
              {/* Se declaran explícitamente los tipos (any y number) para resolver los errores ts(7006) */}
              {orderData.items.map((item: any, i: number) => (
                <li key={i} className="flex justify-between">
                  <span>{item.nombre} x{item.cantidad}</span>
                  <span className="font-medium">${Number(item.precio_unitario).toLocaleString('es-CL')}</span>
                </li>
              ))}
            </ul>
            {Number(orderData.descuento) > 0 && (
              <div className="mt-4 flex justify-between text-sm text-[var(--success)]">
                <span>Descuento aplicado</span>
                <span>−${Number(orderData.descuento).toLocaleString('es-CL')}</span>
              </div>
            )}
            <div className="mt-4 flex justify-between font-bold text-lg">
              <span>Total pagado:</span>
              <span>${Number(orderData.monto_total).toLocaleString('es-CL')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};