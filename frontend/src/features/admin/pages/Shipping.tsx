import { useEffect, useRef, useState } from 'react';
import { ErrorState, LoadingState } from '../../../shared/components/states';
import { humanizeAdminError } from '../utils/humanizeError';
import { useAdmin } from '../context/AdminContext';
import { useAdminForm } from '../hooks/useAdminForm';
import { AdminCard, Alert, Input, Toggle, Button, Icon, Badge } from '../components/ui';
import { getShippingConfiguration, saveShippingConfiguration, saveChilexpressCredentials, ShippingConfigurationError } from '../../storefront/services/shippingService';
import territorio from '../data/chileTerritory.json';
import { comunasDeRegion } from '../../storefront/data/comunasChile';
import type { PackageConfiguration, ShippingRate } from '../types';
import PickupEditor from '../components/shipping/PickupEditor';
import { validatePickup } from '../services/pickupConfiguration';

const CREDENCIALES_COTIZACION = [
  ['cotizador', 'Clave API Cotizador', true],
  ['coberturas', 'Clave API Coberturas', true],
  ['tcc', 'Número de cliente Chilexpress (TCC)', false],
] as const;

const CHILEXPRESS_OBLIGATORIOS = [
  ['cotizador', 'Clave API Cotizador'], ['coberturas', 'Clave API Coberturas'],
  ['tcc', 'Número de cliente Chilexpress (TCC)'], ['origen_region', 'Región de origen'], ['origen_comuna', 'Comuna de origen'],
] as const;

function chilexpressFaltantes(chilexpress: { credenciales?: Record<string, string | undefined> } | undefined, enabled: boolean) {
  const creds = chilexpress?.credenciales || {};
  if (!enabled && !Object.values(creds).some(Boolean)) return [];
  return CHILEXPRESS_OBLIGATORIOS.filter(([field]) => !creds[field]).map(([, label]) => label);
}

const CHILEXPRESS_TEST_TCC = '18578680';
const CHILEXPRESS_TEST_RUT = '96756430';

const AYUDA_TCC = 'Te lo entrega Chilexpress al contratar el servicio. Si no lo tienes, pídeselo a tu ejecutivo.';

const CREDENCIALES_GUIA = [
  ['envios', 'Clave API Envíos', true],
  ['rut', 'RUT de la empresa (sin puntos ni dígito verificador)', false],
  ['origen_calle', 'Calle de origen (guías)', false],
  ['origen_numero', 'Número de la dirección de origen', false],
  ['telefono', 'Teléfono del remitente', false],
] as const;

