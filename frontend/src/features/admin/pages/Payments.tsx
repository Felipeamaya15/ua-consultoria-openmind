import React, { useState, useEffect } from 'react';

import { useAdminForm } from '../hooks/useAdminForm';
import { AdminCard, Alert, Input, Toggle, Button, Icon, Select, Textarea } from '../components/ui';
import { PendingTransfers } from '../components/PendingTransfers';
import {
  transferFieldLabels,
  transferRequiredFields,
  hasTransferConfigurationData,
  validateTransferFields,
} from '../services/transferValidation';



const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';



// Métodos de demostración secundarios restantes

const otherMethods = [
{ 
    id: 'linkify', 
    name: 'Linkify', 
    icon: 'link', 
    desc: 'Validación automática de transferencias bancarias', 
    fields: [],
  },
  {
    id: 'transfer',
    name: 'Transferencia bancaria',
    icon: 'bank',
    desc: 'Transferencia directa a la cuenta configurada para esta tienda',
    fields: [
      'bank_name',
      'account_type',
      'account_number',
      'holder_rut',
      'holder_name',
      'confirmation_email',
    ],
  },
];

const linkifyRequiredFields = ['idCuenta', 'clavePrivada'];
const boolValue = (value?: string) => value === 'true';

export default function Payments() {

  const { form, setForm, save, saved } = useAdminForm('paymentConfiguration');



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

  const [transferLoading, setTransferLoading] = useState(true);
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferFeedback, setTransferFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [transferFieldErrors, setTransferFieldErrors] = useState<Record<string, string>>({});
  const [tiendaId, setTiendaId] = useState<number | null>(null);
  const [tiendaError, setTiendaError] = useState<string | null>(null);


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
    let active = true;

    const loadConfiguration = async () => {
      setTbLoading(true);
      setPpLoading(true);
      setMpLoading(true);
      setTransferLoading(true);
      setTiendaError(null);

      try {
        const tiendaResponse = await fetch(`${API_BASE}/api/pagos/mi-tienda/`, {
          method: 'GET',
          headers: getAuthHeaders(),
        });
        const tiendaBody = await tiendaResponse.json();

        if (!tiendaResponse.ok || tiendaBody.exito !== true || !tiendaBody.data?.id_tienda) {
          throw new Error(
            tiendaBody?.mensaje ||
              'No se pudo identificar la tienda del emprendedor autenticado.',
          );
        }

        const resolvedTiendaId = Number(tiendaBody.data.id_tienda);
        if (!Number.isInteger(resolvedTiendaId) || resolvedTiendaId <= 0) {
          throw new Error('El backend devolvió un identificador de tienda inválido.');
        }

        if (!active) return;
        setTiendaId(resolvedTiendaId);

        const [tbResponse, ppResponse, mpResponse, transferResponse] = await Promise.all([
          fetch(`${API_BASE}/api/catalog/tiendas/${resolvedTiendaId}/configuracion/transbank/`, {
            method: 'GET',
            headers: getAuthHeaders(),
          }),
          fetch(`${API_BASE}/api/catalog/tiendas/${resolvedTiendaId}/configuracion/paypal/`, {
            method: 'GET',
            headers: getAuthHeaders(),
          }),
          fetch(`${API_BASE}/api/catalog/tiendas/${resolvedTiendaId}/configuracion/mercadopago/`, {
            method: 'GET',
            headers: getAuthHeaders(),
          }),
          fetch(`${API_BASE}/api/pagos/configuracion/`, {
            method: 'GET',
            headers: getAuthHeaders(),
          }),
        ]);

        const [tbBody, ppBody, mpBody, transferBody] = await Promise.all([
          tbResponse.json(),
          ppResponse.json(),
          mpResponse.json(),
          transferResponse.json(),
        ]);

        if (active && tbResponse.ok && tbBody.exito && tbBody.data) {
          setTbCodigo(tbBody.data.codigo_comercio || '');
          setTbAmbiente(tbBody.data.ambiente || 'INTEGRACION');
          setTbActivo(tbBody.data.activo ?? false);
          setTbMaskedKey(tbBody.data.api_key_enmascarada || '');
          setTbIsConfigured(Boolean(tbBody.data.configurado));
        }

        if (active && ppResponse.ok && ppBody.exito && ppBody.data) {
          setPpClientId(ppBody.data.client_id || '');
          setPpAmbiente(ppBody.data.ambiente || 'SANDBOX');
          setPpActivo(ppBody.data.activo ?? false);
          setPpMaskedSecret(ppBody.data.client_secret_enmascarado || '');
          setPpIsConfigured(Boolean(ppBody.data.configurado));
        }

        if (active && mpResponse.ok && mpBody.exito && mpBody.data) {
          setMpPublicKey(mpBody.data.public_key || '');
          setMpAmbiente(mpBody.data.ambiente || 'SANDBOX');
          setMpActivo(mpBody.data.activo ?? false);
          setMpMaskedToken(mpBody.data.access_token_enmascarado || '');
          setMpIsConfigured(Boolean(mpBody.data.configurado));
        }

        if (!transferResponse.ok || transferBody.exito !== true) {
          throw new Error(
            transferBody?.mensaje || 'No se pudo cargar la configuración bancaria.',
          );
        }

        const transfer = transferBody.data?.transfer;
        if (active && transfer && typeof transfer === 'object') {
          setForm({
            ...(form || {}),
            transfer: {
              enabled: transfer.enabled === true,
              fields:
                transfer.fields && typeof transfer.fields === 'object'
                  ? transfer.fields
                  : {},
            },
          });
        }
      } catch (error) {
        if (!active) return;
        const message =
          error instanceof Error
            ? error.message
            : 'No se pudo cargar la configuración de pagos.';
        setTiendaError(message);
        setTransferFeedback({ type: 'error', message });
      } finally {
        if (active) {
          setTbLoading(false);
          setPpLoading(false);
          setMpLoading(false);
          setTransferLoading(false);
        }
      }
    };

    void loadConfiguration();

    return () => {
      active = false;
    };
  }, [setForm]);



  // Guardar Transbank

  const handleSaveTransbank = async () => {
    if (!tiendaId) {
      setTbFeedback({ type: 'error', message: 'No se pudo identificar la tienda del emprendedor.' });
      return false;
    }

    setTbSaving(true);
    setTbFeedback(null);

    if (
      tbActivo &&
      (
        !tbCodigo.trim() ||
        (!tbApiKey.trim() && !tbIsConfigured)
      )
    ) {
      setTbFeedback({
        type: 'error',
        message: 'Código de comercio y API Key son obligatorios para activar Transbank.',
      });
      setTbSaving(false);
      return false;
    }

    const payload = {

      codigo_comercio: tbCodigo.trim(),

      api_key: tbApiKey.trim() || (tbIsConfigured ? tbMaskedKey : ''),

      ambiente: tbAmbiente,

      activo: tbActivo,

    };



    try {

      const res = await fetch(`${API_BASE}/api/catalog/tiendas/${tiendaId}/configuracion/transbank/`, {

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
    if (!tiendaId) {
      setPpFeedback({ type: 'error', message: 'No se pudo identificar la tienda del emprendedor.' });
      return false;
    }


    setPpSaving(true);

    setPpFeedback(null);



    if (
      ppActivo &&
      (
        !ppClientId.trim() ||
        (!ppClientSecret.trim() && !ppIsConfigured)
      )
    ) {
      setPpFeedback({
        type: 'error',
        message: 'Client ID y Client Secret son obligatorios para activar PayPal.',
      });
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

      const res = await fetch(`${API_BASE}/api/catalog/tiendas/${tiendaId}/configuracion/paypal/`, {

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
    if (!tiendaId) {
      setMpFeedback({ type: 'error', message: 'No se pudo identificar la tienda del emprendedor.' });
      return false;
    }


    setMpSaving(true);

    setMpFeedback(null);



    if (
      mpActivo &&
      (
        !mpPublicKey.trim() ||
        (!mpAccessToken.trim() && !mpIsConfigured)
      )
    ) {
      setMpFeedback({
        type: 'error',
        message: 'Public Key y Access Token son obligatorios para activar Mercado Pago.',
      });
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

      const res = await fetch(`${API_BASE}/api/catalog/tiendas/${tiendaId}/configuracion/mercadopago/`, {

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



  const handleSaveTransfer = async () => {
    setTransferSaving(true);
    setTransferFeedback(null);

    const current = form.transfer ?? { enabled: false, fields: {} };
    const validation = validateTransferFields(current.fields);
    setTransferFieldErrors(validation.errors);
    if ((current.enabled || hasTransferConfigurationData(current.fields)) && validation.missing.length) {
      setTransferFeedback({ type: 'error', message: validation.message });
      setTransferSaving(false);
      return false;
    }
    setTransferFieldErrors({});

    try {
      const currentResponse = await fetch(`${API_BASE}/api/pagos/configuracion/`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      const currentBody = await currentResponse.json();
      if (!currentResponse.ok || currentBody.exito !== true) {
        throw new Error(currentBody?.mensaje || 'No se pudo consultar la configuración actual.');
      }

      const mergedConfiguration = {
        ...(currentBody.data ?? {}),
        transfer: {
          enabled: current.enabled === true,
          fields: { ...(current.fields ?? {}) },
        },
      };

      const response = await fetch(`${API_BASE}/api/pagos/configuracion/`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(mergedConfiguration),
      });
      const body = await response.json();

      if (!response.ok || body.exito !== true) {
        const detail = body?.error?.detalles
          ? Object.values(body.error.detalles).flat().join(' ')
          : body?.mensaje || 'No se pudo guardar la transferencia bancaria.';
        throw new Error(detail);
      }

      setTransferFeedback({
        type: 'success',
        message: 'Datos bancarios guardados en el backend para esta tienda.',
      });
      return true;
    } catch (error) {
      setTransferFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'No se pudo guardar la transferencia bancaria.',
      });
      return false;
    } finally {
      setTransferSaving(false);
    }
  };
  const requiredKeysFor = (id: string): string[] =>
    id === 'linkify' ? linkifyRequiredFields : id === 'transfer' ? transferRequiredFields : [];
  const methodName = (id: string) => otherMethods.find((method) => method.id === id)?.name ?? id;

  const updateEnabled = (id: string, enabled: boolean) => {
    const current = form[id] ?? { enabled: false, fields: {} };
    
    if (enabled) {
      if (id === 'linkify') {
        const missing = linkifyRequiredFields.filter((field) => !current.fields?.[field]?.trim());
        if (missing.length > 0) {
          setValidationError('Completa todos los campos obligatorios de Linkify antes de habilitarlo.');
          return; 
        }
      } else {
        const validation = id === 'transfer'
          ? validateTransferFields(current.fields)
          : {
              missing: requiredKeysFor(id).filter((key) => !current.fields?.[key]?.trim()),
              errors: {},
              message: '',
            };
        if (validation.missing.length > 0) {
          if (id === 'transfer') setTransferFieldErrors(validation.errors);
          setValidationError(id === 'transfer'
            ? validation.message
            : `Completa todos los campos obligatorios de ${methodName(id)} antes de habilitarlo.`);
          return;
        }
      }
    }

    setValidationError('');
    setForm({
      ...form,
      [id]: { ...current, enabled }
    });
  };

  const updateField = (id: string, field: string, value: string) => {
    const current = form[id] ?? { enabled: false, fields: {} };
    
    let shouldDisable = false;
    if (current.enabled && !value.trim()) {
      if (id === 'linkify') {
        if (linkifyRequiredFields.includes(field)) shouldDisable = true;
      } else {
        if (requiredKeysFor(id).includes(field)) shouldDisable = true;
      }
    }

    setForm({
      ...form,
      [id]: { 
        ...current, 
        enabled: shouldDisable ? false : current.enabled,
        fields: { ...current.fields, [field]: value },
      },
    });

    if (id === 'transfer' && value.trim()) {
      setTransferFieldErrors((currentErrors) => {
        const nextErrors = { ...currentErrors };
        delete nextErrors[field];
        return nextErrors;
      });
      setTransferFeedback((currentFeedback) =>
        currentFeedback?.type === 'error' ? null : currentFeedback,
      );
    }

    if (shouldDisable) {
      setValidationError(`El medio de pago ${methodName(id)} fue desactivado porque se borró un campo obligatorio.`);
    } else {
      setValidationError('');
    }
  };

  const validate = () => {
    const enabledSecondary = otherMethods.filter((method) => form[method.id]?.enabled);
    if (!enabledSecondary.length && !tbActivo && !ppActivo && !mpActivo) {
      return 'Activa al menos un metodo de pago.';
    }

    for (const method of enabledSecondary) {
      const fields = form[method.id]?.fields ?? {};
      if (method.id === 'linkify') {
        const missingLinkify = linkifyRequiredFields.filter((field) => !fields[field]?.trim());
        if (missingLinkify.length) {
          return 'Completa la cuenta y clave privada de Linkify.';
        }
      } else if (requiredKeysFor(method.id).some((key) => !fields[key]?.trim())) {
        return `Completa los campos obligatorios de ${method.name}.`;
      }
    }
    return '';
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

        <div className="grid gap-2">
          <p className="text-xs font-semibold text-[var(--muted-foreground)]">
            URL de integración: pégala en Linkify (Mi Linkify → Cuentas → Editar → Cobros remotos)
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
          <p className="text-[10px] text-[var(--muted-foreground)]">
            Linkify avisará a esta dirección cuando confirme una transferencia y el pedido pasará a «Pagado».
            Debe ser una dirección pública con HTTPS: desde localhost Linkify no puede alcanzarla.
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
          <Select
            label="Ambiente"
            value={current.fields.environment ?? 'sandbox'}
            onChange={(event) => updateField('linkify', 'environment', event.target.value)}
            options={[
              { value: 'sandbox', label: 'Sandbox' },
              { value: 'production', label: 'Produccion' },
            ]}
          />
          <Input
            label="Vencimiento del link (horas)"
            type="number"
            min="1"
            value={current.fields.expirationHours ?? '48'}
            placeholder="48"
            onChange={(event) => updateField('linkify', 'expirationHours', event.target.value)}
          />
          <Input
            label="URL de retorno"
            type="url"
            value={current.fields.returnUrl ?? ''}
            placeholder="https://mitienda.cl/pedido-confirmado"
            onChange={(event) => updateField('linkify', 'returnUrl', event.target.value)}
          />
          <Input
            label="Correo de notificaciones"
            type="email"
            value={current.fields.notificationEmail ?? ''}
            placeholder="pagos@mitienda.cl"
            onChange={(event) => updateField('linkify', 'notificationEmail', event.target.value)}
          />
        </div>

        <div className="grid gap-3">
          <Toggle
            label="Sincronizar pagos aprobados con pedidos"
            checked={boolValue(current.fields.syncApprovedPayments)}
            onChange={(enabled) => updateField('linkify', 'syncApprovedPayments', String(enabled))}
          />
          <Toggle
            label="Enviar correo al cliente cuando se genere el link"
            checked={boolValue(current.fields.emailCustomer)}
            onChange={(enabled) => updateField('linkify', 'emailCustomer', String(enabled))}
          />
          <Toggle
            label="Expirar links pendientes automaticamente"
            checked={boolValue(current.fields.autoExpireLinks)}
            onChange={(enabled) => updateField('linkify', 'autoExpireLinks', String(enabled))}
          />
        </div>
      </div>
    );
  };

  const syncLinkify = async () => {
    const current = form.linkify ?? { enabled: false, fields: {} };

    const currentResponse = await fetch(`${API_BASE}/api/pagos/configuracion/`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    const currentBody = await currentResponse.json();
    if (!currentResponse.ok || currentBody.exito !== true) {
      throw new Error(currentBody?.mensaje || 'No se pudo consultar la configuración actual.');
    }

    const response = await fetch(`${API_BASE}/api/pagos/configuracion/`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        ...(currentBody.data ?? {}),
        linkify: {
          enabled: current.enabled === true,
          fields: { ...(current.fields ?? {}) },
        },
      }),
    });
    const body = await response.json();
    if (!response.ok || body.exito !== true) {
      const detail = body?.error?.detalles
        ? Object.values(body.error.detalles).flat().join(' ')
        : body?.mensaje || 'No se pudo guardar la configuración de Linkify.';
      throw new Error(detail);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errorMsg = validate();
    if (errorMsg) {
      setValidationError(errorMsg);
      return;
    }
    setValidationError('');
    save();
    setIsSyncing(true);
    setBackendError('');

    try {
      await syncLinkify();
      await Promise.all([
        handleSaveTransbank(),
        handleSavePayPal(),
        handleSaveMercadoPago(),
        handleSaveTransfer(),
      ]);
    } catch (err) {
      setBackendError(err instanceof Error ? err.message : 'Error desconocido al guardar.');
    } finally {
      setIsSyncing(false);
    }
  };



  return (

    <form className="flex flex-col gap-5 max-w-2xl" onSubmit={handleSubmit}>

      <Alert variant="info">

        Configura y guarda las credenciales de tus medios de pago. La disponibilidad para comprar se valida por separado.

      </Alert>

      {tiendaError && (
        <Alert variant="error">{tiendaError}</Alert>
      )}

      {validationError && <Alert variant="error">{validationError}</Alert>}
      {backendError && <Alert variant="error">{backendError}</Alert>}



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

                Configuración disponible. Las compras estarán habilitadas cuando se complete la confirmación del pago.

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

                Configuración disponible. Las compras en CLP requieren completar la moneda y captura del pago.

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

        const current = form[method.id] || { enabled: false, fields: {} };

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
                ariaLabel={'Activar ' + method.name}
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
                    label={method.id === 'transfer' ? (transferFieldLabels[field] ?? field) : field}
                    autoComplete="off"
                    type={/key|token|secret/i.test(field) ? 'password' : (field === 'confirmation_email' ? 'email' : 'text')}
                    value={current.fields?.[field] ?? ''}
                    placeholder={method.id === 'transfer' ? 'Dato bancario real de la tienda' : 'Credencial demo'}
                    required={method.id === 'transfer'}
                    error={method.id === 'transfer' ? transferFieldErrors[field] : undefined}
                    onChange={(e: any) =>
                       updateField(method.id, field, e.target.value)}
                  />
                ))}
              </div>
            )}

            {method.id === 'transfer' && (
              <>
                <div className="border-t border-[var(--border)] pt-3 mt-3">
                  <Textarea
                    label="Instrucciones de conciliación"
                    value={current.fields?.instructions ?? ''}
                    placeholder="Validar el comprobante contra monto, correo y número de pedido."
                    rows={3}
                    onChange={(e: any) => updateField('transfer', 'instructions', e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-3 pt-3">
                  {transferLoading && (
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Cargando datos bancarios guardados...
                    </p>
                  )}
                  {transferFeedback && (
                    <Alert variant={transferFeedback.type}>{transferFeedback.message}</Alert>
                  )}
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      loading={transferSaving}
                      onClick={handleSaveTransfer}
                    >
                      Guardar transferencia bancaria
                    </Button>
                  </div>
                </div>
                <PendingTransfers />
              </>
            )}
          </AdminCard>

        );

      })}



      {saved && !backendError && !validationError && !isSyncing && (
        <Alert variant="success">Métodos de pago guardados correctamente.</Alert>
      )}



      <Button type="submit" loading={isSyncing || tbSaving || ppSaving || mpSaving || transferSaving}>

        Guardar todos los métodos de pago

      </Button>

    </form>

  );

}
