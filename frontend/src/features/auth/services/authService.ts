const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export type CustomerProfile = { first_name: string; last_name: string; email: string; phone: string };

async function profileRequest(path: string, method = 'GET', data?: unknown) {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Inicia sesión para acceder a tu perfil.');
  const res = await fetch(`${API_URL}/api/auth/perfil/${path}`, {
    method,
    headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const body = await res.json();
  if (!res.ok || body.exito !== true) {
    const details = body.error?.detalles;
    const message = details ? Object.values(details).flat().join(' ') : body.mensaje || body.detail;
    throw new Error(message || 'No se pudo completar la solicitud.');
  }
  return body;
}

export const authService = {
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
    const token = localStorage.getItem('token');
    if (!token) return null;

    const res = await fetch(`${API_URL}/api/auth/me/`, {
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) {
      if (res.status === 401) localStorage.removeItem('token'); // Solo invalida sesiones rechazadas por autenticación.
      return null;
    }
    return res.json();
  },

  logout() {
    localStorage.removeItem('token');
    }
};