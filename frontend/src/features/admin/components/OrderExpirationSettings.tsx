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
        <h2 id="order-expiration-title" className="font-semibold text-sm">Plazo de vencimiento para pedidos pendientes</h2>
        <p className="text-xs text-[var(--muted-foreground)]">
          Tiempo límite de espera para que el comprador realice el pago antes de liberar el inventario.
        </p>
      </div>
      {loading ? <LoadingState size="sm" align="start" spacing="compact">Cargando plazos...</LoadingState> : <>
        <fieldset disabled={saving || loadFailed} className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Pagos en línea (horas)" type="number" inputMode="numeric" min={1} max={MAX_HOURS} step={1}
            value={draft.online} onChange={event => { setMessage(null); setDraft({ ...draft, online: event.target.value }); }}
            error={online === null ? `Escribe un número entero de 1 a ${MAX_HOURS}.` : undefined}
            placeholder="2"
          />
          <Input
            label="Transferencia bancaria y Linkify (horas)" type="number" inputMode="numeric" min={0} max={MAX_HOURS} step={1}
            value={draft.manual} onChange={event => { setMessage(null); setDraft({ ...draft, manual: event.target.value }); }}
            error={manual === null ? `Escribe un número entero de 0 a ${MAX_HOURS}.` : undefined}
            placeholder="48"
          />
        </fieldset>
        {manual === 0 && <Alert variant="warning">Con 0 horas, los pedidos por transferencia no vencerán automáticamente.</Alert>}
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
