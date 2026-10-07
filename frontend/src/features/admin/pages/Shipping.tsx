import { useEffect, useRef, useState } from 'react';
import { useAdmin } from '../context/AdminContext';
import { useAdminForm } from '../hooks/useAdminForm';
import { AdminCard, Alert, Input, Textarea, Toggle, Button, Icon, Badge } from '../components/ui';
import { getShippingConfiguration, saveShippingConfiguration } from '../../storefront/services/shippingService';

export default function Shipping() {
  const { config, setConfig } = useAdmin();
  const { form, setForm } = useAdminForm('shippingConfiguration');
  const configRef = useRef(config);
  configRef.current = config;
  const savingRef = useRef(false);
  const mountedRef = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    mountedRef.current = true;
    setLoading(true);
    setLoaded(false);
    setError('');
    getShippingConfiguration(controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setForm(data);
      setLoaded(true);
    }).catch(cause => {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las entregas.');
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => { mountedRef.current = false; controller.abort(); };
  }, [setForm, loadAttempt]);

  const update = (carrier: 'chilexpress' | 'starken', enabled: boolean) => {
    setMessage('');
    setForm({ ...form, [carrier]: { ...form[carrier], enabled } });
  };

  async function save() {
    if (!loaded || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await saveShippingConfiguration(form);
      if (!mountedRef.current) return;
      setForm(data);
      setMessage('Configuración de entregas guardada.');
      if (!setConfig({ ...configRef.current, shippingConfiguration: data })) {
        setError('Las entregas se guardaron en el servidor, pero no se pudo actualizar la copia del navegador.');
      }
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof Error ? cause.message : 'No se pudieron guardar las entregas.');
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }

  return <div className="flex flex-col gap-5 max-w-2xl">
    <Alert variant="info">Chilexpress y Starken requieren un contrato comercial. Puedes activar estas alternativas para gestionarlas manualmente; la integración y el guardado de credenciales estarán disponibles más adelante.</Alert>
    {loading && <Alert variant="info">Cargando configuración de entregas…</Alert>}
    {error && <Alert variant="error">{error}</Alert>}
    {!loading && !loaded && <Button variant="outline" onClick={() => setLoadAttempt(value => value + 1)}>Reintentar carga</Button>}
    <fieldset disabled={loading || saving || !loaded} className="flex flex-col gap-5 min-w-0">
      {(['chilexpress', 'starken'] as const).map(carrier => {
        const current = form[carrier], name = carrier === 'chilexpress' ? 'Chilexpress' : 'Starken';
        return <AdminCard key={carrier}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex gap-3 items-center">
              <Icon name={carrier === 'chilexpress' ? 'box' : 'truck'} className="w-6 h-6" />
              <div><h2 className="text-sm font-semibold">{name}</h2><p className="text-xs text-[var(--muted-foreground)]">{carrier === 'chilexpress' ? 'Despacho a domicilio nacional' : 'Despacho a domicilio y sucursal'}</p></div>
            </div>
            <Badge variant="default">Integración pendiente</Badge>
          </div>
          <div className="border-t border-[var(--border)] pt-3 grid gap-3">
            <Input id={carrier + '-account'} label="ID de cliente / número de cuenta" placeholder="Entregado por el transportista" value={loaded ? current.accountId : ''} disabled />
            <Input id={carrier + '-api'} label="API key" type="password" autoComplete="off" placeholder="Disponible próximamente" hint="El guardado de credenciales no está disponible." value="" disabled />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Toggle checked={loaded && current.enabled} ariaLabel={'Ofrecer envío ' + name} label="Ofrecer este envío a clientes" onChange={enabled => update(carrier, enabled)} />
              <Button variant="outline" size="sm" disabled>Guardar credenciales</Button>
            </div>
          </div>
        </AdminCard>;
      })}
      <AdminCard>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Icon name="store" className="w-6 h-6" />
            <div><h2 className="font-semibold text-sm">Retiro en tienda</h2><p className="text-xs text-[var(--muted-foreground)]">No requiere contrato: el cliente retira en tu local.</p></div>
          </div>
          <Toggle ariaLabel="Activar retiro en tienda" checked={loaded && form.pickup.enabled} onChange={enabled => {
            setMessage('');
            setForm({ ...form, pickup: { ...form.pickup, enabled } });
          }} />
        </div>
        <div className="grid gap-3 border-t border-[var(--border)] pt-3">
          <Textarea label="Dirección del local" rows={2} maxLength={500} value={loaded ? form.pickup.address : ''} placeholder="Av. Providencia 1234, Piso 2, Santiago" onChange={event => {
            setMessage('');
            setForm({ ...form, pickup: { ...form.pickup, address: event.target.value } });
          }} />
          <Input label="Horario de atención" maxLength={500} value={loaded ? form.pickup.schedule : ''} placeholder="Lun–Sáb 9:00–18:00" onChange={event => {
            setMessage('');
            setForm({ ...form, pickup: { ...form.pickup, schedule: event.target.value } });
          }} />
        </div>
      </AdminCard>
      <Button onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar entregas'}</Button>
    </fieldset>
    {message && <Alert variant="success">{message}</Alert>}
  </div>;
}
