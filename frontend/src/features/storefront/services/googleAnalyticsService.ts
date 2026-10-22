export interface GoogleAnalyticsIdValidation {
  valid: boolean;
  measurementId: string;
  error?: string;
}

type GtagArguments = [command: string, targetOrAction: string | Date, params?: Record<string, unknown>];

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: GtagArguments) => void;
    __googleAnalyticsId?: string;
  }
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

/** Carga el Google tag para la tienda pública después de obtener consentimiento. */
export function initGoogleAnalytics(value: unknown): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  const validation = validateGoogleAnalyticsId(value);
  if (!validation.valid || !validation.measurementId) return false;
  const measurementId = validation.measurementId;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function (...args: GtagArguments) {
    window.dataLayer?.push(args);
  };

  window.gtag('consent', 'update', { analytics_storage: 'granted' });
  if (window.__googleAnalyticsId === measurementId) return true;

  let script = document.getElementById('google-analytics-script') as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.id = 'google-analytics-script';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
  }

  window.gtag('js', new Date());
  window.gtag('config', measurementId, { send_page_view: true });
  window.__googleAnalyticsId = measurementId;
  return true;
}

/** Revoca la escritura de datos analíticos cuando se eligen sólo cookies necesarias. */
export function disableGoogleAnalytics(): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('consent', 'update', { analytics_storage: 'denied' });
}
