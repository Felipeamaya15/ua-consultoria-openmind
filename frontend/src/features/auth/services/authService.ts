import { ApiError, requestEnvelope } from '../../../shared/services/apiRequest';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const TOKEN_KEY = 'token';
const SESSION_STARTED_AT_KEY = 'entrepreneur_session_started_at';
const SESSION_LAST_ACTIVITY_KEY = 'session_last_activity_at';
const SESSION_IS_ADMIN_KEY = 'session_is_admin';

export const ADMIN_SESSION_INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 minutos de inactividad para administradores
export const CUSTOMER_SESSION_INACTIVITY_LIMIT_MS = 30 * 24 * 60 * 60 * 1000; // 30 días para clientes finales (expiración prolongada: 7 a 30 días)
export const SESSION_INACTIVITY_LIMIT_MS = ADMIN_SESSION_INACTIVITY_LIMIT_MS; // Compatibilidad con pruebas previas

export type AuthUserSummary = {
  id?: number | string;
  email?: string;
  username?: string;
  is_staff?: boolean;
  is_superuser?: boolean;
  is_store_owner?: boolean;
  [key: string]: unknown;
};

export type CustomerProfile = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  postal_code?: string;
};

export type CaptchaChallenge = {
  captcha_token: string;
  captcha_image: string;
  expires_in: number;
};

export type MfaSetupData = {
  secret: string;
  otpauth_url: string;
  issuer: string;
  account: string;
  period: number;
  digits: number;
};

function safeSetStorage(key: string, value: string) {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
      localStorage.setItem(key, value);
    }
  } catch {
    // Entornos sin almacenamiento disponible
  }
}

function safeRemoveStorage(key: string) {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
      localStorage.removeItem(key);
    }
    if (typeof sessionStorage !== 'undefined' && typeof sessionStorage.removeItem === 'function') {
      sessionStorage.removeItem(key);
    }
  } catch {
    // Ignorar errores de almacenamiento restringido
  }
}

export function isSessionAdmin(): boolean {
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
      return true;
    }
    const val = localStorage.getItem(SESSION_IS_ADMIN_KEY);
    if (val === 'false') return false;
    if (val === 'true') return true;
    if (typeof window !== 'undefined' && window.location?.pathname?.startsWith('/emprendedor')) {
      return true;
    }
    return true;
  } catch {
    return true;
  }
}

export function getSessionInactivityLimitMs(): number {
  return isSessionAdmin()
    ? ADMIN_SESSION_INACTIVITY_LIMIT_MS
    : CUSTOMER_SESSION_INACTIVITY_LIMIT_MS;
}

function isInactivityExpired(): boolean {
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
      return false;
    }
    const raw = localStorage.getItem(SESSION_LAST_ACTIVITY_KEY);
    if (!raw || raw.length < 10) return false;
    const ts = Date.parse(raw);
    if (Number.isNaN(ts)) return false;
    return Date.now() - ts > getSessionInactivityLimitMs();
  } catch {
    return false;
  }
}

function touchActivity() {
  safeSetStorage(SESSION_LAST_ACTIVITY_KEY, new Date().toISOString());
}

let lastThrottledTouch = 0;
function throttledTouchActivity() {
  const now = Date.now();
  if (now - lastThrottledTouch > 2000) {
    lastThrottledTouch = now;
    if (getStoredToken()) {
      touchActivity();
    }
  }
}

// Inicialización de reinicio de temporizador ante clics, navegación y llamadas a la API
let activityListenersInitialized = false;
export function initActivityListeners(): void {
  if (activityListenersInitialized) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  activityListenersInitialized = true;

  const interactionEvents = ['click', 'keydown', 'scroll', 'touchstart', 'mousedown'];
  interactionEvents.forEach((evt) => {
    try {
      window.addEventListener(evt, throttledTouchActivity, { passive: true });
    } catch {}
  });

  try {
    window.addEventListener('popstate', () => {
      if (getStoredToken()) touchActivity();
    });
    window.addEventListener('hashchange', () => {
      if (getStoredToken()) touchActivity();
    });
  } catch {}

  if (typeof window.history !== 'undefined') {
    const originalPush = window.history.pushState;
    if (typeof originalPush === 'function') {
      window.history.pushState = function (...args) {
        if (getStoredToken()) touchActivity();
        return originalPush.apply(this, args);
      };
    }
    const originalReplace = window.history.replaceState;
    if (typeof originalReplace === 'function') {
      window.history.replaceState = function (...args) {
        if (getStoredToken()) touchActivity();
        return originalReplace.apply(this, args);
      };
    }
  }

  if (typeof window.fetch === 'function') {
    const nativeFetch = window.fetch;
    window.fetch = function (...args) {
      if (getStoredToken()) {
        throttledTouchActivity();
      }
      return nativeFetch.apply(this, args);
    };
  }
}

