export const transferFieldLabels: Record<string, string> = {
  bank_name: 'Banco',
  account_type: 'Tipo de cuenta',
  account_number: 'N° de cuenta',
  holder_rut: 'RUT del titular',
  holder_name: 'Nombre del titular',
  confirmation_email: 'Correo para comprobantes',
};

export const transferRequiredFields = Object.keys(transferFieldLabels);

export function hasTransferConfigurationData(fields: Record<string, string> | undefined) {
  return Object.values(fields ?? {}).some((value) => typeof value === 'string' && value.trim());
}

export function validateTransferFields(fields: Record<string, string> | undefined) {
  const missing = transferRequiredFields.filter((field) => !String(fields?.[field] ?? '').trim());
  const errors = Object.fromEntries(
    missing.map((field) => [field, `${transferFieldLabels[field]} es obligatorio.`]),
  );
  const labels = missing.map((field) => transferFieldLabels[field]);

  return {
    missing,
    errors,
    message: missing.length
      ? `Completa los siguientes datos obligatorios: ${labels.join(', ')}.`
      : '',
  };
}
