import React, { useState, useEffect } from 'react';

import { useAdminForm } from '../hooks/useAdminForm';

import { AdminCard, Alert, Input, Toggle, Button, Icon, Select } from '../components/ui';



const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';



// Métodos de demostración secundarios restantes

const transferFieldLabels: Record<string, string> = {
  bank_name: 'Banco',
  account_type: 'Tipo de cuenta',
  account_number: 'N° de cuenta',
  holder_rut: 'RUT del titular',
  holder_name: 'Nombre del titular',
  confirmation_email: 'Correo para comprobantes',
};

const otherMethods = [
  { id: 'linkify', name: 'Linkify', icon: 'link', desc: 'Pago por link', fields: ['API Key'] },
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
  const [tiendaId, setTiendaId] = useState<number | null>(null);
  const [tiendaError, setTiendaError] = useState<string | null>(null);



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
          setForm((currentForm: any) => ({
            ...currentForm,
            transfer: {
              enabled: transfer.enabled === true,
              fields:
                transfer.fields && typeof transfer.fields === 'object'
                  ? transfer.fields
                  : {},
            },
          }));
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
    const requiredFields = [
      'bank_name',
      'account_type',
      'account_number',
      'holder_rut',
      'holder_name',
      'confirmation_email',
    ];

    if (current.enabled) {
      const missing = requiredFields.filter(
        (field) => !String(current.fields?.[field] ?? '').trim(),
      );
      if (missing.length) {
        setTransferFeedback({
          type: 'error',
          message: 'Completa todos los datos bancarios antes de habilitar la transferencia.',
        });
        setTransferSaving(false);
        return false;
      }
    }

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    save();
    await Promise.all([
      handleSaveTransbank(),
      handleSavePayPal(),
      handleSaveMercadoPago(),
      handleSaveTransfer(),
    ]);
  };



  return (

    <form className="flex flex-col gap-5 max-w-2xl" onSubmit={handleSubmit}>

      <Alert variant="info">

        Configura las pasarelas de pago de tu tienda. Webpay Plus, PayPal y Mercado Pago se encuentran conectados a tu backend y base de datos real.

      </Alert>

      {tiendaError && (
        <Alert variant="error">{tiendaError}</Alert>
      )}



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

                onChange={(enabled) =>

                  setForm({ ...form, [method.id]: { ...current, enabled } })

                }

              />

            </div>

            <div className="grid sm:grid-cols-2 gap-3 border-t border-[var(--border)] pt-3">

              {method.fields.map((field) => (

                <Input

                  key={field}

                  label={method.id === 'transfer' ? (transferFieldLabels[field] ?? field) : field}

                  autoComplete="off"

                  type={/key|token|secret/i.test(field) ? 'password' : (field === 'confirmation_email' ? 'email' : 'text')}

                  value={current.fields?.[field] ?? ''}

                  placeholder={method.id === 'transfer' ? 'Dato bancario real de la tienda' : 'Credencial demo'}

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

            {method.id === 'transfer' && (
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
            )}

          </AdminCard>

        );

      })}



      {saved && <Alert variant="success">Métodos de pago guardados correctamente.</Alert>}



      <Button type="submit" loading={tbSaving || ppSaving || mpSaving || transferSaving}>

        Guardar todos los métodos de pago

      </Button>

    </form>

  );

}