initActivityListeners();

function getStoredToken() {
  if (isInactivityExpired()) {
    clearStoredSession();
    return null;
  }
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

function clearStoredSession() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  safeRemoveStorage(SESSION_STARTED_AT_KEY);
  safeRemoveStorage(SESSION_LAST_ACTIVITY_KEY);
  safeRemoveStorage(SESSION_IS_ADMIN_KEY);
}

async function profileRequest<T = CustomerProfile>(path: string, method = 'GET', data?: unknown, base = 'perfil', namespace = 'auth'): Promise<{ data: T }> {
  const token = getStoredToken();
  if (!token) throw new Error('Inicia sesión para acceder a tu perfil.');
  touchActivity();
  try { return await requestEnvelope(`${API_URL}/api/${namespace ? namespace + '/' : ''}${base}/${path}`, {
    method,
    headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  }) as { data: T }; } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401 && getStoredToken() === token) clearStoredSession();
    throw cause;
  }
}

export type CustomerOrderItem = { id_item_pedido: number; producto_id: number | string; nombre: string; cantidad: number; precio_unitario: string; subtotal: string; sku?: string; atributos_variante?: {clave: string; etiqueta: string; valor: string}[] };
export type CustomerOrder = { id_pedido: number; identificador?: string; fecha_creacion: string; estado: string; estado_etiqueta: string; medio_pago?: string; vence_en?: string | null; monto_total: string; cantidad_productos: number; costo_envio?: string; descuento?: string; items?: CustomerOrderItem[]; entrega?: { retiro?: { seleccion?: { fecha: string; hora: string } } } };

