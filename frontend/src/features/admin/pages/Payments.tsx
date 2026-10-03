import React, { useState, useEffect } from 'react';
import { useAdminForm } from '../hooks/useAdminForm';
import { AdminCard, Alert, Input, Toggle, Button, Icon, Select, Textarea } from '../components/ui';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const TIENDA_ID = 1;

// Métodos de demostración secundarios restantes
const otherMethods = [
  { id: 'linkify', name: 'Linkify', icon: 'link', desc: 'Validación automática de transferencias bancarias', fields: ['ID de cuenta', 'Clave privada'] },
  { id: 'transfer', name: 'Transferencia bancaria', icon: 'bank', desc: 'Verificación manual', fields: ['Banco', 'N° de cuenta', 'RUT', 'Nombre titular'] }
];

const linkifyRequiredFields = ['idCuenta', 'clavePrivada'];

const boolValue = (value?: string) => value === 'true';

export default function Payments() {
const { form, setForm, save: localSave, saved } = useAdminForm('paymentConfiguration');

  // Estados reactivos: Transbank
  const [tbActivo, setTbActivo] = useState(true);
  const [tbCodigo, setTbCodigo] = useState('');
  const [tbApiKey, setTbApiKey] = useState('');
  const [tbAmbiente, setTbAmbiente] = useState('INTEGRACION');
  const [tbMaskedKey, setTbMaskedKey] = useState('');
  const [tbIsConfigured, setTbIsConfigured] = useState(false);
  const [tbLoading, setTbLoading] = useState(true);
  const [tbSaving, setTbSaving] = useState(false);
  const [tbFeedback, setTbFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Estados reactivos: PayPal
  const [ppActivo, setPpActivo] = useState(false);
  const [ppClientId, setPpClientId] = useState('');
  const [ppClientSecret, setPpClientSecret] = useState('');
  const [ppAmbiente, setPpAmbiente] = useState<'SANDBOX' | 'LIVE'>('SANDBOX');
  const [ppMaskedSecret, setPpMaskedSecret] = useState('');
  const [ppIsConfigured, setPpIsConfigured] = useState(false);
  const [ppLoading, setPpLoading] = useState(true);
  const [ppSaving, setPpSaving] = useState(false);
  const [ppFeedback, setPpFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Estados reactivos: Mercado Pago
  const [mpActivo, setMpActivo] = useState(false);
  const [mpPublicKey, setMpPublicKey] = useState('');
  const [mpAccessToken, setMpAccessToken] = useState('');
  const [mpAmbiente, setMpAmbiente] = useState<'SANDBOX' | 'PRODUCCION'>('SANDBOX');
  const [mpMaskedToken, setMpMaskedToken] = useState('');
  const [mpIsConfigured, setMpIsConfigured] = useState(false);
  const [mpLoading, setMpLoading] = useState(true);
  const [mpSaving, setMpSaving] = useState(false);
  const [mpFeedback, setMpFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Estados genéricos / Linkify y Transferencia
  const [isSyncing, setIsSyncing] = useState(false);
  const [backendError, setBackendError] = useState('');
  const [validationError, setValidationError] = useState('');

  const getAuthHeaders = () => {
    const token =
      localStorage.getItem('token') ||
      sessionStorage.getItem('token') ||
      '';
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Token ${token}` } : {}),
    };
  };

  useEffect(() => {
    // 1. Cargar Transbank
    setTbLoading(true);
    fetch(`${API_BASE}/api/catalog/tiendas/${TIENDA_ID}/configuracion/transbank/`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })
      .then((res) => res.json())
      .then((res) => {
        if (res.exito && res.data) {
          setTbCodigo(res.data.codigo_comercio || '');
          setTbAmbiente(res.data.ambiente || 'INTEGRACION');
          setTbActivo(res.data.activo ?? true);
          setTbMaskedKey(res.data.api_key_enmascarada || '');
          setTbIsConfigured(Boolean(res.data.configurado));
        }
      })
      .catch((err) => console.error('Error al conectar con Transbank:', err))
      .finally(() => setTbLoading(false));

    // 2. Cargar PayPal
    setPpLoading(true);
    fetch(`${API_BASE}/api/catalog/tiendas/${TIENDA_ID}/configuracion/paypal/`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })
      .then((res) => res.json())
      .then((res) => {
        if (res.exito && res.data) {
          setPpClientId(res.data.client_id || '');
          setPpAmbiente(res.data.ambiente || 'SANDBOX');
          setPpActivo(res.data.activo ?? false);
          setPpMaskedSecret(res.data.client_secret_enmascarado || '');
          setPpIsConfigured(Boolean(res.data.configurado));
        }
      })
      .catch((err) => console.error('Error al conectar con PayPal:', err))
      .finally(() => setPpLoading(false));

    // 3. Cargar Mercado Pago
    setMpLoading(true);
    fetch(`${API_BASE}/api/catalog/tiendas/${TIENDA_ID}/configuracion/mercadopago/`, {
      method: 'GET',
      headers: getAuthHeaders(),
    })
      .then((res) => res.json())
      .then((res) => {
        if (res.exito && res.data) {
          setMpPublicKey(res.data.public_key || '');
          setMpAmbiente(res.data.ambiente || 'SANDBOX');
          setMpActivo(res.data.activo ?? false);
          setMpMaskedToken(res.data.access_token_enmascarado || '');
          setMpIsConfigured(Boolean(res.data.configurado));
        }
      })
      .catch((err) => console.error('Error al conectar con Mercado Pago:', err))
      .finally(() => setMpLoading(false));
  }, []);

  // Guardar Transbank
  const handleSaveTransbank = async () => {
    setTbSaving(true);
    setTbFeedback(null);

    const payload = {
      codigo_comercio: tbCodigo.trim(),
      api_key: tbApiKey.trim() || (tbIsConfigured ? tbMaskedKey : ''),
      ambiente: tbAmbiente,
      activo: tbActivo,
    };

    try {
      const res = await fetch(`${API_BASE}/api/catalog/tiendas/${TIENDA_ID}/configuracion/transbank/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok && data.exito) {
        setTbFeedback({ type: 'success', message: 'Configuración de Transbank guardada exitosamente.' });
        setTbMaskedKey(data.data.api_key_enmascarada || '');
        setTbApiKey('');
        setTbIsConfigured(true);
        return true;
      } else {
        const errorDetail = data.error?.detalles
          ? Object.values(data.error.detalles).flat().join(' ')
          : data.mensaje || 'Error al guardar Transbank.';
        setTbFeedback({ type: 'error', message: errorDetail });
        return false;
      }
    } catch {
      setTbFeedback({ type: 'error', message: 'No se pudo conectar con el servidor backend.' });
      return false;
    } finally {
      setTbSaving(false);
    }
  };

  // Guardar PayPal
  const handleSavePayPal = async () => {
    setPpSaving(true);
    setPpFeedback(null);

    if (ppActivo && !ppClientId.trim()) {
      setPpFeedback({ type: 'error', message: 'El Client ID es obligatorio para activar PayPal.' });
      setPpSaving(false);
      return false;
    }

    const payload = {
      client_id: ppClientId.trim(),
      client_secret: ppClientSecret.trim() || (ppIsConfigured ? ppMaskedSecret : ''),
      ambiente: ppAmbiente,
      activo: ppActivo,
    };

    try {
      const res = await fetch(`${API_BASE}/api/catalog/tiendas/${TIENDA_ID}/configuracion/paypal/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok && data.exito) {
        setPpFeedback({ type: 'success', message: 'Configuración de PayPal guardada exitosamente.' });
        setPpMaskedSecret(data.data.client_secret_enmascarado || '');
        setPpClientSecret('');
        setPpIsConfigured(true);
        return true;
      } else {
        const errorDetail = data.error?.detalles
          ? Object.values(data.error.detalles).flat().join(' ')
          : data.mensaje || 'Error al guardar PayPal.';
        setPpFeedback({ type: 'error', message: errorDetail });
        return false;
      }
    } catch {
      setPpFeedback({ type: 'error', message: 'No se pudo conectar con el servidor backend.' });
      return false;
    } finally {
      setPpSaving(false);
    }
  };

  // Guardar Mercado Pago
  const handleSaveMercadoPago = async () => {
    setMpSaving(true);
    setMpFeedback(null);

    if (mpActivo && !mpPublicKey.trim()) {
      setMpFeedback({ type: 'error', message: 'La Public Key es obligatoria para activar Mercado Pago.' });
      setMpSaving(false);
      return false;
    }

    const payload = {
      public_key: mpPublicKey.trim(),
      access_token: mpAccessToken.trim() || (mpIsConfigured ? mpMaskedToken : ''),
      ambiente: mpAmbiente,
      activo: mpActivo,
    };

    try {
      const res = await fetch(`${API_BASE}/api/catalog/tiendas/${TIENDA_ID}/configuracion/mercadopago/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok && data.exito) {
        setMpFeedback({ type: 'success', message: 'Configuración de Mercado Pago guardada exitosamente.' });
        setMpMaskedToken(data.data.access_token_enmascarado || '');
        setMpAccessToken('');
        setMpIsConfigured(true);

        if (form && setForm) {
          setForm({
            ...form,
            mercadopago: {
              enabled: mpActivo,
              fields: {
                ...(form.mercadopago?.fields || {}),
                'Public Key': mpPublicKey,
                'Access Token': data.data.access_token_enmascarado || '••••••••',
              },
            },
          });
        }
        return true;
      } else {
        const errorDetail = data.error?.detalles
          ? Object.values(data.error.detalles).flat().join(' ')
          : data.mensaje || 'Error al guardar Mercado Pago.';
        setMpFeedback({ type: 'error', message: errorDetail });
        return false;
      }
    } catch {
      setMpFeedback({ type: 'error', message: 'No se pudo conectar con el servidor backend.' });
      return false;
    } finally {
      setMpSaving(false);
    }
  };

  const updateEnabled = (id: string, enabled: boolean) => {
    const current = form[id] ?? { enabled: false, fields: {} };
    
    if (enabled) {
      if (id === 'linkify') {
        const missing = linkifyRequiredFields.filter((field) => !current.fields[field]?.trim());
        if (missing.length > 0) {
          setValidationError('Completa todos los campos obligatorios de Linkify antes de habilitarlo.');
          return; 
        }
      } else {
        const method = byId[id];
        const missing = method?.fields
          .filter((field) => field.required)
          .filter((field) => !current.fields[field.key]?.trim());

        if (missing && missing.length > 0) {
          setValidationError(`Completa todos los campos obligatorios de ${method.name} antes de habilitarlo.`);
          return; 
        }
      }
    }

    setValidationError('');
    setForm({
      ...form,
      [id]: { ...current, enabled },
    });
  };

  const updateField = (id: string, field: string, value: string) => {
    const current = form[id] ?? { enabled: false, fields: {} };
    
    let shouldDisable = false;
    if (current.enabled && !value.trim()) {
      if (id === 'linkify') {
        if (linkifyRequiredFields.includes(field)) shouldDisable = true;
      } else {
        const method = byId[id];
        const isRequired = method?.fields.find((f) => f.key === field)?.required;
        if (isRequired) shouldDisable = true;
      }
    }

    setForm({
      ...form,
      [id]: { 
        ...current, 
        enabled: shouldDisable ? false : current.enabled,
        fields: { ...current.fields, [field]: value } 
      },
    });

    if (shouldDisable) {
      setValidationError(`El medio de pago ${byId[id]?.name || 'Linkify'} fue desactivado porque se borró un campo obligatorio.`);
    } else {
      setValidationError('');
    }
  };

  const validate = () => {
    const enabledMethods = Object.entries(form).filter(([, value]: any) => value?.enabled);
    if (!enabledMethods.length && !tbActivo && !ppActivo && !mpActivo) return 'Activa al menos un metodo de pago.';

    for (const [id, value] of enabledMethods as any) {
      if (id === 'linkify') {
        const missingLinkify = linkifyRequiredFields.filter(
          (field) => !value.fields[field]?.trim(),
        );

        if (missingLinkify.length) {
          return 'Completa la cuenta, URL publica, API Key y Webhook Secret de Linkify.';
        }
        continue;
      }

      const method = byId[id];
      const missing = method?.fields
        ?.filter((field) => field.required)
        ?.filter((field) => !value.fields[field.key]?.trim());

      if (missing?.length) return `Completa los campos obligatorios de ${method.name}.`;
    }
    return '';
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errorMsg = validate();
    
    if (errorMsg) {
      setValidationError(errorMsg);
      return;
    }

    setValidationError('');
    localSave();
    setIsSyncing(true);
    setBackendError('');

    try {
      const response = await fetch(`${API_BASE}/api/pagos/configuracion/`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        throw new Error('No se pudieron sincronizar los metodos de pago secundarios con el servidor.');
      }

      // Guardamos en paralelo las pasarelas reales en los modelos relacionales
      await Promise.all([handleSaveTransbank(), handleSavePayPal(), handleSaveMercadoPago()]);

    } catch (err) {
      setBackendError(err instanceof Error ? err.message : 'Error desconocido al guardar.');
    } finally {
      setIsSyncing(false);
    }
  };

  const renderLinkifyConfig = () => {
    const current = form.linkify ?? { enabled: false, fields: {} };

    return (
      <div className="border-t border-[var(--border)] pt-3 grid gap-4">
        <div className="rounded-xl bg-[var(--muted)] p-4 grid gap-2 text-sm">
          <p className="font-semibold">¿Qué es Linkify?</p>
          <p className="text-[var(--muted-foreground)]">
            Linkify no cobra las ventas por ti: valida automáticamente cuando un cliente
            te transfiere, revisando tu propia cuenta bancaria (con una clave de solo
            lectura que tú le das) y avisándote al instante. El dinero llega directo a
            tu cuenta, sin intermediarios.
          </p>
          <p className="text-[var(--muted-foreground)]">
            <strong>Costo:</strong> $19.900 + IVA al mes, incluye 50 validaciones.
            Cada validación extra cuesta $350 + IVA. Sin comisión por porcentaje,
            sin permanencia, primer mes gratis.
          </p>
          <a
            href="https://www.linkify.cl/registro"
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-2 mt-1 rounded-lg bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
          >
            Contratar Linkify
          </a>
          <p className="text-[10px] text-[var(--muted-foreground)]">
            Te abrirá el registro de Linkify en una pestaña nueva. Una vez que crees
            tu cuenta, copia tu "ID de cuenta" y "Clave privada" desde su panel
            (Mi Linkify → Cuentas → Ver datos de integración) y pégalos aquí abajo.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Input
            label="ID de cuenta *"
            value={current.fields.idCuenta ?? ''}
            placeholder="Lo encuentras en tu panel de Linkify"
            onChange={(event) => updateField('linkify', 'idCuenta', event.target.value)}
          />
          <Input
            label="Clave privada *"
            type="password"
            autoComplete="off"
            value={current.fields.clavePrivada ?? ''}
            placeholder="Clave secreta de integración"
            onChange={(event) => updateField('linkify', 'clavePrivada', event.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <p className="text-xs font-semibold text-[var(--muted-foreground)]">
            URL de integración (pégala en Linkify → Cuentas → Editar → Cobros remotos)
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={`${API_BASE}/api/pagos/linkify/notificacion/`}
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-xs"
              onFocus={(event) => event.target.select()}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigator.clipboard?.writeText(`${API_BASE}/api/pagos/linkify/notificacion/`)}
            >
              Copiar
            </Button>
          </div>
        </div>
      </div>
    );
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    localSave();
    setBackendError('');

    try {
       const response = await fetch(`${API_BASE}/api/pagos/configuracion/`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(form),
      });
      
      if (!response.ok) {
        throw new Error('No se pudo guardar Linkify / Transferencia en el servidor.');
      }
    } catch (err) {
      setBackendError(err instanceof Error ? err.message : 'Error desconocido al guardar.');
    }

    await Promise.all([handleSaveTransbank(), handleSavePayPal(), handleSaveMercadoPago()]);
  };

  return (
    <form className="flex flex-col gap-5 max-w-2xl" onSubmit={handleSubmit}>
      <Alert variant="info">
        Configura las pasarelas de pago de tu tienda. Webpay Plus, PayPal y Mercado Pago se encuentran conectados a tu backend y base de datos real.
      </Alert>

      {/* ================= TARJETA REAL: WEBPAY / TRANSBANK ================= */}
      <AdminCard>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <Icon name="card" className="w-6 h-6 text-[var(--primary)]" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-sm">Webpay / Transbank</h2>
                {tbIsConfigured && tbActivo && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#ebfdf2] text-[#027a48]">
                    API Conectada
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                Tarjeta débito, crédito y prepago chilenos
              </p>
            </div>
          </div>
          <Toggle
            ariaLabel="Activar Webpay / Transbank"
            checked={tbActivo}
            onChange={(enabled) => setTbActivo(enabled)}
          />
        </div>

        {tbFeedback && (
          <div className="mb-3">
            <Alert variant={tbFeedback.type}>{tbFeedback.message}</Alert>
          </div>
        )}

        {tbLoading ? (
          <div className="border-t border-[var(--border)] pt-3 text-xs text-[var(--muted-foreground)]">
            Cargando credenciales de pasarela...
          </div>
        ) : (
          <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Select
                label="Entorno de Operación"
                value={tbAmbiente}
                onChange={(e: any) => setTbAmbiente(e.target.value)}
                options={[
                  { value: 'INTEGRACION', label: 'Integración (Pruebas)' },
                  { value: 'PRODUCCION', label: 'Producción (Real)' },
                ]}
              />

              <Input
                label="Código de Comercio"
                autoComplete="off"
                type="text"
                value={tbCodigo}
                placeholder="597055555532"
                onChange={(e: any) => setTbCodigo(e.target.value)}
              />
            </div>

            <Input
              label="API Key Secret"
              autoComplete="off"
              type="password"
              value={tbApiKey}
              placeholder={tbMaskedKey ? `Guardada: ${tbMaskedKey}` : 'Ingresa la clave provista por Transbank'}
              hint={
                tbMaskedKey
                  ? `Clave guardada: ${tbMaskedKey}. Déjalo vacío si no deseas modificarla.`
                  : undefined
              }
              onChange={(e: any) => setTbApiKey(e.target.value)}
            />

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                size="sm"
                variant="primary"
                loading={tbSaving}
                onClick={handleSaveTransbank}
              >
                Guardar credenciales Transbank
              </Button>
            </div>
          </div>
        )}
      </AdminCard>

      {/* ================= TARJETA REAL: MERCADO PAGO ================= */}
      <AdminCard>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <Icon name="wallet" className="w-6 h-6 text-[#009ee3]" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-sm">Mercado Pago</h2>
                {mpIsConfigured && mpActivo && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#ebfdf2] text-[#027a48]">
                    API Conectada
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                Tarjetas, saldo de Mercado Pago y checkout Pro
              </p>
            </div>
          </div>
          <Toggle
            ariaLabel="Activar Mercado Pago"
            checked={mpActivo}
            onChange={(enabled) => setMpActivo(enabled)}
          />
        </div>

        {mpFeedback && (
          <div className="mb-3">
            <Alert variant={mpFeedback.type}>{mpFeedback.message}</Alert>
          </div>
        )}

        {mpLoading ? (
          <div className="border-t border-[var(--border)] pt-3 text-xs text-[var(--muted-foreground)]">
            Cargando credenciales de Mercado Pago...
          </div>
        ) : (
          <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Select
                label="Entorno de Operación"
                value={mpAmbiente}
                onChange={(e: any) => setMpAmbiente(e.target.value)}
                options={[
                  { value: 'SANDBOX', label: 'Sandbox (Pruebas)' },
                  { value: 'PRODUCCION', label: 'Producción (Real)' },
                ]}
              />

              <Input
                label="Public Key"
                autoComplete="off"
                type="text"
                value={mpPublicKey}
                placeholder="TEST-xxxx o APP_USR-xxxx"
                onChange={(e: any) => setMpPublicKey(e.target.value)}
              />
            </div>

            <Input
              label="Access Token"
              autoComplete="off"
              type="password"
              value={mpAccessToken}
              placeholder={mpMaskedToken ? `Guardado: ${mpMaskedToken}` : 'Ingresa el Access Token provisto por Mercado Pago'}
              hint={
                mpMaskedToken
                  ? `Token guardado: ${mpMaskedToken}. Déjalo vacío si no deseas modificarlo.`
                  : undefined
              }
              onChange={(e: any) => setMpAccessToken(e.target.value)}
            />

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                size="sm"
                variant="primary"
                loading={mpSaving}
                onClick={handleSaveMercadoPago}
              >
                Guardar credenciales Mercado Pago
              </Button>
            </div>
          </div>
        )}
      </AdminCard>

      {/* ================= TARJETA REAL: PAYPAL ================= */}
      <AdminCard>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <Icon name="paypal" className="w-6 h-6 text-[#003087]" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-sm">PayPal</h2>
                {ppIsConfigured && ppActivo && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#ebfdf2] text-[#027a48]">
                    API Conectada
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                PayPal y tarjetas internacionales
              </p>
            </div>
          </div>
          <Toggle
            ariaLabel="Activar PayPal"
            checked={ppActivo}
            onChange={(enabled) => setPpActivo(enabled)}
          />
        </div>

        {ppFeedback && (
          <div className="mb-3">
            <Alert variant={ppFeedback.type}>{ppFeedback.message}</Alert>
          </div>
        )}

        {ppLoading ? (
          <div className="border-t border-[var(--border)] pt-3 text-xs text-[var(--muted-foreground)]">
            Cargando credenciales de PayPal...
          </div>
        ) : (
          <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Select
                label="Entorno de Operación"
                value={ppAmbiente}
                onChange={(e: any) => setPpAmbiente(e.target.value)}
                options={[
                  { value: 'SANDBOX', label: 'Sandbox (Pruebas)' },
                  { value: 'LIVE', label: 'Live (Producción)' },
                ]}
              />

              <Input
                label="Client ID"
                autoComplete="off"
                type="text"
                value={ppClientId}
                placeholder="Client ID provisto por PayPal Developer"
                onChange={(e: any) => setPpClientId(e.target.value)}
              />
            </div>

            <Input
              label="Client Secret"
              autoComplete="off"
              type="password"
              value={ppClientSecret}
              placeholder={ppMaskedSecret ? `Guardada: ${ppMaskedSecret}` : 'Ingresa la Secret Key de PayPal'}
              hint={
                ppMaskedSecret
                  ? `Clave guardada: ${ppMaskedSecret}. Déjalo vacío si no deseas modificarla.`
                  : undefined
              }
              onChange={(e: any) => setPpClientSecret(e.target.value)}
            />

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                size="sm"
                variant="primary"
                loading={ppSaving}
                onClick={handleSavePayPal}
              >
                Guardar credenciales PayPal
              </Button>
            </div>
          </div>
        )}
      </AdminCard>

        {/* ================= TARJETAS SECUNDARIAS (DEMO) ================= */}
      {otherMethods.map((method) => {
        const current = form[method.id] ?? { enabled: false, fields: {} };
        const isTransfer = method.id === 'transfer';

        return (
          <AdminCard key={method.id}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <Icon name={method.icon} className="w-6 h-6" />
                <div>
                  <h2 className="font-semibold text-sm">{method.name}</h2>
                  <p className="text-xs text-[var(--muted-foreground)]">{method.desc}</p>
                </div>
              </div>

              <Toggle
                ariaLabel={`Activar ${method.name}`}
                checked={current.enabled}
                onChange={(enabled) => updateEnabled(method.id, enabled)}
              />
            </div>

            {method.id === 'linkify' ? (
              renderLinkifyConfig()
            ) : (
              <div className="grid sm:grid-cols-2 gap-3 border-t border-[var(--border)] pt-3">
                {method.fields.map((field) => (
                  <Input
                    key={field}
                    label={field}
                    autoComplete="off"
                    type={/key|token|secret/i.test(field) ? 'password' : 'text'}
                    value={current.fields?.[field] ?? ''}
                    placeholder={method.id === 'transfer' ? 'Dato de ejemplo' : 'Credencial demo'}
                    onChange={(e: any) =>
                      setForm({
                        ...form,
                        [method.id]: {
                          ...current,
                          fields: { ...current.fields, [field]: e.target.value },
                        },
                      })
                    }
                  />
                ))}
              </div>
            )}

            {isTransfer && (
              <div className="border-t border-[var(--border)] pt-3 mt-3">
                <Textarea
                  label="Instrucciones de conciliacion"
                  value={current.fields?.instructions ?? ''}
                  placeholder="Validar el comprobante contra monto, correo y numero de pedido."
                  rows={3}
                  onChange={(e: any) =>
                    setForm({
                      ...form,
                      [method.id]: {
                        ...current,
                        fields: { ...current.fields, instructions: e.target.value },
                      },
                    })
                  }
                />
              </div>
            )}
          </AdminCard>
        );
      })}

      {validationError && <Alert variant="error">{validationError}</Alert>}
      {backendError && <Alert variant="error">{backendError}</Alert>}
      {saved && <Alert variant="success">Métodos de pago guardados correctamente.</Alert>}

      <Button type="submit" loading={tbSaving || ppSaving || mpSaving || isSyncing}>
        Guardar todos los métodos de pago
      </Button>
    </form>
  );
}