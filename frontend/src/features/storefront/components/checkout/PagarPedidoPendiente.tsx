import { useState } from 'react';

import { pagarPedidoService } from '../../../checkout/services/pagarPedidoService';
import { useStorefrontTemplate } from '../../hooks/useStorefrontTemplate';
import { Button } from '../ui';

const PAGABLES = ['Transbank'];

interface Props {
  orderNumber?: string;
  estado?: string;
  medioPago?: string;
  // Correo de la compra (Seguimiento). Con sesion iniciada no hace falta: el servidor comprueba que el pedido sea del cliente.
  email?: string;
  conSesion?: boolean;
}

export function PagarPedidoPendiente({ orderNumber, estado, medioPago, email, conSesion }: Props) {
  const { route } = useStorefrontTemplate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!orderNumber || estado !== 'pendiente' || !medioPago || !PAGABLES.includes(medioPago)) return null;

  const pagar = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const destino = await pagarPedidoService.iniciar({
        orderNumber,
        email,
        conSesion,
        returnUrl: `${window.location.origin}${route('pedido-confirmado')}`,
      });
      pagarPedidoService.ir(destino);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos iniciar el pago. Intenta nuevamente.');
      setLoading(false);
    }
  };

  return (
    <div className="col-span-full flex flex-col gap-2" data-testid="pagar-pedido-pendiente">
      <p className="text-sm">Este pedido sigue pendiente de pago. Puedes pagarlo ahora con {medioPago === 'Transbank' ? 'Webpay' : medioPago}.</p>
      <div>
        <Button variant="primary" onClick={pagar} disabled={loading}>
          {loading ? 'Redirigiendo…' : 'Pagar ahora'}
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
