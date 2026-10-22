export interface GoogleAnalyticsIdValidation {
  valid: boolean;
  measurementId: string;
  error?: string;
}

/**
 * Normaliza y valida un identificador de medición de un flujo web de GA4.
 * Un valor vacío es válido porque la integración es opcional.
 */
export function validateGoogleAnalyticsId(value: unknown): GoogleAnalyticsIdValidation {
  if (value === null || value === undefined) {
    return { valid: true, measurementId: '' };
  }

  const measurementId = String(value).trim().toUpperCase();
  if (!measurementId) {
    return { valid: true, measurementId: '' };
  }

  if (!measurementId.startsWith('G-')) {
    return {
      valid: false,
      measurementId,
      error: 'El identificador de Google Analytics debe comenzar con G-.',
    };
  }

  if (!/^G-[A-Z0-9]{4,20}$/.test(measurementId)) {
    return {
      valid: false,
      measurementId,
      error: 'Ingresa un identificador de medición GA4 válido, sin espacios ni símbolos.',
    };
  }

  return { valid: true, measurementId };
}
