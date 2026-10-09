import { useEffect, useState } from 'react';
import { Alert, Button } from './ui';
import { formatPrice } from '../data/mockAdminData';
import { approveManualTransfer, getPendingTransfers, type PendingTransfer } from '../services/pendingTransfersService';

const dateFormat = new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' });

export function PendingTransfers() {
  const [transfers, setTransfers] = useState<PendingTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getPendingTransfers(controller.signal).then(data => {
      if (!controller.signal.aborted) setTransfers(data);
    }).catch(cause => {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las transferencias pendientes.');
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [refresh]);

  const approve = async (transfer: PendingTransfer) => {
    if (!window.confirm(`¿Confirmas que recibiste el pago del pedido ${transfer.identificador || `#${transfer.id_pedido}`}?`)) return;
    setApprovingId(transfer.id_pedido);
    setError('');
    setFeedback('');
    try {
      const result = await approveManualTransfer(transfer.id_pedido);
      setTransfers(current => current.filter(item => item.id_pedido !== transfer.id_pedido));
      setFeedback(result.mensaje);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo aprobar la transferencia.');
    } finally {
      setApprovingId(null);
    }
  };

  return <section className="border-t border-[var(--border)] pt-3 mt-4" aria-label="Transferencias pendientes" aria-busy={loading}>
    <div className="flex items-center justify-between gap-3 mb-3">
      <div>
        <h3 className="text-sm font-semibold">Transferencias pendientes de verificación</h3>
        <p className="text-xs text-[var(--muted-foreground)]">Pedidos por transferencia bancaria que todavía no figuran como pagados.</p>
      </div>
      <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => setRefresh(value => value + 1)}>
        {error ? 'Reintentar' : 'Actualizar'}
      </Button>
    </div>
    {loading && <p className="text-sm text-[var(--muted-foreground)]" role="status">Cargando transferencias pendientes…</p>}
    {!loading && error && <Alert variant="error">{error}</Alert>}
    {!loading && feedback && <Alert variant="success">{feedback}</Alert>}
    {!loading && !error && (transfers.length === 0
      ? <p className="text-sm text-[var(--muted-foreground)]">No hay transferencias pendientes de verificación.</p>
      : <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <caption className="sr-only">Transferencias pendientes, más recientes primero</caption>
          <thead><tr className="border-b border-[var(--border)]">
            <th scope="col" className="py-2 pr-3">Pedido</th>
            <th scope="col" className="py-2 pr-3">Cliente</th>
            <th scope="col" className="py-2 pr-3">Monto</th>
            <th scope="col" className="py-2">Fecha</th>
            <th scope="col" className="py-2 pl-3 text-right">Acción</th>
          </tr></thead>
          <tbody>{transfers.map(transfer => <tr key={transfer.id_pedido} className="border-b border-[var(--border)] last:border-0">
            <td className="py-3 pr-3 whitespace-nowrap">{transfer.identificador || `Pedido #${transfer.id_pedido}`}</td>
            <td className="py-3 pr-3"><p>{transfer.nombre_contacto || 'Cliente sin nombre'}</p><p className="text-xs text-[var(--muted-foreground)]">{transfer.correo_contacto}</p></td>
            <td className="py-3 pr-3 whitespace-nowrap">{formatPrice(Number(transfer.monto_total))}</td>
            <td className="py-3 whitespace-nowrap"><time dateTime={transfer.fecha_creacion}>{dateFormat.format(new Date(transfer.fecha_creacion))}</time></td>
            <td className="py-3 pl-3 text-right">
              <Button
                type="button"
                size="sm"
                disabled={approvingId !== null}
                loading={approvingId === transfer.id_pedido}
                onClick={() => approve(transfer)}
              >
                Aprobar pago
              </Button>
            </td>
          </tr>)}</tbody>
        </table>
      </div>)}
  </section>;
}
