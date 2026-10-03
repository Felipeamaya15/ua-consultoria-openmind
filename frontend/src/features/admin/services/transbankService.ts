import { TransbankConfig, GuardarTransbankDTO, ApiResponse } from '../types/transbank.types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const getHeaders = () => {
  // 1. Intenta leer el token del usuario que inició sesión
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // 2. Si hay token, lo adjunta a la llamada
  if (token) {
    headers['Authorization'] = `Token ${token}`;
  }

  return headers;
};

export const transbankService = {
  async obtenerConfiguracion(idTienda: number | string): Promise<ApiResponse<TransbankConfig>> {
    const res = await fetch(`${API_BASE}/api/catalog/tiendas/${idTienda}/configuracion/transbank/`, {
      method: 'GET',
      headers: getHeaders(),
    });
    return res.json();
  },

  async guardarConfiguracion(
    idTienda: number | string,
    data: GuardarTransbankDTO
  ): Promise<ApiResponse<TransbankConfig>> {
    const res = await fetch(`${API_BASE}/api/catalog/tiendas/${idTienda}/configuracion/transbank/`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    return res.json();
  },
};