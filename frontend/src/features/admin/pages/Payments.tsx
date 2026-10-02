import { useState, type FormEvent } from 'react';

import { useAdminForm } from '../hooks/useAdminForm';
import {
  AdminCard,
  Alert,
  Input,
  Select,
  Toggle,
  Button,
  Icon,
} from '../components/ui';

type PaymentMethod = {
  id: string;
  name: string;
  icon: string;
  desc: string;
  fields: string[];
};

const methods: PaymentMethod[] = [
  {
    id: 'transbank',
    name: 'Webpay / Transbank',
    icon: 'card',
    desc: 'Tarjeta debito, credito y prepago chilenos',
    fields: ['API Key', 'Comercio ID'],
  },
  {
    id: 'mercadopago',
    name: 'Mercado Pago',
    icon: 'card',
    desc: 'Tarjetas y saldo Mercado Pago',
    fields: ['Access Token'],
  },
  {
    id: 'paypal',
    name: 'PayPal',
    icon: 'paypal',
    desc: 'PayPal y tarjetas internacionales',
    fields: ['Client ID', 'Client Secret'],
  },
  {
    id: 'linkify',
    name: 'Linkify',
    icon: 'link',
    desc: 'Pago por link y sincronizacion de estados',
    fields: [],
  },
  {
    id: 'transfer',
    name: 'Transferencia bancaria',
    icon: 'bank',
    desc: 'Verificacion manual',
    fields: ['Banco', 'N de cuenta', 'RUT', 'Nombre titular'],
  },
];

const linkifyRequiredFields = [
  'accountName',
  'publicUrl',
  'apiKey',
  'webhookSecret',
];

const boolValue = (value?: string) => value === 'true';

export default function Payments() {
  const { form, setForm, save, saved } =
    useAdminForm('paymentConfiguration');
  const [error, setError] = useState('');

  const updateMethod = (
    id: string,
    change: Partial<{
      enabled: boolean;
      fields: Record<string, string>;
    }>,
  ) => {
    const current = form[id] ?? { enabled: false, fields: {} };
    setForm({
      ...form,
      [id]: {
        ...current,
        ...change,
        fields: {
          ...current.fields,
          ...(change.fields ?? {}),
        },
      },
    });
  };

  const updateField = (
    id: string,
    field: string,
    value: string,
  ) => {
    const current = form[id] ?? { enabled: false, fields: {} };
    updateMethod(id, {
      fields: {
        ...current.fields,
        [field]: value,
      },
    });
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const linkify = form.linkify;
    if (linkify?.enabled) {
      const missing = linkifyRequiredFields.filter(
        (field) => !linkify.fields[field]?.trim(),
      );

      if (missing.length) {
        setError(
          'Completa la cuenta, URL publica, API Key y Webhook Secret de Linkify.',
        );
        return;
      }
    }

    setError('');
    save();
  };

  const renderLinkifyConfig = () => {
    const current = form.linkify ?? {
      enabled: false,
      fields: {},
    };

    return (
      <div className="border-t border-[var(--border)] pt-3 grid gap-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Input
            label="Nombre de la cuenta *"
            value={current.fields.accountName ?? ''}
            placeholder="Mi Tienda Demo"
            onChange={(event) =>
              updateField(
                'linkify',
                'accountName',
                event.target.value,
              )
            }
          />
          <Input
            label="URL publica *"
            type="url"
            value={current.fields.publicUrl ?? ''}
            placeholder="https://linkify.cl/mi-tienda"
            onChange={(event) =>
              updateField(
                'linkify',
                'publicUrl',
                event.target.value,
              )
            }
          />
          <Input
            label="API Key *"
            type="password"
            autoComplete="off"
            value={current.fields.apiKey ?? ''}
            placeholder="lk_test_..."
            onChange={(event) =>
              updateField('linkify', 'apiKey', event.target.value)
            }
          />
          <Input
            label="Webhook Secret *"
            type="password"
            autoComplete="off"
            value={current.fields.webhookSecret ?? ''}
            placeholder="whsec_..."
            onChange={(event) =>
              updateField(
                'linkify',
                'webhookSecret',
                event.target.value,
              )
            }
          />
          <Select
            label="Ambiente"
            value={current.fields.environment ?? 'sandbox'}
            onChange={(event) =>
              updateField(
                'linkify',
                'environment',
                event.target.value,
              )
            }
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
            onChange={(event) =>
              updateField(
                'linkify',
                'expirationHours',
                event.target.value,
              )
            }
          />
          <Input
            label="URL de retorno"
            type="url"
            value={current.fields.returnUrl ?? ''}
            placeholder="https://mitienda.cl/pedido-confirmado"
            onChange={(event) =>
              updateField('linkify', 'returnUrl', event.target.value)
            }
          />
          <Input
            label="Correo de notificaciones"
            type="email"
            value={current.fields.notificationEmail ?? ''}
            placeholder="pagos@mitienda.cl"
            onChange={(event) =>
              updateField(
                'linkify',
                'notificationEmail',
                event.target.value,
              )
            }
          />
        </div>

        <div className="grid gap-3">
          <Toggle
            label="Sincronizar pagos aprobados con pedidos"
            checked={boolValue(current.fields.syncApprovedPayments)}
            onChange={(enabled) =>
              updateField(
                'linkify',
                'syncApprovedPayments',
                String(enabled),
              )
            }
          />
          <Toggle
            label="Enviar correo al cliente cuando se genere el link"
            checked={boolValue(current.fields.emailCustomer)}
            onChange={(enabled) =>
              updateField('linkify', 'emailCustomer', String(enabled))
            }
          />
          <Toggle
            label="Expirar links pendientes automaticamente"
            checked={boolValue(current.fields.autoExpireLinks)}
            onChange={(enabled) =>
              updateField('linkify', 'autoExpireLinks', String(enabled))
            }
          />
        </div>
      </div>
    );
  };

  return (
    <form
      className="flex flex-col gap-5 max-w-2xl"
      onSubmit={onSubmit}
    >
      <Alert variant="info">
        Activa los metodos de pago de tu tienda demo. Usa
        unicamente datos ficticios; no se conectan pasarelas ni
        se realizan cobros.
      </Alert>

      {methods.map((method) => {
        const current = form[method.id] ?? {
          enabled: false,
          fields: {},
        };

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
                  updateMethod(method.id, { enabled })
                }
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
                    type={
                      /key|token|secret/i.test(field)
                        ? 'password'
                        : 'text'
                    }
                    value={current.fields[field] ?? ''}
                    placeholder={
                      method.id === 'transfer'
                        ? 'Dato de ejemplo'
                        : 'Credencial demo'
                    }
                    onChange={(event) =>
                      updateField(
                        method.id,
                        field,
                        event.target.value,
                      )
                    }
                  />
                ))}
              </div>
            )}
          </AdminCard>
        );
      })}

      {error && <Alert variant="error">{error}</Alert>}
      {saved && (
        <Alert variant="success">
          Metodos de pago guardados.
        </Alert>
      )}

      <Button type="submit">Guardar metodos de pago</Button>
    </form>
  );
}
