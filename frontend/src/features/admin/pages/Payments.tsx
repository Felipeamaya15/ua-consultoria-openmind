import { useState, type FormEvent } from 'react';

import { useAdmin } from '../context/AdminContext';
import {
  AdminCard,
  Alert,
  Input,
  Textarea,
  Toggle,
  Button,
  Icon,
} from '../components/ui';
import { savePaymentConfiguration } from '../services/paymentConfigurationService';
import type { AdminConfig } from '../types';

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

type PaymentConfiguration = AdminConfig['paymentConfiguration'];

const methods: PaymentMethod[] = [
  {
    id: 'transbank',
    name: 'Webpay / Transbank',
    icon: 'card',
    desc: 'Credenciales entregadas por Transbank para iniciar pagos.',
    fields: [
      {
        key: 'api_key',
        label: 'API Key',
        type: 'password',
        placeholder: 'Clave privada de integracion',
        required: true,
      },
      {
        key: 'commerce_id',
        label: 'Codigo de comercio',
        placeholder: '597055555532',
        required: true,
      },
      {
        key: 'environment',
        label: 'Ambiente',
        placeholder: 'integration | production',
      },
    ],
  },
  {
    id: 'mercadopago',
    name: 'Mercado Pago',
    icon: 'card',
    desc: 'Token y datos necesarios para crear preferencias de pago.',
    fields: [
      {
        key: 'access_token',
        label: 'Access Token',
        type: 'password',
        placeholder: 'APP_USR-...',
        required: true,
      },
      {
        key: 'public_key',
        label: 'Public Key',
        placeholder: 'APP_USR-...',
      },
      {
        key: 'webhook_secret',
        label: 'Webhook Secret',
        type: 'password',
        placeholder: 'Secreto de webhook',
      },
    ],
  },
  {
    id: 'paypal',
    name: 'PayPal',
    icon: 'paypal',
    desc: 'Credenciales OAuth para procesar pagos internacionales.',
    fields: [
      {
        key: 'client_id',
        label: 'Client ID',
        placeholder: 'Client ID de PayPal',
        required: true,
      },
      {
        key: 'client_secret',
        label: 'Client Secret',
        type: 'password',
        placeholder: 'Client Secret de PayPal',
        required: true,
      },
      {
        key: 'environment',
        label: 'Ambiente',
        placeholder: 'sandbox | live',
      },
    ],
  },
  {
    id: 'linkify',
    name: 'Linkify',
    icon: 'link',
    desc: 'Credenciales para generar links de pago desde backend.',
    fields: [
      {
        key: 'api_key',
        label: 'API Key',
        type: 'password',
        placeholder: 'Clave API de Linkify',
        required: true,
      },
      {
        key: 'merchant_id',
        label: 'Merchant ID',
        placeholder: 'Identificador del comercio',
      },
    ],
  },
  {
    id: 'transfer',
    name: 'Transferencia bancaria',
    icon: 'bank',
    desc: 'Datos bancarios para conciliacion manual en backend.',
    fields: [
      {
        key: 'bank_name',
        label: 'Banco',
        placeholder: 'Banco Estado',
        required: true,
      },
      {
        key: 'account_type',
        label: 'Tipo de cuenta',
        placeholder: 'Cuenta corriente',
        required: true,
      },
      {
        key: 'account_number',
        label: 'Numero de cuenta',
        placeholder: '012345678',
        required: true,
      },
      {
        key: 'holder_rut',
        label: 'RUT del titular',
        placeholder: '12.345.678-9',
        required: true,
      },
      {
        key: 'holder_name',
        label: 'Nombre del titular',
        placeholder: 'Comercial Demo SpA',
        required: true,
      },
      {
        key: 'confirmation_email',
        label: 'Correo para comprobantes',
        placeholder: 'pagos@mitienda.cl',
        required: true,
      },
    ],
  },
];

const byId = Object.fromEntries(
  methods.map((method) => [method.id, method]),
);

export default function Payments() {
  const { config, setConfig } = useAdmin();
  const [form, setForm] = useState<PaymentConfiguration>(
    () => structuredClone(config.paymentConfiguration),
  );
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateEnabled = (id: string, enabled: boolean) => {
    const current = form[id] ?? { enabled: false, fields: {} };
    setForm({
      ...form,
      [id]: {
        ...current,
        enabled,
      },
    });
    setSaved(false);
  };

  const updateField = (
    id: string,
    field: string,
    value: string,
  ) => {
    const current = form[id] ?? { enabled: false, fields: {} };
    setForm({
      ...form,
      [id]: {
        ...current,
        fields: {
          ...current.fields,
          [field]: value,
        },
      },
    });
    setSaved(false);
  };

  const validate = () => {
    const enabledMethods = Object.entries(form).filter(
      ([, value]) => value.enabled,
    );

    if (!enabledMethods.length) {
      return 'Activa al menos un metodo de pago.';
    }

    for (const [id, value] of enabledMethods) {
      const method = byId[id];
      const missing = method?.fields
        .filter((field) => field.required)
        .filter((field) => !value.fields[field.key]?.trim());

      if (missing?.length) {
        return `Completa los campos obligatorios de ${method.name}.`;
      }
    }

    return '';
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setSaved(false);
      return;
    }

    setSaving(true);
    setError('');

    try {
      const savedConfiguration = await savePaymentConfiguration(form);
      if (
        setConfig({
          ...config,
          paymentConfiguration: savedConfiguration,
        })
      ) {
        setForm(savedConfiguration);
        setSaved(true);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar la configuracion de pagos.',
      );
      setSaved(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-5 max-w-2xl"
      onSubmit={onSubmit}
    >
      <Alert variant="info">
        Configura las credenciales y datos que el backend usara para
        integrar cada metodo de pago. Usa credenciales de prueba hasta
        pasar a produccion.
      </Alert>

      {methods.map((method) => {
        const current = form[method.id] ?? {
          enabled: false,
          fields: {},
        };
        const isTransfer = method.id === 'transfer';

        return (
          <AdminCard key={method.id}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <Icon
                  name={method.icon}
                  className="w-6 h-6"
                />
                <div>
                  <h2 className="font-semibold text-sm">
                    {method.name}
                  </h2>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {method.desc}
                  </p>
                </div>
              </div>

              <Toggle
                ariaLabel={`Activar ${method.name}`}
                checked={current.enabled}
                onChange={(enabled) =>
                  updateEnabled(method.id, enabled)
                }
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-3 border-t border-[var(--border)] pt-3">
              {method.fields.map((field) => (
                <Input
                  key={field.key}
                  label={
                    field.required ? `${field.label} *` : field.label
                  }
                  autoComplete="off"
                  type={field.type ?? 'text'}
                  value={current.fields[field.key] ?? ''}
                  placeholder={field.placeholder}
                  onChange={(event) =>
                    updateField(
                      method.id,
                      field.key,
                      event.target.value,
                    )
                  }
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
                  onChange={(event) =>
                    updateField(
                      method.id,
                      'instructions',
                      event.target.value,
                    )
                  }
                />
              </div>
            )}
          </AdminCard>
        );
      })}

      {error && <Alert variant="error">{error}</Alert>}
      {saved && (
        <Alert variant="success">
          Configuracion de pagos guardada en backend.
        </Alert>
      )}

      <Button type="submit" loading={saving}>
        Guardar metodos de pago
      </Button>
    </form>
  );
}
