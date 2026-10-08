import { useEffect, useRef, useState } from 'react';
import { useAdmin } from '../context/AdminContext';
import { useAdminForm } from '../hooks/useAdminForm';
import { AdminCard, Alert, Input, Toggle, Button, Icon, Badge } from '../components/ui';
import { getShippingConfiguration, saveShippingConfiguration } from '../../storefront/services/shippingService';
import territorio from '../data/chileTerritory.json';
import { comunasDeRegion } from '../../storefront/data/comunasChile';
import type { ShippingRate } from '../types';

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
      setForm(data || {});
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
    setForm({ ...form, [carrier]: { ...(form[carrier] || {}), enabled } });
  };

  const updateRates = (carrier: 'chilexpress' | 'starken', tarifas: ShippingRate[]) => {
    setMessage('');
    setForm({ ...form, [carrier]: { ...form[carrier], tarifas } });
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

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <Alert variant="info">
        Configura la tarifa que cobrará tu tienda para cada región y comuna, en pesos chilenos. Estas tarifas se gestionan manualmente y no se consultan a Chilexpress ni Starken. Sin tarifa para el destino, el cliente no podrá confirmar ese despacho.
      </Alert>
      {loading && <Alert variant="info">Cargando configuración de entregas…</Alert>}
      {error && <Alert variant="error">{error}</Alert>}
      {!loading && !loaded && <Button variant="outline" onClick={() => setLoadAttempt(value => value + 1)}>Reintentar carga</Button>}

      <fieldset disabled={loading || saving || !loaded} className="flex flex-col gap-5 min-w-0">
        {(['chilexpress', 'starken'] as const).map(carrier => {
          const current = form[carrier] || {};
          const name = carrier === 'chilexpress' ? 'Chilexpress' : 'Starken';

          return (
            <AdminCard key={carrier}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex gap-3 items-center">
                  <Icon name={carrier === 'chilexpress' ? 'box' : 'truck'} className="w-6 h-6" />
                  <div>
                    <h2 className="text-sm font-semibold">{name}</h2>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {carrier === 'chilexpress' ? 'Despacho a domicilio nacional' : 'Despacho a domicilio y sucursal'}
                    </p>
                  </div>
                </div>
                <Badge variant="default">Integración pendiente</Badge>
              </div>
              <div className="border-t border-[var(--border)] pt-3 grid gap-3">
                <Input id={`${carrier}-account`} label="ID de cliente / número de cuenta" placeholder="Entregado por el transportista" value={loaded ? current.accountId || '' : ''} disabled />
                <Input id={`${carrier}-api`} label="API key" type="password" autoComplete="off" placeholder="Disponible próximamente" hint="El guardado de credenciales no está disponible." value="" disabled />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Toggle
                    checked={loaded && !!current.enabled}
                    ariaLabel={`Ofrecer envío ${name}`}
                    label="Ofrecer este envío a clientes"
                    onChange={enabled => update(carrier, enabled)}
                  />
                  <Button variant="outline" size="sm" disabled>Guardar credenciales</Button>
                </div>
                <div className="grid gap-3">
                  <h3 className="text-sm font-semibold">Tarifas de la tienda</h3>
                  {(current.tarifas || []).map((rate, index, rates) => {
                    const change = (changes: Partial<ShippingRate>) => updateRates(carrier,
                      rates.map((entry, position) => position === index ? {...entry, ...changes} : entry));
                    return <div key={index} className="grid gap-2 border border-[var(--border)] rounded p-3">
                      <label className="text-xs">Región
                        <select aria-label={`Región ${name} ${index + 1}`} className="block w-full border rounded p-2" value={rate.region} onChange={event => change({region: event.target.value, comuna: ''})}>
                          <option value="">Selecciona región</option>
                          {territorio.map(region => <option key={region.codigo} value={region.nombre}>{region.nombre}</option>)}
                        </select>
                      </label>
                      <label className="text-xs">Comuna
                        <select aria-label={`Comuna ${name} ${index + 1}`} className="block w-full border rounded p-2" value={rate.comuna} onChange={event => change({comuna: event.target.value})}>
                          <option value="">Selecciona comuna</option>
                          {comunasDeRegion(rate.region).map(comuna => <option key={comuna} value={comuna}>{comuna}</option>)}
                        </select>
                      </label>
                      <Input id={`${carrier}-monto-${index}`} label="Tarifa (CLP)" type="number" min="0" step="1" value={String(rate.monto)} onChange={event => change({monto: Number(event.target.value)})} />
                      <Input id={`${carrier}-plazo-${index}`} label="Plazo en días hábiles (opcional)" type="number" min="1" max="365" step="1" value={rate.plazo_dias === null ? '' : String(rate.plazo_dias)} onChange={event => change({plazo_dias: event.target.value ? Number(event.target.value) : null})} />
                      <Button variant="outline" size="sm" onClick={() => updateRates(carrier, rates.filter((_, position) => position !== index))}>Eliminar tarifa</Button>
                    </div>;
                  })}
                  <Button variant="outline" size="sm" onClick={() => updateRates(carrier, [...(current.tarifas || []), {region: '', comuna: '', monto: 0, plazo_dias: null}])}>Agregar tarifa {name}</Button>
                </div>
              </div>
            </AdminCard>
          );
        })}
        <Button onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar entregas'}</Button>
      </fieldset>
      {message && <Alert variant="success">{message}</Alert>}
    </div>
  );
}
