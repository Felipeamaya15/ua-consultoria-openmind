const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const TOKEN_KEY = 'token';
const SESSION_STARTED_AT_KEY = 'entrepreneur_session_started_at';

export type CustomerProfile = { first_name: string; last_name: string; email: string; phone: string };

function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

function clearStoredSession() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SESSION_STARTED_AT_KEY);
}

async function profileRequest(path: string, method = 'GET', data?: unknown, base = 'perfil', namespace = 'auth') {
  const token = getStoredToken();
  if (!token) throw new Error('Inicia sesión para acceder a tu perfil.');
  const res = await fetch(`${API_URL}/api/${namespace ? namespace + '/' : ''}${base}/${path}`, {
    method,
    headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const body = await res.json();
  if (res.status === 401) clearStoredSession();
  if (!res.ok || body.exito !== true) {
    const details = body.error?.detalles;
    const message = details ? Object.values(details).flat().join(' ') : body.mensaje || body.detail;
    throw new Error(message || 'No se pudo completar la solicitud.');
  }
  return body;
}

export type CustomerOrderItem = { id_item_pedido: number; producto_id: number | string; nombre: string; cantidad: number; precio_unitario: string; subtotal: string; sku?: string; atributos_variante?: {clave: string; etiqueta: string; valor: string}[] };
export type CustomerOrder = { id_pedido: number; identificador?: string; fecha_creacion: string; estado: string; estado_etiqueta: string; monto_total: string; cantidad_productos: number; items?: CustomerOrderItem[] };

export const authService = {
  getToken() {
    return getStoredToken();
  },
  hasSession() {
    return !!getStoredToken();
  },
  setSession(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(SESSION_STARTED_AT_KEY, new Date().toISOString());
  },
  getSessionStartedAt() {
    return localStorage.getItem(SESSION_STARTED_AT_KEY);
  },
  async getCustomerOrders(): Promise<CustomerOrder[]> { return (await profileRequest('', 'GET', undefined, 'mi-cuenta/pedidos', '')).data; },
  async getCustomerOrder(id: string): Promise<CustomerOrder> {
    if (!/^\d+$/.test(id)) throw new Error('Pedido no encontrado.');
    return (await profileRequest(`${id}/`, 'GET', undefined, 'mi-cuenta/pedidos', '')).data;
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
  async register(data: any) {
    const res = await fetch(`${API_URL}/api/auth/register/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw await res.json();
    return res.json();
  },

  async login(data: any) {
    const res = await fetch(`${API_URL}/api/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw await res.json();
    return res.json();
  },

  async googleLogin(token: string) {
    const res = await fetch(`${API_URL}/api/auth/google/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) throw await res.json();
    return res.json();

  
  },
  async getMe() {
    const token = authService.getToken();
    if (!token) return null;

    const res = await fetch(`${API_URL}/api/auth/me/`, {
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) {
      if (res.status === 401) clearStoredSession(); // Solo invalida sesiones rechazadas por autenticación.
      return null;
    }
    return res.json();
  },

  logout() {
    clearStoredSession();
  }
};