export default function Shipping() {
  const { config, setConfig } = useAdmin();
  const { form, setForm } = useAdminForm('shippingConfiguration');
  const configRef = useRef(config);
  configRef.current = config;
  const savingRef = useRef(false);
  const mountedRef = useRef(false);
  const [message, setMessage] = useState('');
  const [pickupErrors, setPickupErrors] = useState<Record<string, string>>({});
  const [pickupProviderConfigured, setPickupProviderConfigured] = useState<boolean | null>(null);
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
    if (enabled && carrier === 'chilexpress') {
      const faltan = chilexpressFaltantes(form.chilexpress, true);
      if (faltan.length) { setError(`Para ofrecer Chilexpress faltan: ${faltan.join(', ')}.`); return; }
    }
    setError('');
    setForm({ ...form, [carrier]: { ...(form[carrier] || {}), enabled } });
  };

  const updateChilexpress = (changes: Record<string, unknown>) => {
    setMessage('');
    setForm({ ...form, chilexpress: { ...(form.chilexpress || {}), ...changes } });
  };
  const fillChilexpressTestData = () => updateChilexpress({
    ambiente: 'SANDBOX',
    credenciales: { ...(form.chilexpress?.credenciales || {}), tcc: CHILEXPRESS_TEST_TCC, rut: CHILEXPRESS_TEST_RUT },
  });
  const updateOriginRegion = (region: string) => updateChilexpress({
    credenciales: { ...(form.chilexpress?.credenciales || {}), origen_region: region, origen_comuna: '' },
  });
  const updateCredential = (field: string, value: string) => updateChilexpress({
    credenciales: { ...(form.chilexpress?.credenciales || {}), [field]: value },
  });

  const updatePackage = (changes: Partial<PackageConfiguration>) => {
    setMessage('');
    setForm({ ...form, paquete: { ...(form.paquete || {}), ...changes } as PackageConfiguration });
  };
  const optionalNumber = (value: string) => (value.trim() === '' ? null : Number(value));

  const updateRates = (carrier: 'chilexpress' | 'starken', tarifas: ShippingRate[]) => {
    setMessage('');
    setForm({ ...form, [carrier]: { ...form[carrier], tarifas } });
  };

  async function saveChilexpressOnly() {
    if (!loaded || savingRef.current) return;
    const faltan = chilexpressFaltantes(form.chilexpress, !!form.chilexpress?.enabled);
    if (faltan.length) { setError(`Faltan campos obligatorios: ${faltan.join(', ')}.`); return; }
    savingRef.current = true;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await saveChilexpressCredentials({
        ambiente: form.chilexpress?.ambiente || 'SANDBOX',
        credenciales: form.chilexpress?.credenciales || {},
      });
      if (!mountedRef.current) return;
      setForm({ ...form, chilexpress: { ...form.chilexpress, ambiente: data.chilexpress.ambiente,
        credenciales: data.chilexpress.credenciales, status: data.chilexpress.status } });
      setMessage('Credenciales de Chilexpress guardadas.');
      if (!setConfig({ ...configRef.current, shippingConfiguration: data })) {
        setError('Las credenciales se guardaron en el servidor, pero no se pudo actualizar la copia del navegador.');
      }
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof Error ? cause.message : 'No se pudieron guardar las credenciales.');
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }

  async function save() {
    if (!loaded || savingRef.current) return;
    const faltan = chilexpressFaltantes(form.chilexpress, !!form.chilexpress?.enabled);
    if (faltan.length) { setError(`Faltan campos obligatorios de Chilexpress: ${faltan.join(', ')}.`); return; }
    const validation = validatePickup(form.pickup, pickupProviderConfigured === true);
    setPickupErrors(validation);
    if (Object.keys(validation).length) { setError('Revisa los campos de retiro indicados.'); return; }
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
      if (mountedRef.current) {
        setError(cause instanceof Error ? cause.message : 'No se pudieron guardar las entregas.');
        if (cause instanceof ShippingConfigurationError) setPickupErrors(cause.fields);
      }
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 w-full">
      <Alert variant="info">
        Configura la tarifa que cobrará tu tienda para cada región y comuna, en pesos chilenos. Estas tarifas se gestionan manualmente y no se consultan a Chilexpress ni Starken. Sin tarifa para el destino, el cliente no podrá confirmar ese despacho.
      </Alert>
      {loading && <LoadingState align="start" spacing="compact">Cargando configuración de entregas…</LoadingState>}
      {error && <ErrorState onRetry={!loading && !loaded ? () => setLoadAttempt(value => value + 1) : undefined} retryLabel="Reintentar carga">{humanizeAdminError(error)}</ErrorState>}

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
                <Badge variant="default">{carrier === 'chilexpress' && current.status === 'configured' ? 'Conexión automática lista' : 'Conexión automática pendiente'}</Badge>
              </div>
              <div className="border-t border-[var(--border)] pt-3 grid gap-3">
                {carrier === 'chilexpress' ? (
                  <div className="grid gap-3">
                    <label className="text-xs">Ambiente de la API
                      <select aria-label="Ambiente Chilexpress" className="block w-full border rounded p-2" value={current.ambiente || 'SANDBOX'} onChange={event => updateChilexpress({ ambiente: event.target.value })}>
                        <option value="SANDBOX">SANDBOX (pruebas)</option>
                        <option value="PRODUCCION">PRODUCCIÓN</option>
                      </select>
                    </label>
                    {(current.ambiente || 'SANDBOX') === 'SANDBOX' && (
                      <div>
                        <Button type="button" size="sm" variant="secondary" onClick={fillChilexpressTestData}>
                          Usar datos de prueba de Chilexpress
                        </Button>
                        <p className="text-xs text-[var(--muted-foreground)] mt-1">Completa el TCC y el RUT de prueba del portal. Las claves API debes ingresarlas tú.</p>
                      </div>
                    )}
                    <div className="grid gap-3">
                      <h3 className="text-sm font-semibold">Cotización en el checkout</h3>
                      <p className="text-xs text-[var(--muted-foreground)]">Es obligatorio para ofrecer Chilexpress: el precio del checkout se cotiza con la tarifa de tu contrato (TCC).</p>
                      {CREDENCIALES_COTIZACION.map(([field, label, secret]) => (
                        <Input key={field} id={`chilexpress-${field}`} label={label} type={secret ? 'password' : 'text'} autoComplete="off"
                          placeholder={secret ? 'Una clave distinta por producto del portal' : ''}
                          {...(field === 'tcc' ? { persistentHint: true, hint: AYUDA_TCC } : {})}
                          value={current.credenciales?.[field] || ''} onChange={event => updateCredential(field, event.target.value)} />
                      ))}
                      <label className="text-xs">Región de origen
                        <select aria-label="Región de origen" className="block w-full border rounded p-2" value={current.credenciales?.origen_region || ''} onChange={event => updateOriginRegion(event.target.value)}>
                          <option value="">Selecciona región</option>
                          {territorio.map(region => <option key={region.codigo} value={region.nombre}>{region.nombre}</option>)}
                        </select>
                      </label>
                      <label className="text-xs">Comuna de origen
                        <select aria-label="Comuna de origen" className="block w-full border rounded p-2" value={current.credenciales?.origen_comuna || ''} disabled={!current.credenciales?.origen_region} onChange={event => updateCredential('origen_comuna', event.target.value)}>
                          <option value="">Selecciona comuna</option>
                          {comunasDeRegion(current.credenciales?.origen_region || '').map(comuna => <option key={comuna} value={comuna}>{comuna}</option>)}
                        </select>
                      </label>
                      <p className="text-xs text-[var(--muted-foreground)]">Es la comuna desde donde despachas tus pedidos. Al guardar, buscamos su código en Chilexpress y necesitas haber ingresado la clave API Coberturas.</p>
                    </div>
                    <div className="grid gap-3 border-t border-[var(--border)] pt-3">
                      <h3 className="text-sm font-semibold">Guías automáticas (opcional)</h3>
                      <p className="text-xs text-[var(--muted-foreground)]">Solo es necesario si quieres emitir las guías de despacho desde el panel. Sin estos datos la cotización sigue funcionando y las guías se emiten por fuera del sistema.</p>
                      {CREDENCIALES_GUIA.map(([field, label, secret]) => (
                        <Input key={field} id={`chilexpress-${field}`} label={label} type={secret ? 'password' : 'text'} autoComplete="off"
                          placeholder={secret ? 'Una clave distinta por producto del portal' : ''}
                          value={current.credenciales?.[field] || ''} onChange={event => updateCredential(field, event.target.value)} />
                      ))}
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)]">Las claves se guardan cifradas y no se vuelven a mostrar completas. Déjalas como están para conservarlas.</p>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button size="sm" onClick={() => void saveChilexpressOnly()} disabled={saving}>{saving ? 'Guardando…' : 'Guardar credenciales'}</Button>
                    </div>
                    {error && <p className="text-xs text-red-600" role="alert">{humanizeAdminError(error)}</p>}
                    {message && <p className="text-xs text-green-700">{message}</p>}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Toggle
                    checked={loaded && !!current.enabled}
                    ariaLabel={`Ofrecer envío ${name}`}
                    label="Ofrecer este envío a clientes"
                    onChange={enabled => update(carrier, enabled)}
                  />
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
        <AdminCard>
          <div className="flex gap-3 items-center mb-3">
            <Icon name="box" className="w-6 h-6" />
            <div>
              <h2 className="text-sm font-semibold">Peso, paquete y margen del envío</h2>
              <p className="text-xs text-[var(--muted-foreground)]">Se aplican a la cotización automática con el transportista. Las tarifas manuales por comuna no cambian.</p>
            </div>
          </div>
          <div className="border-t border-[var(--border)] pt-3 grid gap-3">
            <Input id="paquete-peso-default" label="Peso por defecto de un producto (kg)" type="number" min="0.01" step="0.01" inputMode="decimal"
              placeholder="Ej: 0.5" persistentHint hint="Se usa en los productos que no tienen peso propio. Pon el de tu producto más pesado para no perder dinero. Vacío = 1 kg."
              value={form.paquete?.peso_default_kg == null ? '' : String(form.paquete.peso_default_kg)}
              onChange={event => updatePackage({ peso_default_kg: optionalNumber(event.target.value) })} />
            <Input id="paquete-margen-porcentaje" label="Margen sobre la tarifa (%)" type="number" min="0" max="100" step="0.5" inputMode="decimal"
              persistentHint hint="Porcentaje que se suma a la tarifa que devuelve el transportista, para cubrir diferencias con lo que te factura. Ej: 10 % sobre una tarifa de $4.000 suma $400. En 0 no se agrega nada."
              value={String(form.paquete?.margen_porcentaje ?? 0)}
              onChange={event => updatePackage({ margen_porcentaje: Number(event.target.value || 0) })} />
            <Input id="paquete-limite-peso" label="Peso máximo para envío automático (kg)" type="number" min="0.1" step="0.5" inputMode="decimal"
              persistentHint hint="Sobre este peso total el comprador no puede pagar el envío automático: ve «Envío a coordinar» y debe contactar a la tienda o elegir retiro. Vacío = sin límite."
              value={form.paquete?.limite_peso_kg == null ? '' : String(form.paquete.limite_peso_kg)}
              onChange={event => updatePackage({ limite_peso_kg: optionalNumber(event.target.value) })} />
            <Input id="paquete-limite-unidades" label="Unidades máximas para envío automático" type="number" min="1" step="1" inputMode="numeric"
              persistentHint hint="Sobre estas unidades el comprador no puede pagar el envío automático: ve «Envío a coordinar» y debe contactar a la tienda o elegir retiro. Vacío = sin límite."
              value={form.paquete?.limite_unidades == null ? '' : String(form.paquete.limite_unidades)}
              onChange={event => updatePackage({ limite_unidades: event.target.value.trim() === '' ? null : Math.trunc(Number(event.target.value)) })} />
            <div className="grid grid-cols-3 gap-3">
              {([['alto_cm', 'Alto (cm)'], ['ancho_cm', 'Ancho (cm)'], ['largo_cm', 'Largo (cm)']] as const).map(([field, label]) => (
                <Input key={field} id={`paquete-${field}`} label={label} type="number" min="1" max="200" step="1" inputMode="numeric"
                  value={String(form.paquete?.[field] ?? '')}
                  onChange={event => updatePackage({ [field]: Math.trunc(Number(event.target.value || 1)) } as Partial<PackageConfiguration>)} />
              ))}
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">Este paquete se usa para los productos que no tienen medidas propias (los de un pedido se agrupan en un solo paquete). Los productos con alto, ancho y largo suman su propio volumen. El transportista puede cobrar por volumen si es mayor que el peso real.</p>
          </div>
        </AdminCard>
        <PickupEditor value={form.pickup} errors={pickupErrors} onProviderStatus={setPickupProviderConfigured} onChange={pickup => {
          setMessage(''); setPickupErrors({});
          setForm({ ...form, pickup });
        }} />
        <div><Button onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar entregas'}</Button></div>
      </fieldset>
      {message && <Alert variant="success">{message}</Alert>}
    </div>
  );
}