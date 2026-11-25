import { trackMetaPixelEvent } from './metaPixelService';

/**
 * Registrar solamente compras confirmadas por el backend.
 * Una compra se registra como máximo una vez por sesión y pedido.
 */
export function trackConfirmedMetaPurchase(
  tiendaId: number,
  orderNumber: string
): boolean {
  if (
    typeof window === 'undefined' ||
    !Number.isSafeInteger(tiendaId) ||
    tiendaId < 1 ||
    !orderNumber ||
    window.__metaPixelConsent !== 'granted' ||
    typeof window.fbq !== 'function'
  ) return false;

  try {
    const key = `meta-purchase-sent:v1:${tiendaId}:${orderNumber}`;
    if (sessionStorage.getItem(key) === '1') return false;

    const raw = sessionStorage.getItem(
      `meta-order:${tiendaId}:${orderNumber}`
    );
    if (!raw) return false;

    const payload = JSON.parse(raw);
    const value = Number(payload.value);

    if (
      !Number.isFinite(value) ||
      value <= 0 ||
      payload.currency !== 'CLP' ||
      !Array.isArray(payload.content_ids)
    ) return false;

    sessionStorage.setItem(key, '1');

    trackMetaPixelEvent('Purchase', {
      value,
      currency: 'CLP',
      content_ids: payload.content_ids,
      contents: payload.contents,
      content_type: 'product',
      order_id: orderNumber,
    });

    return true;
  } catch {
    return false;
  }
}
