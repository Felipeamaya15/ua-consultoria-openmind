const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

export interface EventoSeguimiento {
  fecha_hora: string;
  estado: string;
  descripcion: string;
  ubicacion: string;
}

export interface DetalleSeguimiento {
  numero_seguimiento: string;
  proveedor: string;
  estado_actual: string;
  descripcion_estado: string;
  fecha_estimada_entrega: string;
  historial: EventoSeguimiento[];
}

export interface OpcionCotizacion {
  proveedor: string;
  servicio: string;
  costo: number;
  dias_habiles_entrega: number;
  es_cobertura_valida: boolean;
  es_gratis: boolean;
}

export interface ResultadoCotizacion {
  destino: {
    comuna: string;
    region: string;
  };
  total_items: number;
  total_carrito: number;
  opcion_recomendada: OpcionCotizacion | null;
  opciones: OpcionCotizacion[];
}

export interface CotizacionParams {
  region: string;
  comuna: string;
  total_carrito: number;
  total_items: number;
  peso_kg?: number;
  calle?: string;
  numero?: string;
  proveedor?: string;
}

export const shippingService = {
  async getTracking(numeroSeguimiento: string): Promise<DetalleSeguimiento> {
    const cleanTracking = numeroSeguimiento.trim();
    const response = await fetch(`${API_BASE}/api/logistica/seguimiento/${encodeURIComponent(cleanTracking)}/`);
    const data = await response.json();
    if (!response.ok || !data.exito) {
      throw new Error(data.mensaje || 'No se encontró información de seguimiento para este código.');
    }
    return data.data;
  },

  async quote(params: CotizacionParams): Promise<ResultadoCotizacion> {
    const response = await fetch(`${API_BASE}/api/logistica/cotizar/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...params,
        total_carrito: Number(params.total_carrito || 0).toFixed(2),
        proveedor: params.proveedor || 'todos',
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.exito) {
      throw new Error(data.mensaje || 'Error al cotizar envío.');
    }
    return data.data;
  },

  /**
   * Implementa la solicitud de cotización a Chilexpress
   */
  async quoteChilexpress(params: Omit<CotizacionParams, 'proveedor'>): Promise<ResultadoCotizacion> {
    const response = await fetch(`${API_BASE}/api/logistica/cotizar/chilexpress/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...params,
        total_carrito: Number(params.total_carrito || 0).toFixed(2),
        proveedor: 'chilexpress',
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.exito) {
      throw new Error(data.mensaje || 'Error al cotizar con Chilexpress.');
    }
    return data.data;
  },

  /**
   * Implementa la solicitud de cotización a Starken
   */
  async quoteStarken(params: Omit<CotizacionParams, 'proveedor'>): Promise<ResultadoCotizacion> {
    const response = await fetch(`${API_BASE}/api/logistica/cotizar/starken/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...params,
        total_carrito: Number(params.total_carrito || 0).toFixed(2),
        proveedor: 'starken',
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.exito) {
      throw new Error(data.mensaje || 'Error al cotizar con Starken.');
    }
    return data.data;
  },
};
