import { useEffect, useState } from 'react';
import { LoadingState } from '../../../shared/components/states';
import { AdminCard, Alert, Button, Input } from './ui';
import { fetchOrderExpiration, saveOrderExpiration } from '../../storefront/services/storeInformationService';

const MAX_HOURS = 720; // 30 días
type Draft = { online: string; manual: string };

function parse(value: string, min: number): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const number = Number(value);
  return number >= min && number <= MAX_HOURS ? number : null;
}
function describe(hours: number) {
  if (hours === 0) return 'sin vencimiento';
  if (hours % 24 === 0) { const days = hours / 24; return `${days} ${days === 1 ? 'día' : 'días'}`; }
  return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
}

/** Cuánto espera un pedido sin pagar antes de cancelarse y devolver su stock (SCRUM-509). Guarda aparte del resto del formulario de pagos. */
export function OrderExpirationSettings() {
  const [draft, setDraft] = useState<Draft>({ online: '2', manual: '48' });
  const [saved, setSaved] = useState<Draft>({ online: '2', manual: '48' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadFailed(false); setMessage(null);
    fetchOrderExpiration(controller.signal).then(data => {
      if (controller.signal.aborted) return;
      const next = { online: String(data.horas_expiracion_pedido_en_linea), manual: String(data.horas_expiracion_pedido_manual) };
      setDraft(next); setSaved(next);
    }).catch(cause => {
      if (controller.signal.aborted) return;
      setLoadFailed(true);
      setMessage({ type: 'error', text: cause instanceof Error ? cause.message : 'No se pudo cargar el plazo de los pedidos.' });
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  const online = parse(draft.online, 1);
  const manual = parse(draft.manual, 0);
  const dirty = draft.online !== saved.online || draft.manual !== saved.manual;

  async function save() {
    if (online === null || manual === null) return;
    setSaving(true); setMessage(null);
    try {
      const result = await saveOrderExpiration({ horas_expiracion_pedido_en_linea: online, horas_expiracion_pedido_manual: manual });
      const next = { online: String(result.horas_expiracion_pedido_en_linea), manual: String(result.horas_expiracion_pedido_manual) };
      setDraft(next); setSaved(next);
      setMessage({ type: 'success', text: 'Plazo de los pedidos guardado.' });
    } catch (cause) {
      setMessage({ type: 'error', text: cause instanceof Error ? cause.message : 'No se pudo guardar el plazo de los pedidos.' });
    } finally { setSaving(false); }
  }

  return <AdminCard>
    <section aria-labelledby="order-expiration-title" className="space-y-3">
      <div>
        <h2 id="order-expiration-title" className="font-semibold text-sm">Plazo para pagar los pedidos</h2>
        <p className="text-xs text-[var(--muted-foreground)]">
          Un pedido sin pagar reserva sus productos. Pasado el plazo se cancela solo, el stock vuelve al inventario y el comprador
          recibe un aviso por correo. El plazo también se le informa en el correo de confirmación del pedido.
        </p>
      </div>
      {loading ? <LoadingState size="sm" align="start" spacing="compact">Cargando plazos...</LoadingState> : <>
        <fieldset disabled={saving || loadFailed} className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Pagos en línea (Webpay, PayPal, Mercado Pago y TUU), en horas" type="number" inputMode="numeric" min={1} max={MAX_HOURS} step={1}
            value={draft.online} onChange={event => { setMessage(null); setDraft({ ...draft, online: event.target.value }); }}
            error={online === null ? `Escribe un número entero de 1 a ${MAX_HOURS}.` : undefined}
            persistentHint hint="Normalmente el comprador paga en minutos. Recomendado: 2 horas."
          />
          <Input
            label="Transferencia y Linkify, en horas" type="number" inputMode="numeric" min={0} max={MAX_HOURS} step={1}
            value={draft.manual} onChange={event => { setMessage(null); setDraft({ ...draft, manual: event.target.value }); }}
            error={manual === null ? `Escribe un número entero de 0 a ${MAX_HOURS}.` : undefined}
            persistentHint hint="24 = 1 día, 168 = 1 semana, 720 = 30 días (máximo). Escribe 0 para que nunca venza."
          />
        </fieldset>
        {manual === 0 && <Alert variant="warning">Con 0, los pedidos de transferencia y Linkify nunca vencen y mantienen reservado su stock hasta que los apruebes o los rechaces. Revisa tus transferencias pendientes con frecuencia.</Alert>}
        {manual !== null && manual > 0 && <p className="text-xs text-[var(--muted-foreground)]">El comprador tendrá {describe(manual)} para transferir. Si paga después, el pedido ya estará cancelado y tendrás que resolverlo con él directamente.</p>}
        {message && <div role={message.type === 'error' ? 'alert' : 'status'}><Alert variant={message.type}>{message.text}</Alert></div>}
        <div className="flex justify-end gap-2">
          {loadFailed && <Button type="button" size="sm" variant="outline" onClick={() => setAttempt(n => n + 1)}>Reintentar</Button>}
          <Button type="button" size="sm" variant="primary" loading={saving} disabled={loadFailed || !dirty || online === null || manual === null} className="w-full sm:w-auto whitespace-normal" onClick={() => void save()}>
            Guardar plazo de los pedidos
          </Button>
        </div>
      </>}
    </section>
  </AdminCard>;
}
