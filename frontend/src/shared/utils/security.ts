/**
 * Validación estricta, sanitización de entradas, listas blancas (Allowlists)
 * y escape de datos contra XSS (Cross-Site Scripting) e inyecciones SQL.
 */

export const MAX_EMAIL_LENGTH = 254;
export const MAX_NAME_LENGTH = 150;
export const MAX_USERNAME_LENGTH = 150;
export const MAX_PHONE_LENGTH = 20;
export const MAX_POSTAL_CODE_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

// Expresiones regulares por Lista Blanca (Allowlists)
export const EMAIL_ALLOWLIST_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}$/;
export const PHONE_ALLOWLIST_REGEX = /^\+?[0-9 ()-]{7,20}$/;
// Código postal: lista blanca estricta que solo permite números y guiones
export const POSTAL_CODE_ALLOWLIST_REGEX = /^[0-9-]{3,12}$/;
// Nombre de persona: letras (incluyendo acentos y ñ), espacios, apóstrofes y guiones
export const PERSON_NAME_ALLOWLIST_REGEX = /^[a-zA-ZáéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜñÑçÇ\s'-]{1,150}$/;
// Código OTP / MFA: exclusivamente 6 dígitos numéricos
export const OTP_ALLOWLIST_REGEX = /^[0-9]{6}$/;
// Código CAPTCHA: exclusivamente caracteres alfanuméricos
export const CAPTCHA_ALLOWLIST_REGEX = /^[a-zA-Z0-9]{2,10}$/;

const SQL_INJECTION_REGEX = /(?:\b(?:UNION\s+(?:ALL\s+)?SELECT|SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+(?:TABLE|DATABASE)|ALTER\s+TABLE|EXEC(?:UTE)?\s+|SLEEP\s*\(|BENCHMARK\s*\(|WAITFOR\s+DELAY)\b|'\s*(?:OR|AND)\s*'?\d+'?\s*=\s*'?\d+|"\s*(?:OR|AND)\s*"?\d+"?\s*=\s*"?\d+|;\s*(?:DROP|DELETE|UPDATE|INSERT|ALTER|CREATE)\b|--\s*$|\/\*[\s\S]*?\*\/)/i;

/**
 * Transforma caracteres peligrosos en entidades HTML de texto plano para prevenir XSS.
 * Ejemplo: "<script>" -> "&lt;script&gt;"
 */
export function escapeHtml(value: string): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function containsSqlOrControlInjection(value: string): boolean {
  if (typeof value !== 'string') return false;
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) return true;
  return SQL_INJECTION_REGEX.test(value);
}

export function sanitizeTextInput(value: string, maxLength = 150): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim().slice(0, maxLength);
  return escapeHtml(trimmed);
}

export function isValidEmail(email: string): boolean {
  if (typeof email !== 'string') return false;
  const cleaned = email.trim();
  if (!cleaned || cleaned.length > MAX_EMAIL_LENGTH || containsSqlOrControlInjection(cleaned)) {
    return false;
  }
  if (cleaned.includes('..')) return false;
  return EMAIL_ALLOWLIST_REGEX.test(cleaned);
}

export function isValidPhone(phone: string): boolean {
  if (typeof phone !== 'string') return false;
  const cleaned = phone.trim();
  if (!cleaned) return true;
  if (cleaned.length > MAX_PHONE_LENGTH || !PHONE_ALLOWLIST_REGEX.test(cleaned)) {
    return false;
  }
  const digits = cleaned.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

export function isValidPostalCode(postalCode: string): boolean {
  if (typeof postalCode !== 'string') return false;
  const cleaned = postalCode.trim();
  if (!cleaned) return true;
  if (cleaned.length > MAX_POSTAL_CODE_LENGTH || !POSTAL_CODE_ALLOWLIST_REGEX.test(cleaned)) {
    return false;
  }
  return !cleaned.startsWith('-') && !cleaned.endsWith('-') && !cleaned.includes('--');
}

export function isValidPersonName(name: string): boolean {
  if (typeof name !== 'string') return false;
  const cleaned = name.trim();
  if (!cleaned || cleaned.length > MAX_NAME_LENGTH || containsSqlOrControlInjection(cleaned)) {
    return false;
  }
  return PERSON_NAME_ALLOWLIST_REGEX.test(cleaned);
}
