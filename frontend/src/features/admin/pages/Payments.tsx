import { requestEnvelope } from '../../../shared/services/apiRequest';
import { humanizeAdminError } from '../utils/humanizeError';
import React, { useState, useEffect, useRef } from 'react';
import { LoadingState } from '../../../shared/components/states';
import { withoutPrivateCredentials } from '../../../shared/services/sensitiveConfiguration';

import { useAdminForm } from '../hooks/useAdminForm';
import { AdminCard, Alert, Input, Toggle, Button, Select } from '../components/ui';
import { TransferConfigForm } from '../components/TransferConfigForm';
import { PendingTransfers } from '../components/PendingTransfers';
import { OrderExpirationSettings } from '../components/OrderExpirationSettings';
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



// Credenciales de prueba publicadas por TUU (https://developers.tuu.cl/docs/payment-intent). Solo sirven en integración.
const TUU_TEST_ACCOUNT_ID = '62224230';
const TUU_TEST_SECRET_KEY = 'yAk0dXTJLQzkeEWODsQWVpPX0bn7ND50qwoQrXgqqNiUyEpgxIPxPtoCgKeLNeh1upTw72JZx5O9x5IaAtPIGUAVcMNcsUSg3M0M8tgWdUb4F8qkS8I7rHpOUmZqzvfS';
const TUU_TEST_ACCOUNT_IDS = [TUU_TEST_ACCOUNT_ID, '26274343'];

// Métodos de demostración secundarios restantes

