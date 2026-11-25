export const linkifyRequiredFields = ['idCuenta', 'clavePrivada'];

const labels: Record<string, string> = {
  idCuenta: 'ID de cuenta',
  clavePrivada: 'Clave privada',
  environment: 'Ambiente',
  expirationHours: 'Vencimiento del link',
  returnUrl: 'URL de retorno',
  notificationEmail: 'Correo de notificaciones',
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function hasLinkifyCredentialData(fields: Record<string, string> | undefined) {
  return linkifyRequiredFields.some((field) => String(fields?.[field] ?? '').trim());
}

export function validateLinkifyFields(fields: Record<string, string> | undefined) {
  const values = fields ?? {};
  const errors: Record<string, string> = {};

  for (const field of linkifyRequiredFields) {
    if (!String(values[field] ?? '').trim()) {
      errors[field] = field === 'clavePrivada'
        ? 'Clave privada es obligatoria.'
        : `${labels[field]} es obligatorio.`;
    }
  }

  if (String(values.idCuenta ?? '').length > 200) {
    errors.idCuenta = 'ID de cuenta no puede superar 200 caracteres.';
  }
  if (String(values.clavePrivada ?? '').length > 500) {
    errors.clavePrivada = 'Clave privada no puede superar 500 caracteres.';
  }

  const environment = values.environment ?? 'sandbox';
  if (!['sandbox', 'production'].includes(environment)) {
    errors.environment = 'Selecciona un ambiente válido.';
  }

  const expiration = values.expirationHours ?? '48';
  if (!/^\d+$/.test(expiration) || Number(expiration) < 1 || Number(expiration) > 8760) {
    errors.expirationHours = 'Ingresa un número entero entre 1 y 8760 horas.';
  }

  if (values.returnUrl) {
    try {
      const url = new URL(values.returnUrl);
      if (url.protocol !== 'https:') errors.returnUrl = 'La URL de retorno debe usar HTTPS.';
    } catch {
      errors.returnUrl = 'Ingresa una URL de retorno válida.';
    }
  }

  if (values.notificationEmail && !emailPattern.test(values.notificationEmail)) {
    errors.notificationEmail = 'Ingresa un correo de notificaciones válido.';
  }

  for (const field of ['syncApprovedPayments', 'emailCustomer', 'autoExpireLinks']) {
    if (values[field] !== undefined && !['true', 'false'].includes(values[field])) {
      errors[field] = 'El valor debe ser verdadero o falso.';
    }
  }

  const invalidFields = Object.keys(errors);
  return {
    errors,
    invalidFields,
    message: invalidFields.length
      ? `Revisa los siguientes datos de Linkify: ${invalidFields.map((field) => labels[field] ?? field).join(', ')}.`
      : '',
  };
}
