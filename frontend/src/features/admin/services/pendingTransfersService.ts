import { requestEnvelope } from '../../../shared/services/apiRequest';
import { humanizeAdminError } from '../utils/humanizeError';
import { API_BASE_URL } from '../../../api';
import { authService } from '../../auth/services/authService';

export type PendingTransfer = {
  id_pedido: number;
  identificador: string | null;
  fecha_creacion: string;
  nombre_contacto: string;
  correo_contacto: string;
  monto_total: string;
  medio_pago: 'Transferencia' | 'Linkify'; // <-- Agregamos Linkify
  estado: 'pendiente';
  vence_en: string | null; // fecha límite para pagar; null si el pedido no vence
};

function isPendingTransfer(value: unknown): value is PendingTransfer {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id_pedido === 'number'
    && (typeof item.identificador === 'string' || item.identificador === null)
    && typeof item.fecha_creacion === 'string' && !Number.isNaN(Date.parse(item.fecha_creacion))
    && typeof item.nombre_contacto === 'string' && typeof item.correo_contacto === 'string'
    && typeof item.monto_total === 'string' && Number.isFinite(Number(item.monto_total))
    && (item.medio_pago === 'Transferencia' || item.medio_pago === 'Linkify') // <-- Agregamos Linkify
    && item.estado === 'pendiente'
    && (item.vence_en === null || (typeof item.vence_en === 'string' && !Number.isNaN(Date.parse(item.vence_en))));
}

export async function getPendingTransfers(signal?: AbortSignal): Promise<PendingTransfer[]> {
  const token = authService.getToken();
  if (!token) throw new Error('Inicia sesión como propietario para consultar transferencias pendientes.');
  const body = await requestEnvelope(`${API_BASE_URL}/api/pagos/transferencias/pendientes/`, {
    headers: { Authorization: `Token ${token}` }, signal,
  });
  if (!Array.isArray(body.data) || !body.data.every(isPendingTransfer)) {
    throw new Error('El listado de transferencias recibido es inválido.');
  }
  return body.data;
}

export async function approveManualTransfer(
  pedidoId: number,
  signal?: AbortSignal,
): Promise<{ id_pedido: number; estado: 'pagado'; mensaje: string }> {
  const token = authService.getToken();
  if (!token) throw new Error('Inicia sesión como propietario para aprobar transferencias.');

  const body = await requestEnvelope(`${API_BASE_URL}/api/pagos/transferencias/${pedidoId}/aprobar/`, {
    method: 'POST',
    headers: { Authorization: `Token ${token}` },
    signal,
  });
  const data = body.data as { id_pedido?: unknown; estado?: unknown } | null;
  if (data?.id_pedido !== pedidoId || data?.estado !== 'pagado') {
    throw new Error('La confirmación de la transferencia recibida es inválida.');
  }
  return { id_pedido: pedidoId, estado: data.estado, mensaje: humanizeAdminError(body.mensaje, 'Transferencia aprobada correctamente.') };
}

export async function rejectManualTransfer(
  pedidoId: number,
  signal?: AbortSignal,
): Promise<{ id_pedido: number; estado: 'cancelado'; mensaje: string }> {
  const token = authService.getToken();
  if (!token) throw new Error('Inicia sesión como propietario para rechazar transferencias.');

  const body = await requestEnvelope(`${API_BASE_URL}/api/pagos/transferencias/${pedidoId}/rechazar/`, {
    method: 'POST',
    headers: { Authorization: `Token ${token}` },
    signal,
  });
  const data = body.data as { id_pedido?: unknown; estado?: unknown } | null;
  if (data?.id_pedido !== pedidoId || data?.estado !== 'cancelado') {
    throw new Error('La confirmación del rechazo recibida es inválida.');
  }
  return { id_pedido: pedidoId, estado: data.estado, mensaje: humanizeAdminError(body.mensaje, 'Transferencia rechazada correctamente.') };
}

// Nueva función de verificación hacia el backend
export async function verifyTransfer(pedido_id: number, signal?: AbortSignal): Promise<{ exito: boolean; mensaje: string }> {
  const token = authService.getToken();
  if (!token) throw new Error('Inicia sesión como propietario para verificar transferencias.');
  
  const body = await requestEnvelope(`${API_BASE_URL}/api/pagos/linkify/verificar/`, {
    method: 'POST',
    headers: { 
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ pedido_id }),
    signal,
  });
  
  return { exito: true, mensaje: humanizeAdminError(body.mensaje, 'Transferencia verificada correctamente.') };
}
