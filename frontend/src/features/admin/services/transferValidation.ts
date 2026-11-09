export const transferFieldLabels: Record<string, string> = {
  bank_name: 'Banco',
  account_type: 'Tipo de cuenta',
  account_number: 'N° de cuenta',
  holder_rut: 'RUT del titular',
  holder_name: 'Nombre del titular',
  confirmation_email: 'Correo para comprobantes',
};

export const transferRequiredFields = Object.keys(transferFieldLabels);

export interface TransferBank {
  code: string;
  name: string;
  aliases: string[];
  account_types: string[];
}

// Catálogo del panel, mantenido en código. Fuentes y alcance: SCRUM-510-configuracion-pagos.md.
const accountTypes = ['Cuenta corriente', 'Cuenta vista', 'Cuenta de ahorro'];
export const transferBanks: TransferBank[] = [
  { code: '001', name: 'Banco de Chile', aliases: ['Banco Chile', 'Banco Edwards', 'Banco Edwards Citi', 'CrediChile'] },
  { code: '009', name: 'Banco Internacional', aliases: [] },
  { code: '012', name: 'BancoEstado', aliases: ['Banco Estado', 'Banco del Estado de Chile'] },
  { code: '014', name: 'Scotiabank', aliases: ['Scotiabank Chile', 'Banco del Desarrollo'] },
  { code: '016', name: 'BCI', aliases: ['Banco BCI', 'Banco de Crédito e Inversiones', 'TBanc', 'Banco Nova'] },
  { code: '028', name: 'Banco BICE', aliases: ['BICE'] },
  { code: '031', name: 'HSBC Bank Chile', aliases: ['HSBC', 'HSBC Bank (Chile)'] },
  { code: '037', name: 'Banco Santander', aliases: ['Santander', 'Banco Santander-Chile', 'Santander Chile'] },
  { code: '039', name: 'Banco Itaú', aliases: ['Itaú', 'Banco Itaú Chile', 'Itaú Corpbanca', 'Corpbanca'] },
  { code: '041', name: 'JP Morgan Chase Bank', aliases: ['JP Morgan'] },
  { code: '051', name: 'Banco Falabella', aliases: ['Falabella'] },
  { code: '053', name: 'Banco Ripley', aliases: ['Ripley'] },
  { code: '055', name: 'Banco Consorcio', aliases: ['Consorcio'] },
  { code: '059', name: 'Banco BTG Pactual', aliases: ['BTG Pactual', 'Banco BTG Pactual Chile'] },
  { code: '060', name: 'China Construction Bank', aliases: [] },
  { code: '061', name: 'Bank of China', aliases: [] },
  { code: '062', name: 'Tanner Banco Digital', aliases: [] },
  { code: '063', name: 'Tenpo Bank Chile', aliases: [] },
].map(bank => ({ ...bank, account_types: [...accountTypes, ...(bank.code === '012' ? ['CuentaRUT'] : [])] }));

const normalized = (value: string) => value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function findTransferBank(name: string, banks: TransferBank[]) {
  return banks.find(bank => [bank.name, ...bank.aliases].some(alias => normalized(alias) === normalized(name)));
}

export function validRut(value: string) {
  if (!/^(?:[1-9][0-9]{6,7}|[1-9][0-9]?\.[0-9]{3}\.[0-9]{3})-?[0-9kK]$/.test(value)) return false;
  const compact = value.replace(/[.-]/g, '').toUpperCase();
  const sum = [...compact.slice(0, -1)].reverse().reduce((total, digit, index) => total + Number(digit) * (2 + index % 6), 0);
  const check = 11 - sum % 11;
  return compact.slice(-1) === (check === 11 ? '0' : check === 10 ? 'K' : String(check));
}

export function hasTransferConfigurationData(fields: Record<string, string> | undefined) {
  return Object.values(fields ?? {}).some((value) => typeof value === 'string' && value.trim());
}

export function validateTransferFields(fields: Record<string, string> | undefined, banks: TransferBank[] = transferBanks) {
  const missing = transferRequiredFields.filter((field) => !String(fields?.[field] ?? '').trim());
  const errors = Object.fromEntries(
    missing.map((field) => [field, `${transferFieldLabels[field]} es obligatorio.`]),
  );
  const value = (key: string) => String(fields?.[key] ?? '').trim();
  const bank = findTransferBank(value('bank_name'), banks);
  if (!errors.bank_name && !bank) errors.bank_name = 'Selecciona un banco del listado disponible.';
  if (!errors.account_type && !bank?.account_types.includes(value('account_type'))) {
    errors.account_type = 'Selecciona un tipo de cuenta válido para el banco.';
  }
  if (!errors.account_number && (!/^[0-9]{1,24}$/.test(value('account_number')) || /^0+$/.test(value('account_number')))) {
    errors.account_number = 'Ingresa hasta 24 dígitos, sin puntos, espacios ni guiones. El número debe ser distinto de cero.';
  }
  if (!errors.holder_rut && !validRut(value('holder_rut'))) errors.holder_rut = 'Ingresa un RUT válido con su dígito verificador, por ejemplo 12.345.678-5.';
  if (!errors.holder_name && (value('holder_name').length < 2 || value('holder_name').length > 150 || !/\p{L}/u.test(value('holder_name')))) {
    errors.holder_name = 'Ingresa el nombre o razón social del titular, entre 2 y 150 caracteres.';
  }
  if (!errors.confirmation_email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value('confirmation_email')) || value('confirmation_email').length > 254)) {
    errors.confirmation_email = 'Ingresa un correo válido para recibir comprobantes.';
  }
  if ((fields?.instructions?.length ?? 0) > 1000) errors.instructions = 'Las instrucciones admiten hasta 1000 caracteres.';
  if (value('account_type') === 'CuentaRUT' && !errors.holder_rut && !errors.account_number &&
      value('account_number') !== value('holder_rut').replace(/[.-]/g, '').slice(0, -1)) {
    errors.account_number = 'Para CuentaRUT, ingresa el RUT del titular sin puntos ni dígito verificador.';
  }
  const invalidFields = Object.keys(errors);

  return {
    missing,
    invalidFields,
    errors,
    message: invalidFields.length
      ? `Revisa los siguientes datos de transferencia: ${invalidFields.map(field => transferFieldLabels[field] ?? 'Instrucciones').join(', ')}.`
      : '',
  };
}