export const authService = {
  getToken() {
    return getStoredToken();
  },
  hasSession() {
    return !!getStoredToken();
  },
  isSessionAdmin() {
    return isSessionAdmin();
  },
  getInactivityLimitMs() {
    return getSessionInactivityLimitMs();
  },
  setSession(token: string, user?: AuthUserSummary | null) {
    const nowIso = new Date().toISOString();
    safeSetStorage(TOKEN_KEY, token);
    safeSetStorage(SESSION_STARTED_AT_KEY, nowIso);
    safeSetStorage(SESSION_LAST_ACTIVITY_KEY, nowIso);
    if (user !== undefined && user !== null) {
      const isAdmin = Boolean(user.is_staff || user.is_superuser || user.is_store_owner);
      safeSetStorage(SESSION_IS_ADMIN_KEY, isAdmin ? 'true' : 'false');
    } else {
      // Si no se especifica usuario, asume política de administración (30 min) por defecto seguro
      if (typeof localStorage !== 'undefined' && localStorage.getItem(SESSION_IS_ADMIN_KEY) === null) {
        safeSetStorage(SESSION_IS_ADMIN_KEY, 'true');
      }
    }
  },
  touchActivity() {
    if (getStoredToken()) {
      touchActivity();
    }
  },
  getSessionStartedAt() {
    return localStorage.getItem(SESSION_STARTED_AT_KEY);
  },
  async getCustomerOrders(): Promise<CustomerOrder[]> { return (await profileRequest<CustomerOrder[]>('', 'GET', undefined, 'mi-cuenta/pedidos', '')).data; },
  async getCustomerOrder(id: string): Promise<CustomerOrder> {
    if (!/^\d+$/.test(id)) throw new Error('Pedido no encontrado.');
    return (await profileRequest<CustomerOrder>(`${id}/`, 'GET', undefined, 'mi-cuenta/pedidos', '')).data;
  },
  async getEntrepreneurProfile(): Promise<CustomerProfile> { return (await profileRequest('', 'GET', undefined, 'emprendedor/perfil')).data; },
  async updateEntrepreneurProfile(email: string): Promise<CustomerProfile> {
    return (await profileRequest('', 'PATCH', {email}, 'emprendedor/perfil')).data;
  },
  async changeEntrepreneurPassword(current_password: string, new_password: string): Promise<void> {
    await profileRequest('password/', 'POST', {current_password, new_password}, 'emprendedor/perfil');
  },
  async getProfile(): Promise<CustomerProfile> { return (await profileRequest('')).data; },
  async updateProfile(data: Partial<CustomerProfile>): Promise<CustomerProfile> {
    return (await profileRequest('', 'PATCH', data)).data;
  },
  async changePassword(current_password: string, new_password: string): Promise<void> {
    await profileRequest('password/', 'POST', { current_password, new_password });
  },
  async getCaptcha(): Promise<CaptchaChallenge> {
    const res = await fetch(`${API_URL}/api/auth/captcha/`, {
      method: 'GET',
      credentials: 'omit',
    });
    if (!res.ok) throw await res.json();
    const body = await res.json();
    return body.data;
  },
  async register(data: any) {
    const res = await fetch(`${API_URL}/api/auth/register/`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw await res.json();
    const json = await res.json();
    if (json?.data?.token) {
      authService.setSession(json.data.token, json.data.user);
    }
    return json;
  },

  async login(data: any) {
    const res = await fetch(`${API_URL}/api/auth/login/`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw await res.json();
    const json = await res.json();
    if (json?.data?.token) {
      authService.setSession(json.data.token, json.data.user);
    }
    return json;
  },

  async verifyMfa(mfa_token: string, code: string) {
    const res = await fetch(`${API_URL}/api/auth/mfa/verify/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfa_token, code }),
    });
    if (!res.ok) throw await res.json();
    const json = await res.json();
    if (json?.data?.token) {
      authService.setSession(json.data.token, json.data.user);
    }
    return json;
  },

  async sendMfaEmailCode(mfa_token: string) {
    const res = await fetch(`${API_URL}/api/auth/mfa/send-email-code/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfa_token }),
    });
    if (!res.ok) throw await res.json();
    return res.json();
  },

  async getMfaStatus(): Promise<{ mfa_enabled: boolean; configured: boolean }> {
    return (await profileRequest<{ mfa_enabled: boolean; configured: boolean }>('status/', 'GET', undefined, 'mfa')).data;
  },

  async setupMfa(): Promise<MfaSetupData> {
    return (await profileRequest<MfaSetupData>('setup/', 'POST', {}, 'mfa')).data;
  },

  async enableMfa(code: string): Promise<{ mfa_enabled: boolean }> {
    return (await profileRequest<{ mfa_enabled: boolean }>('enable/', 'POST', { code }, 'mfa')).data;
  },

  async disableMfa(password: string): Promise<{ mfa_enabled: boolean }> {
    return (await profileRequest<{ mfa_enabled: boolean }>('disable/', 'POST', { password }, 'mfa')).data;
  },

  async requestPasswordReset(email: string, template = 1) {
    const res = await fetch(`${API_URL}/api/auth/password-reset/request/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, template }),
    });
    if (!res.ok) throw await res.json();
    return res.json();
  },

  async confirmPasswordReset(token: string, new_password: string) {
    const res = await fetch(`${API_URL}/api/auth/password-reset/confirm/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password }),
    });
    if (!res.ok) throw await res.json();
    return res.json();
  },

  async googleLogin(token: string) {
    const res = await fetch(`${API_URL}/api/auth/google/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) throw await res.json();
    const json = await res.json();
    if (json?.data?.token) {
      authService.setSession(json.data.token, json.data.user);
    }
    return json;
  },

  async getMe() {
    const token = authService.getToken();
    if (!token) return null;

    const res = await fetch(`${API_URL}/api/auth/me/`, {
      credentials: 'include',
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) {
      if (res.status === 401) clearStoredSession(); // Solo invalida sesiones rechazadas por autenticación.
      return null;
    }
    const json = await res.json();
    if (json?.data) {
      const isAdmin = Boolean(json.data.is_staff || json.data.is_superuser || json.data.is_store_owner);
      safeSetStorage(SESSION_IS_ADMIN_KEY, isAdmin ? 'true' : 'false');
    }
    touchActivity();
    return json;
  },

  logout() {
    const token = getStoredToken();
    clearStoredSession();
    try {
      if (typeof fetch === 'function') {
        void fetch(`${API_URL}/api/auth/logout/`, {
          method: 'POST',
          credentials: 'include',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Token ${token}` } : {}),
          },
        }).catch(() => {});
      }
    } catch {
      // Ignorar en entornos de prueba sin red
    }
  }
};
