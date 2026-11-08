import { requestEnvelope } from '../../../shared/services/apiRequest';
import { humanizeAdminError } from '../utils/humanizeError';
import React, { useState, useEffect, useRef } from 'react';
import { LoadingState } from '../../../shared/components/states';
import { withoutPrivateCredentials } from '../../../shared/services/sensitiveConfiguration';

import { useAdminForm } from '../hooks/useAdminForm';
import { AdminCard, Alert, Input, Toggle, Button, Icon, Select } from '../components/ui';
import { TransferConfigForm } from '../components/TransferConfigForm';
import { PendingTransfers } from '../components/PendingTransfers';
import {
  linkifyRequiredFields,
  validateLinkifyFields,
} from '../services/linkifyValidation';
import {
  findTransferBank,
  transferBanks,
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
    id: 'tuu',
    name: 'TUU Pago Online',
    icon: 'card',
    desc: 'Pago con tarjeta mediante TUU (Haulmer). Requiere cuenta TUU y callback HTTPS público',
    fields: ['accountId', 'secretKey'],
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

const boolValue = (value?: string) => value === 'true';

export default function Payments() {

  const { form, setForm, save, saved } = useAdminForm('paymentConfiguration');
  const syncing = useRef(false);
  const pendingSaves = useRef(new Set<string>());
  const savedTransfer = useRef<{ enabled: boolean; fields: Record<string, string> } | null>(null);



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
  const [linkifyFieldErrors, setLinkifyFieldErrors] = useState<Record<string, string>>({});
  const [linkifySaving, setLinkifySaving] = useState(false);
  const [linkifyFeedback, setLinkifyFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
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
          throw new Error('No pudimos identificar tu tienda. Intenta nuevamente.');
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
        if (active) {
          savedTransfer.current = {
            enabled: transfer?.enabled === true,
            fields: transfer?.fields && typeof transfer.fields === 'object' ? transfer.fields : {},
          };
          setForm({
            ...(form || {}),
            transfer: {
              enabled: transfer?.enabled === true,
              fields:
                transfer?.fields && typeof transfer.fields === 'object'
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
    if (pendingSaves.current.has('transbank')) return false;
    if (!tiendaId) {
      setTbFeedback({ type: 'error', message: 'No se pudo identificar la tienda del emprendedor.' });
      return false;
    }

    setTbSaving(true);
    setTbFeedback(null);

    if (
      (tbActivo || tbCodigo.trim() || tbApiKey.trim()) &&
      (
        !tbCodigo.trim() ||
        (!tbApiKey.trim() && !tbIsConfigured)
      )
    ) {
      setTbFeedback({
        type: 'error',
        message: 'Completa el código de comercio y la clave de Transbank antes de guardar.',
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



    pendingSaves.current.add('transbank');
    try {

      const data: any = await requestEnvelope(`${API_BASE}/api/catalog/tiendas/${tiendaId}/configuracion/transbank/`, {

        method: 'POST',

        headers: getAuthHeaders(),

        body: JSON.stringify(payload),

      });


      if (data.exito === true && data.data && !Array.isArray(data.data) && typeof data.data.activo === 'boolean' && typeof data.data.configurado === 'boolean' && typeof data.data.ambiente === 'string') {

        setTbFeedback({ type: 'success', message: 'Configuración de Transbank guardada exitosamente.' });

        setTbMaskedKey(data.data.api_key_enmascarada || '');

        setTbApiKey('');

        setTbIsConfigured(data.data.configurado);

        return true;

      } else {

        const errorDetail = 'No pudimos confirmar la configuración guardada. Actualiza la página antes de volver a intentar.';

        setTbFeedback({ type: 'error', message: humanizeAdminError(errorDetail) });

        return false;

      }

    } catch (cause) {

      setTbFeedback({ type: 'error', message: humanizeAdminError(cause instanceof Error ? cause.message : '', 'No pudimos guardar la configuración de pagos. Revisa tu conexión e intenta nuevamente.') });

      return false;

    } finally {
      pendingSaves.current.delete('transbank');

      setTbSaving(false);

    }

  };



  // Guardar PayPal

  const handleSavePayPal = async () => {
    if (pendingSaves.current.has('paypal')) return false;
    if (!tiendaId) {
      setPpFeedback({ type: 'error', message: 'No se pudo identificar la tienda del emprendedor.' });
      return false;
    }


    setPpSaving(true);

    setPpFeedback(null);



    if (
      (ppActivo || ppClientId.trim() || ppClientSecret.trim()) &&
      (
        !ppClientId.trim() ||
        (!ppClientSecret.trim() && !ppIsConfigured)
      )
    ) {
      setPpFeedback({
        type: 'error',
        message: 'Completa el identificador y la clave de PayPal antes de guardar.',
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



    pendingSaves.current.add('paypal');
    try {

      const data: any = await requestEnvelope(`${API_BASE}/api/catalog/tiendas/${tiendaId}/configuracion/paypal/`, {

        method: 'POST',

        headers: getAuthHeaders(),

        body: JSON.stringify(payload),

      });


      if (data.exito === true && data.data && !Array.isArray(data.data) && typeof data.data.activo === 'boolean' && typeof data.data.configurado === 'boolean' && typeof data.data.ambiente === 'string') {

        setPpFeedback({ type: 'success', message: 'Configuración de PayPal guardada exitosamente.' });

        setPpMaskedSecret(data.data.client_secret_enmascarado || '');

        setPpClientSecret('');

        setPpIsConfigured(data.data.configurado);

        return true;

      } else {

        const errorDetail = 'No pudimos confirmar la configuración guardada. Actualiza la página antes de volver a intentar.';

        setPpFeedback({ type: 'error', message: humanizeAdminError(errorDetail) });

        return false;

      }

    } catch (cause) {

      setPpFeedback({ type: 'error', message: humanizeAdminError(cause instanceof Error ? cause.message : '', 'No pudimos guardar la configuración de pagos. Revisa tu conexión e intenta nuevamente.') });

      return false;

    } finally {
      pendingSaves.current.delete('paypal');

      setPpSaving(false);

    }

  };



  // Guardar Mercado Pago

  const handleSaveMercadoPago = async () => {
    if (pendingSaves.current.has('mercadopago')) return false;
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
        message: 'Completa la clave pública y la clave privada de Mercado Pago para activarlo.',
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



    pendingSaves.current.add('mercadopago');
    try {

      const data: any = await requestEnvelope(`${API_BASE}/api/catalog/tiendas/${tiendaId}/configuracion/mercadopago/`, {

        method: 'POST',

        headers: getAuthHeaders(),

        body: JSON.stringify(payload),

      });


      if (data.exito === true && data.data && !Array.isArray(data.data) && typeof data.data.activo === 'boolean' && typeof data.data.configurado === 'boolean' && typeof data.data.ambiente === 'string') {

        setMpFeedback({ type: 'success', message: 'Configuración de Mercado Pago guardada exitosamente.' });

        setMpMaskedToken(data.data.access_token_enmascarado || '');

        setMpAccessToken('');

        setMpIsConfigured(data.data.configurado);



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

        const errorDetail = 'No pudimos confirmar la configuración guardada. Actualiza la página antes de volver a intentar.';

        setMpFeedback({ type: 'error', message: humanizeAdminError(errorDetail) });

        return false;

      }

    } catch (cause) {

      setMpFeedback({ type: 'error', message: humanizeAdminError(cause instanceof Error ? cause.message : '', 'No pudimos guardar la configuración de pagos. Revisa tu conexión e intenta nuevamente.') });

      return false;

    } finally {
      pendingSaves.current.delete('mercadopago');

      setMpSaving(false);

    }

  };



  const handleSaveTransfer = async () => {
    if (pendingSaves.current.has('transfer')) return false;
    setTransferSaving(true);
    setTransferFeedback(null);

    const current = form.transfer ?? { enabled: false, fields: {} };
    const validation = validateTransferFields(current.fields);
    setTransferFieldErrors(validation.errors);
    const onlyDisabling = !current.enabled && savedTransfer.current?.enabled === true &&
      JSON.stringify(current.fields) === JSON.stringify(savedTransfer.current.fields);
    if (!onlyDisabling && validation.invalidFields.length) {
      setTransferFeedback({ type: 'error', message: validation.message });
      setTransferSaving(false);
      return false;
    }
    setTransferFieldErrors({});

    pendingSaves.current.add('transfer');
    try {
      const currentBody: any = await requestEnvelope(`${API_BASE}/api/pagos/configuracion/`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      const mergedConfiguration = {
        ...(currentBody.data ?? {}),
        transfer: {
          enabled: current.enabled === true,
          fields: { ...(current.fields ?? {}) },
        },
      };

      await requestEnvelope(`${API_BASE}/api/pagos/configuracion/`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(mergedConfiguration),
      });

      savedTransfer.current = structuredClone(current);
      setTransferFeedback({
        type: 'success',
        message: 'Datos bancarios guardados para esta tienda.',
      });
      return true;
    } catch (error) {
      setTransferFeedback({
        type: 'error',
        message: error instanceof Error ? humanizeAdminError(error.message) : 'No se pudo guardar la transferencia bancaria.',
      });
      return false;
    } finally {
      pendingSaves.current.delete('transfer');
      setTransferSaving(false);
    }
  };
  const requiredKeysFor = (id: string): string[] =>
    id === 'linkify' ? linkifyRequiredFields : id === 'tuu' ? ['accountId', 'secretKey'] : id === 'transfer' ? transferRequiredFields : [];
  const methodName = (id: string) => otherMethods.find((method) => method.id === id)?.name ?? id;

  const updateEnabled = (id: string, enabled: boolean) => {
    const current = form[id] ?? { enabled: false, fields: {} };
    
    if (enabled) {
      if (id === 'linkify') {
        const validation = validateLinkifyFields(current.fields);
        setLinkifyFieldErrors(validation.errors);
        if (validation.invalidFields.length > 0) {
          setValidationError(validation.message);
          return; 
        }
      } else {
        const validation = id === 'transfer'
          ? validateTransferFields(current.fields)
          : {
              invalidFields: requiredKeysFor(id).filter((key) => !current.fields?.[key]?.trim()),
              errors: {},
              message: '',
            };
        if (validation.invalidFields.length > 0) {
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
    const nextFields = { ...current.fields, [field]: value };
    if (id === 'transfer' && field === 'bank_name') {
      const bank = findTransferBank(value, transferBanks);
      if (!bank?.account_types.includes(nextFields.account_type)) nextFields.account_type = '';
    }
    
    let shouldDisable = false;
    if (id === 'transfer' && current.enabled && !nextFields.account_type?.trim()) shouldDisable = true;
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
        fields: nextFields,
      },
    });

    if (id === 'linkify') {
      const validation = validateLinkifyFields({ ...current.fields, [field]: value });
      setLinkifyFieldErrors((currentErrors) => {
        const nextErrors = { ...currentErrors };
        if (validation.errors[field]) nextErrors[field] = validation.errors[field];
        else delete nextErrors[field];
        return nextErrors;
      });
    }

    if (id === 'transfer') {
      const validation = validateTransferFields(nextFields);
      setTransferFieldErrors((currentErrors) => {
        const nextErrors = { ...currentErrors };
        for (const key of new Set([field, ...Object.keys(currentErrors)])) {
          if (validation.errors[key]) nextErrors[key] = validation.errors[key];
          else delete nextErrors[key];
        }
        return nextErrors;
      });
      setTransferFeedback(null);
    }

    if (shouldDisable) {
      setValidationError(`El medio de pago ${methodName(id)} fue desactivado porque se borró un campo obligatorio.`);
    } else {
      setValidationError('');
    }
  };

  const validate = () => {
    if ((tbActivo || tbCodigo.trim() || tbApiKey.trim()) &&
        (!tbCodigo.trim() || (!tbApiKey.trim() && !tbIsConfigured))) {
      return 'Completa el código de comercio y la clave de Transbank antes de guardar.';
    }
    if ((ppActivo || ppClientId.trim() || ppClientSecret.trim()) &&
        (!ppClientId.trim() || (!ppClientSecret.trim() && !ppIsConfigured))) {
      return 'Completa el identificador y la clave de PayPal antes de guardar.';
    }
    const enabledSecondary = otherMethods.filter((method) => form[method.id]?.enabled);
    const linkifyFields = form.linkify?.fields ?? {};
    if (form.linkify?.enabled) {
      const linkifyValidation = validateLinkifyFields(linkifyFields);
      setLinkifyFieldErrors(linkifyValidation.errors);
      if (linkifyValidation.invalidFields.length) return linkifyValidation.message;
    }

    const transfer = form.transfer;
    if (transfer && JSON.stringify(transfer) !== JSON.stringify(savedTransfer.current) &&
        (transfer.enabled || hasTransferConfigurationData(transfer.fields))) {
      const onlyDisabling = !transfer.enabled && savedTransfer.current?.enabled === true &&
        JSON.stringify(transfer.fields) === JSON.stringify(savedTransfer.current.fields);
      const result = validateTransferFields(transfer.fields);
      if (!onlyDisabling) {
        setTransferFieldErrors(result.errors);
        if (result.invalidFields.length) return result.message;
      }
    }

    if (!enabledSecondary.length && !tbActivo && !ppActivo && !mpActivo) {
      return 'Activa al menos un metodo de pago.';
    }

    for (const method of enabledSecondary) {
      const fields = form[method.id]?.fields ?? {};
      if (method.id !== 'linkify' && requiredKeysFor(method.id).some((key) => !fields[key]?.trim())) {
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
            Dirección para recibir avisos de pago: pégala en Linkify (Mi Linkify → Cuentas → Editar → Cobros remotos)
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              aria-label="Dirección para recibir avisos de pago"
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
            required
            maxLength={200}
            value={current.fields.idCuenta ?? ''}
            error={linkifyFieldErrors.idCuenta}
            placeholder="Lo encuentras en tu panel de Linkify"
            onChange={(event) => updateField('linkify', 'idCuenta', event.target.value)}
          />
          <Input
            label="Clave privada *"
            type="password"
            required
            maxLength={500}
            autoComplete="off"
            value={current.fields.clavePrivada ?? ''}
            error={linkifyFieldErrors.clavePrivada}
            placeholder="Clave secreta de integración"
            onChange={(event) => updateField('linkify', 'clavePrivada', event.target.value)}
          />
          <Select
            label="Ambiente"
            value={current.fields.environment ?? 'sandbox'}
            error={linkifyFieldErrors.environment}
            onChange={(event) => updateField('linkify', 'environment', event.target.value)}
            options={[
              { value: 'sandbox', label: 'Modo de prueba' },
              { value: 'production', label: 'Produccion' },
            ]}
          />
          <Input
            label="Vencimiento del link (horas)"
            type="number"
            min="1"
            max="8760"
            step="1"
            value={current.fields.expirationHours ?? '48'}
            error={linkifyFieldErrors.expirationHours}
            placeholder="48"
            onChange={(event) => updateField('linkify', 'expirationHours', event.target.value)}
          />
          <Input
            label="URL de retorno"
            type="url"
            value={current.fields.returnUrl ?? ''}
            error={linkifyFieldErrors.returnUrl}
            placeholder="https://mitienda.cl/pedido-confirmado"
            onChange={(event) => updateField('linkify', 'returnUrl', event.target.value)}
          />
          <Input
            label="Correo de notificaciones"
            type="email"
            value={current.fields.notificationEmail ?? ''}
            error={linkifyFieldErrors.notificationEmail}
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

        {linkifyFeedback && <Alert variant={linkifyFeedback.type}>{linkifyFeedback.message}</Alert>}
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="primary" loading={linkifySaving} onClick={handleSaveLinkify}>
            Guardar Linkify
          </Button>
        </div>
      </div>
    );
  };

  const syncLinkify = async () => {
    const current = form.linkify ?? { enabled: false, fields: {} };
    if (current.enabled) {
      const validation = validateLinkifyFields(current.fields);
      setLinkifyFieldErrors(validation.errors);
      if (validation.invalidFields.length) throw new Error(validation.message);
    } else {
      setLinkifyFieldErrors({});
    }
    // Apagado sin clave escrita: el backend conserva las credenciales ya guardadas.
    const fieldsToSend = current.enabled || String(current.fields?.clavePrivada ?? '').trim()
      ? { ...(current.fields ?? {}) }
      : {};

    const currentBody: any = await requestEnvelope(`${API_BASE}/api/pagos/configuracion/`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    await requestEnvelope(`${API_BASE}/api/pagos/configuracion/`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        ...(currentBody.data ?? {}),
        linkify: {
          enabled: current.enabled === true,
          fields: fieldsToSend,
        },
      }),
    });
  };

  const syncTuu = async () => {
    const current = form.tuu ?? { enabled: false, fields: {} };
    const complete = ['accountId', 'secretKey'].every((key) => String(current.fields?.[key] ?? '').trim());
    if (current.enabled && !complete) throw new Error('Completa el ID de cuenta y la llave secreta de TUU.');
    const currentBody: any = await requestEnvelope(`${API_BASE}/api/pagos/configuracion/`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    await requestEnvelope(`${API_BASE}/api/pagos/configuracion/`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        ...(currentBody.data ?? {}),
        tuu: { enabled: current.enabled === true, fields: current.enabled || complete ? { ...(current.fields ?? {}) } : {} },
      }),
    });
  };

  const handleSaveLinkify = async () => {
    if (linkifySaving || syncing.current) return;
    setLinkifySaving(true);
    setLinkifyFeedback(null);
    try {
      await syncLinkify();
      setLinkifyFeedback({ type: 'success', message: 'Configuración de Linkify guardada.' });
    } catch (err) {
      setLinkifyFeedback({
        type: 'error',
        message: err instanceof Error ? humanizeAdminError(err.message) : 'No se pudo guardar Linkify.',
      });
    } finally {
      setLinkifySaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (syncing.current) return;
    const errorMsg = validate();
    if (errorMsg) {
      setValidationError(errorMsg);
      return;
    }
    setValidationError('');
    syncing.current = true;
    setIsSyncing(true);
    setBackendError('');

    try {
      await syncLinkify();
      await syncTuu();
      const results = await Promise.all([
        handleSaveTransbank(),
        handleSavePayPal(),
        handleSaveMercadoPago(),
        JSON.stringify(form.transfer) === JSON.stringify(savedTransfer.current) ? Promise.resolve(true) : handleSaveTransfer(),
      ]);
      if (results.every(result => result === true)) save(withoutPrivateCredentials(form));
      else setBackendError('Algunas configuraciones no se guardaron. Revisa los mensajes de cada medio de pago y vuelve a intentarlo.');
    } catch (err) {
      setBackendError(err instanceof Error ? humanizeAdminError(err.message) : 'Error desconocido al guardar.');
    } finally {
      syncing.current = false;
      setIsSyncing(false);
    }
  };



  return (

    <form className="flex min-w-0 w-full flex-col gap-5 max-w-2xl" onSubmit={handleSubmit} noValidate>

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

                    Cuenta conectada

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

            <LoadingState size="sm" align="start" spacing="none">Cargando credenciales de pasarela...</LoadingState>

          </div>

        ) : (

          <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-3">

            <div className="rounded-xl bg-[var(--muted)] p-4 text-sm grid gap-2">
              <h3 className="font-semibold">Conecta tu comercio con Webpay</h3>
              <p className="text-[var(--muted-foreground)]">El código de comercio identifica tu negocio y la clave secreta autoriza la conexión con Transbank. Usa las credenciales del mismo entorno.</p>
              <a href="https://transbankdevelopers.com/documentacion/como_empezar" target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2 text-[var(--primary)]">Cómo obtener las credenciales de Transbank (abre una nueva pestaña)</a>
              <p className="text-[var(--muted-foreground)]">Para pruebas, consulta las credenciales de integración. Para ventas reales, utiliza el código y la clave que Transbank entrega a tu comercio después de la afiliación y habilitación.</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">

              <Select

                label="Entorno de Operación"

                value={tbAmbiente}
                persistentHint
                hint="Integración permite hacer pruebas. Producción utiliza credenciales reales de tu comercio."

                onChange={(e: any) => setTbAmbiente(e.target.value)}

                options={[

                  { value: 'INTEGRACION', label: 'Integración (Pruebas)' },

                  { value: 'PRODUCCION', label: 'Producción (Real)' },

                ]}

              />



              <Input

                label="Código de Comercio"
                persistentHint
                hint="Ingresa el código de comercio de Webpay Plus entregado por Transbank."

                autoComplete="off"

                type="text"

                value={tbCodigo}

                placeholder="597055555532"

                onChange={(e: any) => setTbCodigo(e.target.value)}

              />

            </div>



            <Input

              label="Clave secreta de Transbank"

              autoComplete="off"

              type="password"

              value={tbApiKey}

              placeholder={tbMaskedKey ? `Guardada: ${tbMaskedKey}` : 'Ingresa la clave provista por Transbank'}

              persistentHint
              hint={

                tbMaskedKey

                  ? `Clave guardada: ${tbMaskedKey}. Déjalo vacío si no deseas modificarla.`

                  : 'Pega la API Key Secret de Transbank, no tu contraseña de acceso al portal. Esta clave permite autorizar la conexión.'

              }

              onChange={(e: any) => setTbApiKey(e.target.value)}

            />



            <div className="flex justify-end pt-2">

              <Button

                type="button"

                size="sm"

                variant="primary"

                loading={tbSaving}
                className="w-full sm:w-auto whitespace-normal"

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

                    Cuenta conectada

                  </span>

                )}

              </div>

              <p className="text-xs text-[var(--muted-foreground)]">

                Los compradores pagan en pesos (CLP) en Mercado Pago y el pedido pasa a Pagado cuando el pago es aprobado.

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

            <LoadingState size="sm" align="start" spacing="none">Cargando credenciales de Mercado Pago...</LoadingState>

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

                label="Clave pública de Mercado Pago"

                autoComplete="off"

                type="text"

                value={mpPublicKey}

                placeholder="TEST-xxxx o APP_USR-xxxx"

                onChange={(e: any) => setMpPublicKey(e.target.value)}

              />

            </div>



            <Input

              label="Clave privada de Mercado Pago"

              autoComplete="off"

              type="password"

              value={mpAccessToken}

              placeholder={mpMaskedToken ? `Guardado: ${mpMaskedToken}` : 'Ingresa la clave privada entregada por Mercado Pago'}

              persistentHint
              hint={

                mpMaskedToken

                  ? `Clave guardada: ${mpMaskedToken}. Déjalo vacío si no deseas modificarlo.`

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

                    Cuenta conectada

                  </span>

                )}

              </div>

              <p className="text-xs text-[var(--muted-foreground)]">

                PayPal no admite pesos: el cobro se hace en USD con el dólar observado (se actualiza solo) más un margen configurable en el servidor (PAYPAL_FX_MARGEN_PCT, 2% por defecto). Si no hay un tipo de cambio reciente, PayPal no se ofrece en el checkout. El pedido pasa a Pagado al capturar el pago.

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

            <LoadingState size="sm" align="start" spacing="none">Cargando credenciales de PayPal...</LoadingState>

          </div>

        ) : (

          <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-3">

            <div className="rounded-xl bg-[var(--muted)] p-4 text-sm grid gap-2">
              <h3 className="font-semibold">Configura tu aplicación de PayPal</h3>
              <p className="text-[var(--muted-foreground)]">El Client ID identifica tu aplicación y el Client Secret autoriza su conexión con PayPal. No son el correo ni la contraseña de tu cuenta.</p>
              <a href="https://developer.paypal.com/dashboard/applications" target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2 text-[var(--primary)]">Obtener credenciales en PayPal Developer (abre una nueva pestaña)</a>
              <p className="text-[var(--muted-foreground)]">Inicia sesión y abre Apps &amp; Credentials. Selecciona Sandbox o Live, crea o abre una aplicación y copia su Client ID y Secret. Ambos deben corresponder al entorno seleccionado.</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">

              <Select

                label="Entorno de Operación"

                value={ppAmbiente}
                persistentHint
                hint="Sandbox sirve para pruebas. Live usa las credenciales de producción de tu aplicación."

                onChange={(e: any) => setPpAmbiente(e.target.value)}

                options={[

                  { value: 'SANDBOX', label: 'Sandbox (Pruebas)' },

                  { value: 'LIVE', label: 'Live (Producción)' },

                ]}

              />



              <Input

                label="Identificador de PayPal"
                persistentHint
                hint="Pega el Client ID de tu aplicación desde Apps & Credentials en PayPal Developer."

                autoComplete="off"

                type="text"

                value={ppClientId}

                placeholder="Identificador entregado por PayPal"

                onChange={(e: any) => setPpClientId(e.target.value)}

              />

            </div>



            <Input

              label="Clave secreta de PayPal"

              autoComplete="off"

              type="password"

              value={ppClientSecret}

              placeholder={ppMaskedSecret ? `Guardada: ${ppMaskedSecret}` : 'Ingresa la Secret Key de PayPal'}

              persistentHint
              hint={

                ppMaskedSecret

                  ? `Clave guardada: ${ppMaskedSecret}. Déjalo vacío si no deseas modificarla.`

                  : 'Pega el Client Secret de la misma aplicación y entorno. Mantén esta clave privada.'

              }

              onChange={(e: any) => setPpClientSecret(e.target.value)}

            />



            <div className="flex justify-end pt-2">

              <Button

                type="button"

                size="sm"

                variant="primary"

                loading={ppSaving}
                className="w-full sm:w-auto whitespace-normal"

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
              <TransferConfigForm
                fields={current.fields ?? {}}
                errors={transferFieldErrors}
                disabled={transferLoading || transferSaving || Boolean(tiendaError)}
                onChange={(field, value) => updateField('transfer', field, value)}
              />
            )}

            {method.id === 'transfer' && (
              <>
                <div className="flex flex-col gap-3 pt-3">
                  {transferLoading && (
                    <LoadingState size="sm" align="start" spacing="none">Cargando datos bancarios guardados...</LoadingState>
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
                      disabled={transferLoading || Boolean(tiendaError)}
                      className="w-full sm:w-auto whitespace-normal"
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



      <Button type="submit" className="whitespace-normal" disabled={tbLoading || ppLoading || mpLoading || transferLoading || Boolean(tiendaError)} loading={isSyncing || tbSaving || ppSaving || mpSaving || transferSaving || linkifySaving}>

        Guardar todos los métodos de pago

      </Button>

    </form>

  );

}
