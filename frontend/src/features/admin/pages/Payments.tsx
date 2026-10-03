import { useState, type FormEvent } from 'react';
import { useAdminForm } from '../hooks/useAdminForm';
import {
  AdminCard,
  Alert,
  Input,
  Textarea,
  Toggle,
  Button,
  Icon,
} from '../components/ui';
import { API_BASE_URL } from '../../../api';

type PaymentField = {
  key: string;
  label: string;
  type?: string;
  placeholder: string;
  required?: boolean;
};

type PaymentMethod = {
  id: string;
  name: string;
  icon: string;
  desc: string;
  fields: PaymentField[];
};

const methods: PaymentMethod[] = [
  {
    id: 'transbank',
    name: 'Webpay / Transbank',
    icon: 'card',
    desc: 'Credenciales entregadas por Transbank para iniciar pagos.',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'Clave privada de integracion', required: true },
      { key: 'commerce_id', label: 'Codigo de comercio', placeholder: '597055555532', required: true },
      { key: 'environment', label: 'Ambiente', placeholder: 'integration | production' },
    ],
  },
  {
    id: 'mercadopago',
    name: 'Mercado Pago',
    icon: 'card',
    desc: 'Token y datos necesarios para crear preferencias de pago.',
    fields: [
      { key: 'access_token', label: 'Access Token', type: 'password', placeholder: 'APP_USR-...', required: true },
      { key: 'public_key', label: 'Public Key', placeholder: 'APP_USR-...' },
      { key: 'webhook_secret', label: 'Webhook Secret', type: 'password', placeholder: 'Secreto de webhook' },
    ],
  },
  {
    id: 'paypal',
    name: 'PayPal',
    icon: 'paypal',
    desc: 'Credenciales OAuth para procesar pagos internacionales.',
    fields: [
      { key: 'client_id', label: 'Client ID', placeholder: 'Client ID de PayPal', required: true },
      { key: 'client_secret', label: 'Client Secret', type: 'password', placeholder: 'Client Secret de PayPal', required: true },
      { key: 'environment', label: 'Ambiente', placeholder: 'sandbox | live' },
    ],
  },
  {
    id: 'linkify',
    name: 'Linkify',
    icon: 'link',
    desc: 'Credenciales para generar links de pago desde backend.',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'Clave API de Linkify', required: true },
      { key: 'merchant_id', label: 'Merchant ID', placeholder: 'Identificador del comercio' },
    ],
  },
  {
    id: 'transfer',
    name: 'Transferencia bancaria',
    icon: 'bank',
    desc: 'Datos bancarios para conciliacion manual en backend.',
    fields: [
      { key: 'bank_name', label: 'Banco', placeholder: 'Banco Estado', required: true },
      { key: 'account_type', label: 'Tipo de cuenta', placeholder: 'Cuenta corriente', required: true },
      { key: 'account_number', label: 'Numero de cuenta', placeholder: '012345678', required: true },
      { key: 'holder_rut', label: 'RUT del titular', placeholder: '12.345.678-9', required: true },
      { key: 'holder_name', label: 'Nombre del titular', placeholder: 'Comercial Demo SpA', required: true },
      { key: 'confirmation_email', label: 'Correo para comprobantes', placeholder: 'pagos@mitienda.cl', required: true },
    ],
  },
];

const byId = Object.fromEntries(methods.map((method) => [method.id, method]));

export default function Payments() {
  const { form, setForm, save: localSave, saved } = useAdminForm('paymentConfiguration');
  const [isSyncing, setIsSyncing] = useState(false);
  const [backendError, setBackendError] = useState('');
  const [validationError, setValidationError] = useState('');

  const updateEnabled = (id: string, enabled: boolean) => {
    const current = form[id] ?? { enabled: false, fields: {} };
    setForm({
      ...form,
      [id]: { ...current, enabled },
    });
  };

  const updateField = (id: string, field: string, value: string) => {
    const current = form[id] ?? { enabled: false, fields: {} };
    setForm({
      ...form,
      [id]: { ...current, fields: { ...current.fields, [field]: value } },
    });
  };

  const validate = () => {
    const enabledMethods = Object.entries(form).filter(([, value]: any) => value?.enabled);
    if (!enabledMethods.length) return 'Activa al menos un metodo de pago.';

    for (const [id, value] of enabledMethods as any) {
      const method = byId[id];
      const missing = method?.fields
        .filter((field) => field.required)
        .filter((field) => !value.fields[field.key]?.trim());

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
      const token = localStorage.getItem('token') || '';
      const response = await fetch(`${API_BASE_URL}/api/pagos/configuracion/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        throw new Error('No se pudieron sincronizar los metodos de pago con el servidor.');
      }
    } catch (err) {
      setBackendError(err instanceof Error ? err.message : 'Error desconocido al guardar.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <form className="flex flex-col gap-5 max-w-2xl" onSubmit={handleSave}>
      <Alert variant="info">
        Activa los metodos de pago de tu tienda. Los pagos seleccionados aquí estarán disponibles automáticamente para el cliente en el checkout.
      </Alert>

      {methods.map((method) => {
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

            <div className="grid sm:grid-cols-2 gap-3 border-t border-[var(--border)] pt-3">
              {method.fields.map((field) => (
                <Input
                  key={field.key}
                  label={field.required ? `${field.label} *` : field.label}
                  autoComplete="off"
                  type={field.type ?? 'text'}
                  value={current.fields[field.key] ?? ''}
                  placeholder={field.placeholder}
                  onChange={(event) => updateField(method.id, field.key, event.target.value)}
                />
              ))}
            </div>

            {isTransfer && (
              <div className="border-t border-[var(--border)] pt-3 mt-3">
                <Textarea
                  label="Instrucciones de conciliacion"
                  value={current.fields.instructions ?? ''}
                  placeholder="Validar el comprobante contra monto, correo y numero de pedido."
                  rows={3}
                  onChange={(event) => updateField(method.id, 'instructions', event.target.value)}
                />
              </div>
            )}
          </AdminCard>
        );
      })}

      {validationError && <Alert variant="error">{validationError}</Alert>}
      {backendError && <Alert variant="error">{backendError}</Alert>}
      {saved && !backendError && !validationError && !isSyncing && (
        <Alert variant="success">Metodos de pago integrados y actualizados exitosamente en la tienda.</Alert>
      )}

      <Button type="submit" loading={isSyncing}>
        Guardar metodos de pago
      </Button>
    </form>
  );
}
