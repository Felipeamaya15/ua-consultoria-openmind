/**
 * Servicio de integración para Meta / Facebook Pixel.
 * Gestiona validación, inicialización del script oficial y eventos del e-commerce.
 */

declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
    __metaPixelId?: string;
    __metaPixelConsent?: 'granted' | 'revoked';
    __metaPixelLastPage?: string;
  }
}

export interface PixelValidationResult {
  valid: boolean;
  error?: string;
  pixelId: string;
}

/**
 * Valida el identificador de Meta/Facebook Pixel.
 * Acepta identificadores numéricos de 9 a 16 dígitos (estándar de Meta Pixel).
 * Un valor vacío es válido (indica píxel no configurado o eliminado).
 */
export function validatePixelId(value: unknown): PixelValidationResult {
  if (value === null || value === undefined) {
    return { valid: true, pixelId: '' };
  }

  const raw = String(value).trim();
  if (raw === '') {
    return { valid: true, pixelId: '' };
  }

  if (!/^\d+$/.test(raw)) {
    return {
      valid: false,
      error: 'El identificador de Meta/Facebook Pixel debe contener únicamente números.',
      pixelId: raw,
    };
  }

  if (raw.length < 9 || raw.length > 16) {
    return {
      valid: false,
      error: 'El identificador de Meta/Facebook Pixel debe contener entre 9 y 16 dígitos.',
      pixelId: raw,
    };
  }

  return { valid: true, pixelId: raw };
}

/**
 * Inicializa el script oficial de Meta / Facebook Pixel en el navegador.
 */
export function initMetaPixel(pixelIdInput: unknown): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  const { valid, pixelId } = validatePixelId(pixelIdInput);
  if (!valid || !pixelId) {
    return false;
  }

  // Evitar inicializaciones duplicadas para el mismo pixelId.
  if (window.__metaPixelId === pixelId && typeof window.fbq === 'function') {
    window.fbq('consent', 'grant');
    window.__metaPixelConsent = 'granted';
    return true;
  }

  // Configurar la cola estándar fbq si aún no existe
  if (!window.fbq) {
    const fbq: any = function (...args: any[]) {
      if (fbq.callMethod) {
        fbq.callMethod(...args);
      } else {
        fbq.queue.push(args);
      }
    };
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq = fbq;
  }

  // Insertar script oficial si no está en el DOM
  let script = document.getElementById('meta-pixel-script') as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.id = 'meta-pixel-script';
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    const firstScript = document.getElementsByTagName('script')[0];
    if (firstScript && firstScript.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.head.appendChild(script);
    }
  }

  try {
    window.fbq('consent', 'grant');
    window.fbq('init', pixelId);
    window.__metaPixelId = pixelId;
    window.__metaPixelConsent = 'granted';
    return true;
  } catch {
    return false;
  }
}

/** Revoca la medición y bloquea eventos posteriores hasta un nuevo consentimiento. */
export function revokeMetaPixelConsent(): void {
  if (typeof window === 'undefined') return;
  if (typeof window.fbq === 'function') {
    try { window.fbq('consent', 'revoke'); } catch { /* La tienda debe seguir operativa. */ }
  }
  window.__metaPixelConsent = 'revoked';
  window.__metaPixelLastPage = undefined;
}

/** Registra una vista por ruta en la navegación SPA, evitando duplicados. */
export function trackMetaPixelPageView(path: string): boolean {
  if (
    typeof window === 'undefined'
    || typeof window.fbq !== 'function'
    || window.__metaPixelConsent !== 'granted'
  ) return false;

  const page = String(path || '/').trim() || '/';
  if (window.__metaPixelLastPage === page) return false;

  try {
    window.fbq('track', 'PageView');
    window.__metaPixelLastPage = page;
    return true;
  } catch {
    return false;
  }
}

/**
 * Dispara un evento estándar o personalizado de Meta / Facebook Pixel.
 */
export function trackMetaPixelEvent(
  eventName: 'PageView' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase' | string,
  params?: Record<string, unknown>
): void {
  if (
    typeof window === 'undefined'
    || typeof window.fbq !== 'function'
    || window.__metaPixelConsent !== 'granted'
  ) {
    return;
  }

  try {
    if (params) {
      window.fbq('track', eventName, params);
    } else {
      window.fbq('track', eventName);
    }
  } catch {
    // Si la llamada al pixel falla, no debe bloquear el flujo del e-commerce
  }
}
