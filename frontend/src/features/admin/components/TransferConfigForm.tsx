import { Alert, Input, Select, Textarea } from './ui';
import { findTransferBank, transferBanks, transferFieldLabels } from '../services/transferValidation';

interface Props {
  fields: Record<string, string>;
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (field: string, value: string) => void;
}

const fieldHints: Record<string, { hint: string; placeholder: string; maxLength: number }> = {
  account_number: { hint: 'Copia el número desde tu banco. Usa solo dígitos y conserva los ceros iniciales.', placeholder: 'Ej. 00123456789', maxLength: 24 },
  holder_name: { hint: 'Nombre completo o razón social de quien es titular de la cuenta.', placeholder: 'Ej. María González Pérez', maxLength: 150 },
  holder_rut: { hint: 'RUT de la persona o empresa titular, con dígito verificador. Se admiten puntos y K.', placeholder: 'Ej. 12.345.678-5', maxLength: 12 },
  confirmation_email: { hint: 'Correo donde recibirás los comprobantes de tus clientes.', placeholder: 'Ej. pagos@mitienda.cl', maxLength: 254 },
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
      persistentHint
      {...fieldHints[field]}
      hint={field === 'account_number' && accountType === 'CuentaRUT'
        ? 'Para CuentaRUT, usa el RUT del titular sin puntos ni dígito verificador.' : fieldHints[field].hint}
      onChange={event => onChange(field, event.target.value)}
    />
  );

  return (
    <fieldset disabled={disabled} className="min-w-0 grid gap-5 border-t border-[var(--border)] pt-4" data-transfer-config>
      <legend className="sr-only">Datos para recibir transferencias bancarias</legend>
      <p className="text-sm text-[var(--muted-foreground)]">
        Estos datos se mostrarán al cliente para transferir a tu cuenta. Los campos con * son obligatorios.
      </p>
      {(legacyBank || legacyType) && (
        <Alert variant="info">Conservamos tu configuración anterior. Para actualizar los datos bancarios, selecciona un banco y un tipo de cuenta del listado.</Alert>
      )}
      <div className="grid gap-3">
        <h3 className="text-sm font-semibold">1. Cuenta de destino</h3>
        <div className="grid min-w-0 sm:grid-cols-2 gap-4">
          <Select
            id="transfer-bank_name"
            label="Banco *"
            value={bank?.name ?? bankName}
            required
            error={errors.bank_name}
            persistentHint
            hint="Selecciona la entidad donde está abierta tu cuenta."
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
            persistentHint
            hint={bank?.code === '012' ? 'CuentaRUT es una cuenta vista de BancoEstado.' : 'Elige el tipo que aparece en tu cartola. CuentaRUT solo está disponible en BancoEstado.'}
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
      <div className="grid gap-3">
        <h3 className="text-sm font-semibold">2. Datos del titular</h3>
        <div className="grid min-w-0 sm:grid-cols-2 gap-4">
          {renderInput('holder_name')}
          {renderInput('holder_rut')}
          {renderInput('confirmation_email')}
        </div>
      </div>
      <Textarea
        id="transfer-instructions"
        label="Instrucciones de conciliación (opcional)"
        value={fields.instructions ?? ''}
        placeholder="Ej. Indica el número de pedido en el comentario de la transferencia."
        rows={3}
        maxLength={1000}
        error={errors.instructions}
        persistentHint
        hint="Agrega indicaciones para identificar los pagos. Máximo 1000 caracteres."
        onChange={event => onChange('instructions', event.target.value)}
      />
    </fieldset>
  );
}
