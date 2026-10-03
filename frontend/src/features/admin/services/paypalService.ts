import { ConfiguracionPayPal, ConfiguracionPayPalInput } from '../types/paypal.types';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

export const paypalService = {
  async obtenerConfiguracion(idTienda: number = 1): Promise<ConfiguracionPayPal> {
    const res = await fetch(`${API_BASE}/api/catalog/tiendas/${idTienda}/configuracion/paypal/`);
    const json = await res.json();
    if (!res.ok || !json.exito) {
      throw new Error(json.mensaje || 'Error al obtener configuración de PayPal');
    }
    return json.data;
  },

  async guardarConfiguracion(idTienda: number = 1, data: ConfiguracionPayPalInput): Promise<ConfiguracionPayPal> {
    const res = await fetch(`${API_BASE}/api/catalog/tiendas/${idTienda}/configuracion/paypal/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok || !json.exito) {
      throw new Error(json.mensaje || 'Error al guardar credenciales de PayPal');
    }
    return json.data;
  },
};