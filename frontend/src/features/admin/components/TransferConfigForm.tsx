import { Alert, Input, Select, Textarea } from './ui';
import { findTransferBank, transferBanks, transferFieldLabels } from '../services/transferValidation';

interface Props {
  fields: Record<string, string>;
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (field: string, value: string) => void;
}

const fieldHints: Record<string, { hint: string; placeholder: string; maxLength: number }> = {
  account_number: { hint: 'Solo dígitos sin puntos ni guiones.', placeholder: 'Ej. 00123456789', maxLength: 24 },
  holder_name: { hint: 'Nombre o razón social del titular.', placeholder: 'Ej. María González Pérez', maxLength: 150 },
  holder_rut: { hint: 'RUT del titular con dígito verificador.', placeholder: 'Ej. 12.345.678-5', maxLength: 12 },
  confirmation_email: { hint: 'Correo para recibir comprobantes de pago.', placeholder: 'Ej. pagos@mitienda.cl', maxLength: 254 },
};

export function TransferConfigForm({ fields, errors, disabled, onChange }: Props) {
  const bankName = fields.bank_name ?? '';
  const accountType = fields.account_type ?? '';
  const bank = findTransferBank(bankName, transferBanks);
  const legacyBank = bankName && !bank;
  const legacyType = accountType && !bank?.account_types.includes(accountType);
  const renderInput = (field: string) => (
    <Input
      key={field}
      id={`transfer-${field}`}
      label={`${transferFieldLabels[field]} *`}
      value={fields[field] ?? ''}
      error={errors[field]}
      type={field === 'confirmation_email' ? 'email' : 'text'}
      inputMode={field === 'account_number' ? 'numeric' : undefined}
      autoComplete={field === 'confirmation_email' ? 'email' : field === 'holder_name' ? 'name' : 'off'}
      required
      {...fieldHints[field]}
      hint={field === 'account_number' && accountType === 'CuentaRUT'
        ? 'Para CuentaRUT, usa el RUT sin puntos ni dígito verificador.' : fieldHints[field].hint}
      onChange={event => onChange(field, event.target.value)}
    />
  );

  return (
    <fieldset disabled={disabled} className="min-w-0 grid gap-4 border-t border-[var(--border)] pt-3" data-transfer-config>
      <legend className="sr-only">Datos para recibir transferencias bancarias</legend>
      <p className="text-xs text-[var(--muted-foreground)]">
        Datos bancarios que se mostrarán al comprador para realizar la transferencia.
      </p>
      {(legacyBank || legacyType) && (
        <Alert variant="info">Conservamos tu configuración anterior. Para actualizar los datos bancarios, selecciona un banco y un tipo de cuenta del listado.</Alert>
      )}
      <div className="grid gap-2">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Cuenta de destino</h3>
        <div className="grid min-w-0 sm:grid-cols-2 gap-3">
          <Select
            id="transfer-bank_name"
            label="Banco *"
            value={bank?.name ?? bankName}
            required
            error={errors.bank_name}
            options={[
              { value: '', label: 'Selecciona un banco' },
              ...(legacyBank ? [{ value: bankName, label: `${bankName} (configuración anterior)` }] : []),
              ...transferBanks.map(item => ({ value: item.name, label: item.name })),
            ]}
            onChange={event => onChange('bank_name', event.target.value)}
          />
          <Select
            id="transfer-account_type"
            label="Tipo de cuenta *"
            value={accountType}
            required
            disabled={!bank}
            error={errors.account_type}
            options={[
              { value: '', label: bank ? 'Selecciona un tipo de cuenta' : 'Primero selecciona un banco' },
              ...(legacyType ? [{ value: accountType, label: `${accountType} (configuración anterior)` }] : []),
              ...(bank?.account_types ?? []).map(type => ({ value: type, label: type })),
            ]}
            onChange={event => onChange('account_type', event.target.value)}
          />
          {renderInput('account_number')}
        </div>
      </div>
      <div className="grid gap-2">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Datos del titular</h3>
        <div className="grid min-w-0 sm:grid-cols-2 gap-3">
          {renderInput('holder_name')}
          {renderInput('holder_rut')}
          {renderInput('confirmation_email')}
        </div>
      </div>
      <Textarea
        id="transfer-instructions"
        label="Instrucciones para la transferencia (opcional)"
        value={fields.instructions ?? ''}
        placeholder="Ej. Indica el número de pedido en el asunto de la transferencia."
        rows={2}
        maxLength={1000}
        error={errors.instructions}
        onChange={event => onChange('instructions', event.target.value)}
      />
    </fieldset>
  );
}
