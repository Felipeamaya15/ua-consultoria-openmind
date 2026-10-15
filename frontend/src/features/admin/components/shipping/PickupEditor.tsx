import { useEffect, useRef, useState } from 'react';
import { AdminCard, Alert, Input, Select, Toggle, Button, Icon } from '../ui';
import territorio from '../../data/chileTerritory.json';
import { comunasDeRegion } from '../../../storefront/data/comunasChile';
import { getPickupAddressStatus, searchPickupAddresses } from '../../../storefront/services/shippingService';
import { PICKUP_DAYS, structuredPickup, groupPickupHours, type PickupConfiguration, type PickupLocation } from '../../services/pickupConfiguration';

export default function PickupEditor({ value, onChange, errors, onProviderStatus }: {
  value: PickupConfiguration; onChange: (value: PickupConfiguration) => void; errors: Record<string, string>;
  onProviderStatus?: (configured: boolean | null) => void;
}) {
  const draft = structuredPickup(value);
  const [configured, setConfigured] = useState(false);
  const [message, setMessage] = useState('Consultando búsqueda de direcciones…');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<PickupLocation[]>([]);
  const [searchError, setSearchError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    setConfigured(false);
    onProviderStatus?.(null);
    const statusController = new AbortController();
    getPickupAddressStatus(statusController.signal).then(status => {
      if (statusController.signal.aborted) return;
      setConfigured(status.configured);
      onProviderStatus?.(status.configured);
      setMessage(status.configured ? '' : 'Búsqueda externa no configurada. Puedes activar y guardar retiro con una dirección manual completa y horarios válidos. La dirección manual no está verificada externamente.');
    }).catch(() => { if (!statusController.signal.aborted) { onProviderStatus?.(null); setMessage('No se pudo consultar la búsqueda externa. Puedes ingresar la dirección manualmente; el servidor comprobará las condiciones al guardar.'); } });
    return () => statusController.abort();
  }, [attempt, onProviderStatus]);
  useEffect(() => () => controller.current?.abort(), []);
  const changeLocation = (changes: Partial<PickupLocation>, verified = false) => {
    controller.current?.abort(); setSearching(false); setResults([]); setSearchError('');
    onChange({ ...draft, validation_method: verified ? 'google' : 'unverified', location: { ...draft.location, ...changes, ...(!verified ? { verification: '' } : {}) } });
  };
  async function search() {
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setSearching(true); setSearchError(''); setResults([]);
    try {
      const rows = await searchPickupAddresses(draft.location.region, draft.location.comuna,
        `${draft.location.street} ${draft.location.number}`.trim(), request.signal);
      if (!request.signal.aborted) { setResults(rows); if (!rows.length) setSearchError('No se encontraron ubicaciones precisas coherentes con región y comuna.'); }
    } catch (cause) { if (!request.signal.aborted) setSearchError(cause instanceof Error ? cause.message : 'No se pudo buscar la dirección.'); }
    finally { if (!request.signal.aborted) setSearching(false); }
  }
  return <AdminCard>
    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
      <div className="flex gap-3 items-center"><Icon name="store" className="w-6 h-6" /><div>
        <h2 className="text-sm font-semibold">Retiro en tienda</h2>
        <p className="text-xs text-[var(--muted-foreground)]">El cliente retira en tu local, sin costo de entrega.</p>
      </div></div>
      <Toggle ariaLabel="Activar retiro en tienda" label="Ofrecer retiro a clientes" checked={value.enabled} onChange={enabled => onChange({ ...draft, enabled })} />
    </div>
    <div className="grid gap-4 border-t border-[var(--border)] pt-3">
      {(value.version !== 2 || value.legacy_address || value.legacy_schedule) && (value.address || value.schedule || value.legacy_address || value.legacy_schedule) &&
        <Alert variant="info">Configuración anterior conservada: {value.legacy_address || value.address} · {value.legacy_schedule || value.schedule}. Para actualizarla, completa la dirección estructurada y los horarios por día.</Alert>}
      {message && <div className="space-y-2"><Alert variant="info">{message}</Alert><Button variant="outline" size="sm" onClick={() => setAttempt(a => a + 1)}>Revisar disponibilidad</Button></div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select id="pickup-region" label="Región" value={draft.location.region} error={errors['location.region']}
          options={[{ value: '', label: 'Selecciona región' }, ...territorio.map(r => ({ value: r.nombre, label: r.nombre }))]}
          onChange={event => changeLocation({ region: event.target.value, comuna: '' })} />
        <Select id="pickup-comuna" label="Comuna" value={draft.location.comuna} error={errors['location.comuna']}
          options={[{ value: '', label: 'Selecciona comuna' }, ...comunasDeRegion(draft.location.region).map(c => ({ value: c, label: c }))]}
          onChange={event => changeLocation({ comuna: event.target.value })} />
        <Input id="pickup-street" label="Calle o establecimiento" maxLength={200} value={draft.location.street} error={errors['location.street']}
          onChange={event => changeLocation({ street: event.target.value })} />
        <Input id="pickup-number" label="Número" maxLength={50} value={draft.location.number} error={errors['location.number']}
          onChange={event => changeLocation({ number: event.target.value })} />
      </div>
      <Input id="pickup-reference" label="Departamento, local o referencia (opcional)" maxLength={500} value={draft.location.reference}
        onChange={event => onChange({ ...draft, location: { ...draft.location, reference: event.target.value } })} />
      <div className="space-y-2">
        {configured && <Button variant="outline" disabled={searching || !draft.location.region || !draft.location.comuna || !draft.location.street.trim()} onClick={() => void search()}>{searching ? 'Buscando dirección…' : 'Buscar dirección'}</Button>}
        {searchError && <p role="alert" className="text-sm text-[var(--error)]">{searchError}</p>}
        {results.length > 0 && <ul aria-label="Direcciones sugeridas" className="space-y-2">{results.map(row => <li key={row.verification}>
          <Button variant="outline" onClick={() => changeLocation({ ...row, reference: draft.location.reference }, true)}>{row.street} {row.number}, {row.comuna}, {row.region}</Button>
        </li>)}</ul>}
        {errors['location.verification'] && <p role="alert" className="text-sm text-[var(--error)]">{errors['location.verification']}</p>}
        {draft.location.verification && value.validation_method === 'google' && <p role="status" className="text-sm text-[var(--success)]">Dirección seleccionada y reconocida por el proveedor.</p>}
        {(value.validation_method === 'manual' || (!configured && !draft.location.verification)) && <p role="status" className="text-sm text-[var(--muted-foreground)]">Dirección ingresada manualmente; no verificada externamente.</p>}
      </div>
      <fieldset className="grid gap-3 min-w-0"><legend className="text-sm font-semibold mb-3">Días y horarios de retiro</legend>
        {PICKUP_DAYS.map(([day, label]) => {
          const row = draft.hours[day];
          const update = (changes: Partial<typeof row>) => onChange({ ...draft, hours: { ...draft.hours, [day]: { ...row, ...changes } } });
          return <div key={day} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start border-b border-[var(--border)] pb-3">
            <label className="flex items-center gap-2 text-sm pt-2"><input type="checkbox" checked={row.enabled} onChange={event => update({ enabled: event.target.checked })} />{label}{!row.enabled && <span className="text-xs text-[var(--muted-foreground)]">Cerrado</span>}</label>
            <Input id={`pickup-${day}-start`} label={`Inicio ${label}`} type="time" value={row.start} disabled={!row.enabled} error={errors[`hours.${day}.start`]} onChange={event => update({ start: event.target.value })} />
            <Input id={`pickup-${day}-end`} label={`Término ${label}`} type="time" value={row.end} disabled={!row.enabled} error={errors[`hours.${day}.end`]} onChange={event => update({ end: event.target.value })} />
          </div>;
        })}
      </fieldset>
      {errors.hours && <p role="alert" className="text-sm text-[var(--error)]">{errors.hours}</p>}
      <div className="text-sm rounded-lg bg-[var(--muted)] p-3"><h3 className="font-semibold mb-1">Resumen de horarios</h3><p>{value.version !== 2 && value.schedule ? value.schedule : groupPickupHours(draft.hours)}</p></div>
    </div>
  </AdminCard>;
}