const otherMethods = [
  { 
    id: 'linkify', 
    name: 'Linkify', 
    desc: 'Validación automática de transferencias bancarias', 
    fields: [],
  },
  {
    id: 'tuu',
    name: 'TUU Pago Online',
    desc: 'Pago con tarjeta mediante TUU (Haulmer)', 
    fields: ['accountId', 'secretKey'],
  },
  {
    id: 'transfer',
    name: 'Transferencia bancaria',
    desc: 'Transferencia directa a la cuenta de tu tienda', 
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

function PaymentMethodBadge({ method }: { method: string }) {
  const getIcon = () => {
    switch (method) {
      case 'transbank':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
            <rect x="2" y="5" width="20" height="14" rx="3" />
            <path d="M2 10h20" />
            <path d="M6 15h3" />
          </svg>
        );
      case 'mercadopago':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
            <path d="M20 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5Z" />
            <path d="M3 10h18" />
            <circle cx="16" cy="15" r="1.5" />
          </svg>
        );
      case 'paypal':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
            <path d="M7 21h3.5l1-6.5h3.2c3.5 0 6.3-2.5 6.3-5.5S18.2 3.5 14.7 3.5H7.5a1 1 0 0 0-1 1L4 21" />
            <path d="M10.5 14.5l1-6.5h3.2c1.8 0 3.3 1.1 3.3 2.5s-1.5 2.5-3.3 2.5H11.5" />
          </svg>
        );
      case 'linkify':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        );
      case 'tuu':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
            <rect x="4" y="3" width="16" height="18" rx="2" />
            <rect x="7" y="6" width="10" height="4" rx="1" />
            <path d="M7 14h2M11 14h2M15 14h2M7 17h2M11 17h2M15 17h2" />
          </svg>
        );
      case 'transfer':
      default:
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
            <path d="M3 21h18M4 10h16M5 10l7-6 7 6M6 10v11M18 10v11M10 10v11M14 10v11" />
          </svg>
        );
    }
  };

  const getStyle = () => {
    switch (method) {
      case 'transbank':
        return 'bg-indigo-50 text-indigo-700 border-indigo-100';
      case 'mercadopago':
        return 'bg-sky-50 text-sky-700 border-sky-100';
      case 'paypal':
        return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'linkify':
        return 'bg-purple-50 text-purple-700 border-purple-100';
      case 'tuu':
        return 'bg-teal-50 text-teal-700 border-teal-100';
      case 'transfer':
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl border shrink-0 ${getStyle()}`}>
      {getIcon()}
    </span>
  );
}

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

  const fillTuuTestCredentials = () => {
    const current = form.tuu ?? { enabled: false, fields: {} };
    setForm({
      ...form,
      tuu: {
        ...current,
        fields: { ...(current.fields ?? {}), accountId: TUU_TEST_ACCOUNT_ID, secretKey: TUU_TEST_SECRET_KEY, environment: 'integracion' },
      },
    });
  };

  const changeTuuEnvironment = (value: string) => {
    const current = form.tuu ?? { enabled: false, fields: {} };
    const fields: Record<string, string> = { ...(current.fields ?? {}), environment: value };
    const usaPrueba = TUU_TEST_ACCOUNT_IDS.includes(String(fields.accountId ?? '').trim());
    if (value === 'produccion' && usaPrueba) {
      fields.accountId = '';
      fields.secretKey = '';
    }
    setForm({
      ...form,
      tuu: { ...current, enabled: value === 'produccion' && usaPrueba ? false : current.enabled, fields },
    });
  };

  const renderTuuConfig = () => {
    const current = form.tuu ?? { enabled: false, fields: {} };
    const environment = current.fields?.environment === 'produccion' ? 'produccion' : 'integracion';

    return (
      <div className="border-t border-[var(--border)] pt-3 grid gap-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <Input
            label="ID de cuenta TUU *"
            required
            maxLength={200}
            autoComplete="off"
            value={current.fields?.accountId ?? ''}
            placeholder="ID de tu cuenta TUU"
            onChange={(event) => updateField('tuu', 'accountId', event.target.value)}
          />
          <Input
            label="Llave secreta *"
            type="password"
            required
            maxLength={500}
            autoComplete="off"
            value={current.fields?.secretKey ?? ''}
            placeholder="Llave secreta de integración"
            onChange={(event) => updateField('tuu', 'secretKey', event.target.value)}
          />
        </div>
        <Select
          label="Ambiente"
          value={environment}
          onChange={(event) => changeTuuEnvironment(event.target.value)}
          options={[
            { value: 'integracion', label: 'Modo de prueba (integración)' },
            { value: 'produccion', label: 'Producción' },
          ]}
        />
        {environment === 'integracion' && (
          <div>
            <Button type="button" size="sm" variant="secondary" onClick={fillTuuTestCredentials}>
              Usar credenciales de prueba de TUU
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderLinkifyConfig = () => {
    const current = form.linkify ?? { enabled: false, fields: {} };

    return (
      <div className="border-t border-[var(--border)] pt-3 grid gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
          <span>Validación automática de transferencias bancarias mediante lectura segura de cartola.</span>
          <a
            href="https://www.linkify.cl/registro"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-[var(--primary)] hover:underline inline-flex items-center gap-1 shrink-0"
          >
            <span>Contratar o registrarse en Linkify ↗</span>
          </a>
        </div>

        <div className="grid gap-1.5">
          <label className="text-xs font-semibold text-slate-700">
            Dirección para recibir avisos de pago (URL de webhook para Linkify)
          </label>
          <div className="flex items-center gap-2">
            <input
              readOnly
              aria-label="Dirección para recibir avisos de pago"
              value={`${API_BASE}/api/pagos/linkify/notificacion/`}
              className="flex-1 rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700"
              onFocus={(event) => event.target.select()}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => navigator.clipboard?.writeText(`${API_BASE}/api/pagos/linkify/notificacion/`)}
            >
              Copiar
            </Button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Input
            label="ID de cuenta *"
            required
            maxLength={200}
            value={current.fields.idCuenta ?? ''}
            error={linkifyFieldErrors.idCuenta}
            placeholder="ID de tu panel Linkify"
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
              { value: 'production', label: 'Producción' },
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

        <div className="grid gap-2 pt-1">
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
            label="Expirar links pendientes automáticamente"
            checked={boolValue(current.fields.autoExpireLinks)}
            onChange={(enabled) => updateField('linkify', 'autoExpireLinks', String(enabled))}
          />
        </div>

        {linkifyFeedback && <Alert variant={linkifyFeedback.type}>{linkifyFeedback.message}</Alert>}
        <div className="flex justify-end pt-1">
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
        tuu: { enabled: current.enabled === true, fields: current.enabled || complete ? { ...(current.fields ?? {}), environment: current.fields?.environment === 'produccion' ? 'produccion' : 'integracion' } : {} },
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
      <div className="pb-2 border-b border-[var(--border)]">
        <h1 className="text-xl font-bold tracking-tight text-[var(--foreground)]">Medios de pago</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-0.5">
          Configura y administra las pasarelas de pago y transferencias para recibir ventas en tu tienda.
        </p>
      </div>

      {tiendaError && (
        <Alert variant="error">{tiendaError}</Alert>
      )}

      {validationError && <Alert variant="error">{validationError}</Alert>}
      {backendError && <Alert variant="error">{backendError}</Alert>}

      {/* ================= TARJETA: WEBPAY / TRANSBANK ================= */}
      <AdminCard>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <PaymentMethodBadge method="transbank" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-sm">Webpay / Transbank</h2>
                {tbIsConfigured && tbActivo && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Cuenta conectada
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                Tarjetas de débito, crédito y prepago chilenas
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-[var(--muted-foreground)] gap-1">
              <span>Ingresa las credenciales provistas por Transbank para tu comercio.</span>
              <a
                href="https://www.transbankdevelopers.cl/"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-[var(--primary)] hover:underline inline-flex items-center gap-1"
              >
                <span>Cómo obtener las credenciales de Transbank</span>
                <span aria-hidden="true">↗</span>
              </a>
            </div>

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
                placeholder="Ej. 597055555532"
                onChange={(e: any) => setTbCodigo(e.target.value)}
              />
            </div>

            <Input
              label="Clave secreta de Transbank"
              autoComplete="off"
              type="password"
              value={tbApiKey}
              placeholder={tbMaskedKey ? `Guardada: ${tbMaskedKey}` : 'Ingresa la API Key Secret de Transbank'}
              hint={
                tbMaskedKey
                  ? `Clave guardada: ${tbMaskedKey}. Déjalo vacío si no deseas modificarla.`
                  : undefined
              }
              onChange={(e: any) => setTbApiKey(e.target.value)}
            />

            <div className="flex justify-end pt-1">
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

      {/* ================= TARJETA: MERCADO PAGO ================= */}
      <AdminCard>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <PaymentMethodBadge method="mercadopago" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-sm">Mercado Pago</h2>
                {mpIsConfigured && mpActivo && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Cuenta conectada
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                Pagos con tarjetas y saldo en cuenta Mercado Pago (CLP)
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
              placeholder={mpMaskedToken ? `Guardado: ${mpMaskedToken}` : 'Ingresa tu Access Token de Mercado Pago'}
              hint={
                mpMaskedToken
                  ? `Clave guardada: ${mpMaskedToken}. Déjalo vacío si no deseas modificarlo.`
                  : undefined
              }
              onChange={(e: any) => setMpAccessToken(e.target.value)}
            />

            <div className="flex justify-end pt-1">
              <Button
                type="button"
                size="sm"
                variant="primary"
                loading={mpSaving}
                className="w-full sm:w-auto whitespace-normal"
                onClick={handleSaveMercadoPago}
              >
                Guardar credenciales Mercado Pago
              </Button>
            </div>
          </div>
        )}
      </AdminCard>

      {/* ================= TARJETA: PAYPAL ================= */}
      <AdminCard>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <PaymentMethodBadge method="paypal" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-sm">PayPal</h2>
                {ppIsConfigured && ppActivo && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Cuenta conectada
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                Pagos internacionales con tarjeta y saldo PayPal (en USD)
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-[var(--muted-foreground)] gap-1">
              <span>Ingresa el Client ID y Client Secret de tu aplicación de PayPal.</span>
              <a
                href="https://developer.paypal.com/dashboard/applications"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-[var(--primary)] hover:underline inline-flex items-center gap-1"
              >
                <span>Obtener credenciales en PayPal Developer</span>
                <span aria-hidden="true">↗</span>
              </a>
            </div>

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
                label="Identificador de PayPal"
                autoComplete="off"
                type="text"
                value={ppClientId}
                placeholder="Client ID entregado por PayPal"
                onChange={(e: any) => setPpClientId(e.target.value)}
              />
            </div>

            <Input
              label="Clave secreta de PayPal"
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

            <div className="flex justify-end pt-1">
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

      {/* ================= TARJETAS SECUNDARIAS ================= */}
      {otherMethods.map((method) => {
        const current = form[method.id] || { enabled: false, fields: {} };

        return (
          <AdminCard key={method.id}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <PaymentMethodBadge method={method.id} />
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
            ) : method.id === 'tuu' ? (
              renderTuuConfig()
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

      <OrderExpirationSettings />

      {saved && !backendError && !validationError && !isSyncing && (
        <Alert variant="success">Métodos de pago guardados correctamente.</Alert>
      )}

      <Button
        type="submit"
        className="whitespace-normal"
        disabled={tbLoading || ppLoading || mpLoading || transferLoading || Boolean(tiendaError)}
        loading={isSyncing || tbSaving || ppSaving || mpSaving || transferSaving || linkifySaving}
      >
        Guardar todos los métodos de pago
      </Button>
    </form>
  );

}
